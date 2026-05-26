import { Effect, Layer, Stream } from 'effect';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { AppConfig } from '../config.js';
import { JobStream } from './job-stream.js';
import { getSecret, verifyJobToken } from './auth.js';
import { encodeFrame, decodeFrame, PROTOCOL_VERSION, type HelloFrame, type PongFrame } from './protocol.js';

const WS_PREFIX = '/ws/jobs/';
const OUTPUTS_PREFIX = '/outputs/';

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.json': 'application/json', '.txt': 'text/plain',
};

export const WsServerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const stream = yield* JobStream;
    const secret = getSecret(cfg.jwtSecret);

    const http = createServer((req, res) => handleHttp(req, res, cfg.outputsDir));
    const wss = new WebSocketServer({ noServer: true });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const client of wss.clients) {
          try { client.terminate(); } catch {}
        }
        wss.close();
        http.close();
      }),
    );

    http.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (!url.pathname.startsWith(WS_PREFIX)) {
        return rejectUpgrade(socket, 404, 'not found');
      }
      const jobId = url.pathname.slice(WS_PREFIX.length);
      const token = url.searchParams.get('token');
      const decoded = verifyJobToken(token, secret);
      if (!decoded || decoded.job_id !== jobId) {
        return rejectUpgrade(socket, 401, 'unauthorized');
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, jobId);
      });
    });

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage, jobId: string) => {
      void handleConnection(ws, jobId, stream).pipe(
        Effect.scoped,
        Effect.catchAllCause((cause) => Effect.logError('ws connection failed', cause)),
        Effect.runPromise,
      );
    });

    yield* Effect.async<void>((_resume) => {
      http.listen(cfg.wsPort, cfg.wsHost, () => {
        console.log(`[ws]   ws://${cfg.wsHost}:${cfg.wsPort}${WS_PREFIX}<job_id>`);
        console.log(`[http] http://${cfg.wsHost}:${cfg.wsPort}${OUTPUTS_PREFIX}<job_id>/<file>`);
      });
    }).pipe(Effect.fork);
  }),
);

function handleHttp(req: IncomingMessage, res: ServerResponse, outputsDir: string) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (!req.url) return res.writeHead(404).end();
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(OUTPUTS_PREFIX)) {
    return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
  const relative = url.pathname.slice(OUTPUTS_PREFIX.length);
  const safe = normalize(relative).replace(/^(\.\.[\/\\])+/, '');
  if (safe.startsWith('..')) return res.writeHead(400).end('bad path');
  const filePath = join(outputsDir, safe);
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return res.writeHead(404).end();
    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': 'public, max-age=60',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

function rejectUpgrade(socket: { write: (s: string) => void; destroy: () => void }, code: number, msg: string) {
  socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function handleConnection(ws: WebSocket, jobId: string, stream: JobStream) {
  return Effect.gen(function* () {
    const hub = yield* stream.getOrCreateHub(jobId);
    const sub = yield* hub.subscribe;

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        try { ws.close(1000); } catch {}
        yield* stream.removeHubIfEmpty(jobId);
      }),
    );

    const hello: HelloFrame = { v: PROTOCOL_VERSION, type: 'hello', job_id: jobId, replayed: 0 };
    yield* safeSend(ws, encodeFrame(hello));

    yield* Stream.fromQueue(sub).pipe(
      Stream.runForEach((frame) => safeSend(ws, encodeFrame(frame))),
      Effect.forkScoped,
    );

    yield* Effect.async<void>((resume) => {
      const onMessage = (data: Buffer) => {
        const inbound = decodeFrame(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        if (inbound?.type === 'ping') {
          const pong: PongFrame = { v: 1, type: 'pong', ts: Date.now() };
          try { ws.send(encodeFrame(pong)); } catch {}
        }
      };
      const onClose = () => resume(Effect.void);
      ws.on('message', onMessage);
      ws.on('close', onClose);
      ws.on('error', onClose);
    });
  });
}

const safeSend = (ws: WebSocket, data: Uint8Array) =>
  Effect.try({
    try: () => { if (ws.readyState === ws.OPEN) ws.send(data); },
    catch: () => undefined,
  }).pipe(Effect.ignore);
