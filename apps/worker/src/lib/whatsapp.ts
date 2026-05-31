import makeWASocket, { DisconnectReason, useMultiFileAuthState, type AnyMessageContent, type WASocket } from '@whiskeysockets/baileys';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@marquee/db';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import { decryptWithSecret, encryptWithSecret } from './crypto.js';

type WhatsappStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED';

type AuthSnapshot = Record<string, string>;

type Session = {
  userId: string;
  authDir: string;
  status: WhatsappStatus;
  qrDataUrl: string | null;
  sock: WASocket | null;
  starting: Promise<Session> | null;
};

type SendArgs = {
  userId: string;
  mediaUrl: string;
  kind: 'image' | 'video';
  caption?: string;
};

const sessions = new Map<string, Session>();

export function createWhatsappDelivery(args: {
  supabase: SupabaseClient<Database>;
  outputsDir: string;
  jwtSecret: string;
  workerHttpUrl: string;
  r2PublicUrl: string;
}) {
  const deps = args;

  async function status(userId: string) {
    const session = sessions.get(userId);
    if (session) {
      return {
        status: session.status,
        qr_data_url: session.qrDataUrl,
        connected: session.status === 'CONNECTED',
      };
    }
    const row = await readAccount(deps.supabase, userId);
    return {
      status: row?.status ?? 'DISCONNECTED',
      phone_e164: row?.phone_e164 ?? null,
      display_name: row?.display_name ?? null,
      last_connected_at: row?.last_connected_at ?? null,
      last_send_at: row?.last_send_at ?? null,
      connected: row?.status === 'CONNECTED',
      qr_data_url: null,
    };
  }

  async function connect(userId: string) {
    const session = await ensureSession(deps, userId);
    await waitForReadySignal(session);
    return status(userId);
  }

  async function disconnect(userId: string) {
    const session = sessions.get(userId);
    if (session?.sock) {
      try { await session.sock.logout(); } catch {}
      try { session.sock.ws.close(); } catch {}
    }
    sessions.delete(userId);
    await rm(authDirFor(deps.outputsDir, userId), { recursive: true, force: true });
    await deps.supabase.rpc('disconnect_whatsapp_delivery_account', { p_user_id: userId });
    return status(userId);
  }

  async function send(args: SendArgs) {
    assertAllowedMediaUrl(deps, args.mediaUrl);
    const session = await ensureSession(deps, args.userId);
    await waitUntilConnected(session);
    if (!session.sock?.user?.id) throw new Error('WhatsApp is not connected');

    const jid = toPhoneJid(session.sock.user.id);
    const media = await fetchMedia(args.mediaUrl);
    const caption = args.caption?.slice(0, 900) ?? '';
    const content: AnyMessageContent = args.kind === 'video'
      ? { video: media.buffer, mimetype: media.contentType, caption, ptv: false }
      : { image: media.buffer, mimetype: media.contentType, caption };

    await session.sock.sendMessage(jid, content);
    await deps.supabase.rpc('mark_whatsapp_delivery_sent', { p_user_id: args.userId });
    return { ok: true };
  }

  return { status, connect, disconnect, send };
}

async function ensureSession(deps: Parameters<typeof createWhatsappDelivery>[0], userId: string) {
  const existing = sessions.get(userId);
  if (existing?.status === 'CONNECTED' || existing?.status === 'QR') return existing;
  if (existing?.starting) return existing.starting;

  const authDir = authDirFor(deps.outputsDir, userId);
  const session: Session = {
    userId,
    authDir,
    status: 'CONNECTING',
    qrDataUrl: null,
    sock: null,
    starting: null,
  };
  sessions.set(userId, session);

  session.starting = startSession(deps, session).finally(() => {
    session.starting = null;
  });
  return session.starting;
}

async function startSession(deps: Parameters<typeof createWhatsappDelivery>[0], session: Session) {
  await hydrateAuthDir(deps, session.userId, session.authDir);
  const { state, saveCreds } = await useMultiFileAuthState(session.authDir);
  const sock = makeWASocket({
    auth: state,
    browser: ['Marquee', 'Chrome', '1.0.0'],
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  session.sock = sock;

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await persistAuthDir(deps, session.userId, session.authDir, session.status);
  });

  sock.ev.on('connection.update', async (update) => {
    if (update.qr) {
      session.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
      session.status = 'QR';
      await deps.supabase.rpc('upsert_whatsapp_delivery_account', {
        p_user_id: session.userId,
        p_status: 'QR',
      });
    }

    if (update.connection === 'open') {
      session.status = 'CONNECTED';
      session.qrDataUrl = null;
      await persistAuthDir(deps, session.userId, session.authDir, 'CONNECTED');
    }

    if (update.connection === 'close') {
      const code = Number((update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode);
      session.sock = null;
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
        sessions.delete(session.userId);
        await rm(session.authDir, { recursive: true, force: true });
        await deps.supabase.rpc('disconnect_whatsapp_delivery_account', { p_user_id: session.userId });
        return;
      }
      session.status = 'DISCONNECTED';
      await deps.supabase.rpc('upsert_whatsapp_delivery_account', {
        p_user_id: session.userId,
        p_status: 'DISCONNECTED',
      });
    }
  });

  return session;
}

