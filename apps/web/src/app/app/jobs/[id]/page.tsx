import { notFound } from 'next/navigation';
import { requireUser, getSupabaseServer } from '@/lib/supabase/server';
import { mintJobToken, workerWsUrl } from '@/lib/ws-token';
import { Studio, type ConnectedSocialAccount, type InitialProgressEvent } from '@/components/app/studio';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) return notFound();

  const sb = await getSupabaseServer();
  const { data } = await sb.rpc('get_content_job', { p_job_id: id });
  const job = data?.[0];
  if (!job) return notFound();

  const { data: events } = await sb.rpc('get_job_events', { p_job_id: id });
  const initialEvents: InitialProgressEvent[] = (events ?? []).map((event) => ({
    job_id: id,
    step: event.step,
    message: event.message,
    progress: event.progress,
    payload: isPayloadRecord(event.payload) ? event.payload : null,
    ts: new Date(event.created_at).getTime(),
  }));

  const token = mintJobToken({ userId: user.id, jobId: id, ttlSeconds: 60 * 60 });
  const wsUrl = workerWsUrl(id, token);
  const { data: connectedRows } = await sb.rpc('get_connected_social_accounts', { p_brand_id: job.brand_id });
  const connectedAccounts = (connectedRows ?? []) satisfies ConnectedSocialAccount[];

  return <Studio job={job} wsUrl={wsUrl} initialEvents={initialEvents} connectedAccounts={connectedAccounts} />;
}

function isPayloadRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