async function hydrateAuthDir(
  deps: Parameters<typeof createWhatsappDelivery>[0],
  userId: string,
  authDir: string,
) {
  await mkdir(authDir, { recursive: true });
  const hasLocal = (await readdir(authDir).catch(() => [])).length > 0;
  if (hasLocal) return;

  const row = await readAccount(deps.supabase, userId);
  if (!row?.session_enc) return;

  const snapshot = JSON.parse(decryptWithSecret(bufferFrom(row.session_enc), deps.jwtSecret)) as AuthSnapshot;
  for (const [name, base64] of Object.entries(snapshot)) {
    const safe = name.replace(/^(\.\.[/\\])+/, '');
    if (safe.startsWith('..')) continue;
    const target = join(authDir, safe);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(base64, 'base64'));
  }
}

async function persistAuthDir(
  deps: Parameters<typeof createWhatsappDelivery>[0],
  userId: string,
  authDir: string,
  status: WhatsappStatus,
) {
  const snapshot = await snapshotDir(authDir);
  const encrypted = encryptWithSecret(JSON.stringify(snapshot), deps.jwtSecret);
  const sock = sessions.get(userId)?.sock;
  const jid = sock?.user?.id;
  await deps.supabase.rpc('upsert_whatsapp_delivery_account', {
    p_user_id: userId,
    p_phone_e164: jid ? `+${jid.split(':')[0]?.split('@')[0] ?? ''}` : undefined,
    p_display_name: sock?.user?.name,
    p_jid: jid,
    p_session_enc: encrypted as never,
    p_status: status,
  });
}

async function snapshotDir(root: string): Promise<AuthSnapshot> {
  const out: AuthSnapshot = {};
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        out[relative(root, path)] = (await readFile(path)).toString('base64');
      }
    }
  }
  await walk(root);
  return out;
}

async function readAccount(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc('get_whatsapp_delivery_session_for_service', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

async function waitForReadySignal(session: Session) {
  for (let i = 0; i < 30; i += 1) {
    if (session.status === 'QR' || session.status === 'CONNECTED') return;
    await delay(250);
  }
}

async function waitUntilConnected(session: Session) {
  for (let i = 0; i < 80; i += 1) {
    if (session.status === 'CONNECTED' && session.sock?.user?.id) return;
    await delay(250);
  }
  throw new Error('WhatsApp is not connected');
}

async function fetchMedia(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > 25 * 1024 * 1024) throw new Error('media is too large for WhatsApp delivery');
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
}

function assertAllowedMediaUrl(deps: Parameters<typeof createWhatsappDelivery>[0], input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported media url');
  const worker = new URL(deps.workerHttpUrl);
  const allowedHost = url.host === worker.host && url.pathname.startsWith('/outputs/');
  const allowedR2 = deps.r2PublicUrl ? input.startsWith(deps.r2PublicUrl) : false;
  const allowedFal = url.protocol === 'https:' && url.hostname.endsWith('.fal.media');
  const allowedSupabase = url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
  const allowedR2Dev = url.protocol === 'https:' && url.hostname.endsWith('.r2.dev');
  if (!allowedHost && !allowedR2 && !allowedFal && !allowedSupabase && !allowedR2Dev) {
    throw new Error('media url is not from Marquee storage');
  }
}

function authDirFor(outputsDir: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('invalid user id');
  return join(outputsDir, '.whatsapp-auth', userId);
}

function toPhoneJid(jid: string) {
  const phone = jid.split(':')[0]?.split('@')[0];
  if (!phone) throw new Error('could not resolve own WhatsApp jid');
  return `${phone}@s.whatsapp.net`;
}

function bufferFrom(v: unknown): Buffer {
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === 'string') {
    const hex = v.startsWith('\\x') ? v.slice(2) : v;
    return Buffer.from(hex, 'hex');
  }
  const o = v as { type?: string; data?: number[] };
  if (o?.type === 'Buffer' && Array.isArray(o.data)) return Buffer.from(o.data);
  throw new Error('cannot coerce bytea to Buffer');
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
