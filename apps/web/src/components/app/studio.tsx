'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ExternalLink, Loader2, Send, X } from 'lucide-react';
import { LIVE_SOCIAL_PLATFORMS, type LiveSocialPlatform, type SocialPlatformZ } from '@marquee/shared/schemas';
import { ProgressStep, type PlatformPostResult, type PostDonePayload, type PostStartPayload } from '@marquee/shared/progress';
import type { Database } from '@marquee/db';
import { PLATFORM_META } from '@/components/marquee/platform-icons';
import { useJobStream, type ProgressFrame } from '@/lib/use-job-stream';
import { cn } from '@/lib/cn';

type Job = Database['public']['Functions']['get_content_job']['Returns'][number];
export type ConnectedSocialAccount = Database['public']['Functions']['get_connected_social_accounts']['Returns'][number];
export type InitialProgressEvent = Omit<ProgressFrame, 'v'>;

type ApproveResponse = {
  ok?: boolean;
  error?: string;
  posted_to?: string[];
  failed?: string[];
  missing?: string[];
  results?: Record<string, PlatformPostResult>;
};

export function Studio({
  job,
  wsUrl,
  initialEvents,
  connectedAccounts,
}: {
  job: Job;
  wsUrl: string;
  initialEvents: InitialProgressEvent[];
  connectedAccounts: ConnectedSocialAccount[];
}) {
  const stream = useJobStream({ wsUrl, initialEvents });
  const router = useRouter();
  const [posting, startPost] = useTransition();
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<ApproveResponse | null>(null);
  const [localEvents, setLocalEvents] = useState<ProgressFrame[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<LiveSocialPlatform[]>(
    () => pickDefaultPlatforms(job.platforms, connectedAccounts),
  );

  const events = useMemo(
    () => [...stream.events, ...localEvents].sort((a, b) => a.ts - b.ts),
    [stream.events, localEvents],
  );
  const latestByStep = useMemo(() => latestMap(events), [events]);
  const liveStatus = useMemo(() => resolveStatus(job.status, latestByStep), [job.status, latestByStep]);

  const scriptLines = useMemo(() => events.filter((e) => e.step === ProgressStep.ScriptLine), [events]);
  const ttsChunks = useMemo(() => events.filter((e) => e.step === ProgressStep.TtsChunk), [events]);
  const assets = useMemo(() => events.filter((e) => e.step === ProgressStep.AssetFetch || e.step === 'asset:keyed'), [events]);
  const posterLayers = useMemo(() => events.filter((e) => e.step === ProgressStep.PosterLayer), [events]);
  const frames = useMemo(() => events.filter((e) => e.step === ProgressStep.RenderFrame), [events]);
  const artifacts = useMemo(() => events.filter((e) => e.step === ProgressStep.ArtifactCreate), [events]);
  const agentEvents = useMemo(() => events.filter((e) => e.step.startsWith('agent:')), [events]);
  const visionReviews = useMemo(() => events.filter((e) => e.step === ProgressStep.VisionReview), [events]);
  const latestBudget = agentEvents.findLast((e) => e.step === ProgressStep.AgentBudget) ?? null;

  const lastFrame = frames[frames.length - 1] ?? null;
  const lastPoster = posterLayers[posterLayers.length - 1] ?? null;
  const finalArtifact = artifacts.findLast((e) => payloadString(e, 'role') === 'final') ?? null;
  const draftArtifact = artifacts.findLast((e) => payloadString(e, 'role') === 'draft') ?? null;
  const previewUrl = payloadString(finalArtifact, 'thumbnail_url')
    ?? payloadString(finalArtifact, 'url')
    ?? payloadString(draftArtifact, 'thumbnail_url')
    ?? payloadString(draftArtifact, 'url')
    ?? payloadString(lastPoster, 'preview_url')
    ?? payloadString(lastFrame, 'thumbnail_url')
    ?? job.thumbnail_url
    ?? job.output_url
    ?? null;

  const connectedByPlatform = useMemo(() => {
    const map = new Map<LiveSocialPlatform, ConnectedSocialAccount>();
    for (const account of connectedAccounts) {
      if (isLivePlatform(account.platform) && account.is_active) map.set(account.platform, account);
    }
    return map;
  }, [connectedAccounts]);

  const canPost = liveStatus === 'REVIEW' && selectedPlatforms.length > 0 && selectedPlatforms.every((p) => connectedByPlatform.has(p));
  const isVideoLike = job.content_type === 'VIDEO' || job.content_type === 'REEL';
  const showScript = isVideoLike || scriptLines.length > 0;
  const showCats = isVideoLike || assets.length > 0;
  const showNarration = isVideoLike || ttsChunks.length > 0;

  function addLocalEvent(step: string, message: string, payload: Record<string, unknown> | null = null, progress: number | null = null) {
    setLocalEvents((current) => [
      ...current,
      {
        v: 1,
        job_id: job.id,
        step,
        message,
        progress,
        payload,
        ts: Date.now(),
      },
    ]);
  }

  function confirmPost() {
    if (!canPost) return;
    setPostError(null);
    setPostResult(null);
    const targets = selectedPlatforms;
    const startPayload: PostStartPayload = { platforms: targets };
    addLocalEvent(ProgressStep.PostStart, `Posting to ${targets.join(', ')}`, startPayload as unknown as Record<string, unknown>, 0.05);

    startPost(async () => {
      const res = await fetch(`/api/jobs/${job.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platforms: targets }),
      });
      const body = (await res.json().catch(() => ({}))) as ApproveResponse;
      setPostResult(body);

      const donePayload: PostDonePayload = {
        posted_to: body.posted_to ?? [],
        failed: body.failed ?? targets.map((p) => p.toLowerCase()),
        results: body.results ?? {},
      };
      addLocalEvent(
        ProgressStep.PostDone,
        res.ok
          ? `Posted to ${(body.posted_to ?? []).join(', ')}${body.failed?.length ? ` (failed: ${body.failed.join(', ')})` : ''}`
          : body.error ?? 'Posting failed',
        donePayload as unknown as Record<string, unknown>,
        res.ok ? 1 : 0,
      );

      if (!res.ok) {
        setPostError(body.error ?? 'Posting failed');
        return;
      }
      setPostDialogOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="grid h-[calc(100dvh-var(--app-banner-height,0px))] min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-paper)]/95 px-6 py-4 backdrop-blur md:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={liveStatus} />
                <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">
                  {job.content_type}
                </span>
                <ConnectionDot status={stream.status} />
              </div>
              <h1 className="mt-2 max-w-4xl truncate font-display text-3xl md:text-4xl">
                {job.topic ?? 'Untitled'}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-ink-3)]">
                <span className="font-mono">{events.length}</span> events
              </span>
              {liveStatus === 'REVIEW' && (
                <button
                  onClick={() => setPostDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] transition-colors hover:bg-[var(--color-ink-2)]"
                >
                  <Send className="h-4 w-4" />
                  Review & Post
                </button>
              )}
            </div>
          </div>

          {postError && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
              {postError}
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 md:p-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(360px,1fr)]">
            <Panel title="Preview" subtitle="Selected artifact" className="xl:row-span-2">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-paper-3)]">
                {previewUrl ? (
                  <img src={previewUrl} alt="Generated preview" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[var(--color-ink-3)]">Awaiting first frame...</div>
                )}
              </div>
            </Panel>

            <Panel title="Agent" subtitle={`${agentEvents.length} events`}>
              <EventList events={agentEvents.slice(-8)} empty="Waiting for the agent..." />
            </Panel>

            {artifacts.length > 0 && (
              <Panel title="Artifacts" subtitle={`${artifacts.length} created`}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {artifacts.slice(-6).map((artifact) => (
                    <ArtifactTile key={artifact.ts} event={artifact} />
                  ))}
                </div>
              </Panel>
            )}

            {visionReviews.length > 0 && (
              <Panel title="Vision" subtitle={`${visionReviews.length} reviews`}>
                <ul className="space-y-2 text-sm">
                  {visionReviews.slice(-5).map((review) => {
                    const issues = payloadArray(review, 'issues');
                    const score = payloadNumber(review, 'score');
                    const passed = review.payload?.pass === true;
                    return (
                      <li key={review.ts} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{passed ? 'Pass' : 'Revision suggested'}</span>
                          <span className="font-mono text-[10px] text-[var(--color-ink-3)]">{Math.round(score * 100)}%</span>
                        </div>
                        {issues.length > 0 && <div className="mt-1 text-xs text-[var(--color-ink-3)]">{issues.join(' / ')}</div>}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            {latestBudget && (
              <Panel title="Budget" subtitle="agent spend">
                <div className="font-mono text-2xl text-[var(--color-ink)]">
                  ${payloadNumber(latestBudget, 'job_spent_usd').toFixed(3)}
                </div>
                <div className="mt-1 text-sm text-[var(--color-ink-3)]">
                  job cap ${payloadNumber(latestBudget, 'job_cap_usd').toFixed(2)} / daily cap ${payloadNumber(latestBudget, 'cap_usd').toFixed(2)}
                </div>
              </Panel>
            )}

            {showScript && (
              <Panel title="Script" subtitle={`${scriptLines.length} lines`}>
                <ol className="space-y-2 text-sm">
                  <AnimatePresence initial={false}>
                    {scriptLines.map((line, index) => (
                      <motion.li
                        key={line.ts}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                      >
                        <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">line {index + 1}</span>
                        <div className="mt-1 text-[var(--color-ink)]">{payloadString(line, 'text') ?? line.message}</div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {scriptLines.length === 0 && <li className="text-sm text-[var(--color-ink-3)]">Waiting for script lines...</li>}
                </ol>
              </Panel>
            )}

            {showCats && (
              <Panel title="Cat clips" subtitle={`${assets.length} picked`}>
                <div className="grid grid-cols-3 gap-2">
                  {assets.map((asset) => (
                    <motion.div
                      key={asset.ts}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-paper-3)] ring-1 ring-[var(--color-border)]"
                    >
                      {payloadString(asset, 'thumbnail_url') ? (
                        <img src={payloadString(asset, 'thumbnail_url')} alt={payloadString(asset, 'emotion') ?? 'clip'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-[var(--color-ink-3)]">{payloadString(asset, 'emotion') ?? 'clip'}</div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </Panel>
            )}

            {showNarration && (
              <Panel title="Narration" subtitle={`${ttsChunks.length} clips`}>
                <ul className="space-y-2 text-sm">
                  {ttsChunks.map((chunk, index) => (
                    <li key={chunk.ts} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                      <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">line {index + 1}</span>
                      {payloadString(chunk, 'url') ? (
                        <audio src={payloadString(chunk, 'url')} controls className="h-7 max-w-[220px]" />
                      ) : (
                        <span className="text-xs text-[var(--color-ink-3)]">recording...</span>
                      )}
                    </li>
                  ))}
                  {ttsChunks.length === 0 && <li className="text-sm text-[var(--color-ink-3)]">Waiting for narration...</li>}
                </ul>
              </Panel>
            )}

            {frames.length > 0 && (
              <Panel title="Render" subtitle={`frame ${payloadNumber(lastFrame, 'frame')} / ${payloadNumber(lastFrame, 'total')}`}>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
                  {frames.slice(-30).map((frame) => (
                    <div key={frame.ts} className="aspect-square overflow-hidden rounded-[var(--radius-xs)] bg-[var(--color-paper-3)]">
                      {payloadString(frame, 'thumbnail_url') && (
                        <img src={payloadString(frame, 'thumbnail_url')} alt={`frame ${payloadNumber(frame, 'frame')}`} className="h-full w-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 border-l border-[var(--color-border)] bg-[var(--color-paper-2)] lg:flex lg:flex-col">
        <Timeline events={events} />
      </aside>

      <PostDialog
        open={postDialogOpen}
        posting={posting}
        job={job}
        previewUrl={previewUrl}
        selectedPlatforms={selectedPlatforms}
        connectedByPlatform={connectedByPlatform}
        postError={postError}
        postResult={postResult}
        canPost={canPost}
        onClose={() => setPostDialogOpen(false)}
        onToggle={(platform) => {
          if (!connectedByPlatform.has(platform)) return;
          setSelectedPlatforms((current) =>
            current.includes(platform)
              ? current.filter((p) => p !== platform)
              : [...current, platform],
          );
        }}
        onConfirm={confirmPost}
      />
    </div>
  );
}

function PostDialog({
  open,
  posting,
  job,
  previewUrl,
  selectedPlatforms,
  connectedByPlatform,
  postError,
  postResult,
  canPost,
  onClose,
  onToggle,
  onConfirm,
}: {
  open: boolean;
  posting: boolean;
  job: Job;
  previewUrl: string | null;
  selectedPlatforms: LiveSocialPlatform[];
  connectedByPlatform: Map<LiveSocialPlatform, ConnectedSocialAccount>;
  postError: string | null;
  postResult: ApproveResponse | null;
  canPost: boolean;
  onClose: () => void;
  onToggle: (platform: LiveSocialPlatform) => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-ink)]/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="grid max-h-[88dvh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-paper)] shadow-2xl md:grid-cols-[360px_minmax(0,1fr)]"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-b border-[var(--color-border)] bg-[var(--color-paper-2)] p-5 md:border-b-0 md:border-r">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-paper-3)]">
                {previewUrl ? (
                  <img src={previewUrl} alt="Post preview" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[var(--color-ink-3)]">No preview yet</div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">Publish review</p>
                  <h2 className="mt-1 font-display text-3xl">{job.topic ?? 'Untitled'}</h2>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
                  aria-label="Close publish review"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {job.caption && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm leading-relaxed text-[var(--color-ink-2)]">
                    {job.caption}
                  </div>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {LIVE_SOCIAL_PLATFORMS.map((platform) => {
                    const meta = PLATFORM_META[platform];
                    const account = connectedByPlatform.get(platform);
                    const selected = selectedPlatforms.includes(platform);
                    const Icon = meta.Icon;
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => onToggle(platform)}
                        disabled={!account || posting}
                        className={cn(
                          'flex min-h-24 items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors',
                          selected
                            ? 'border-[var(--color-ink)] bg-[var(--color-paper-glow)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-paper-2)]',
                          !account && 'cursor-not-allowed opacity-50 hover:bg-[var(--color-surface)]',
                        )}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-paper)]">
                          <Icon className={cn('h-5 w-5', meta.tint)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-medium">{meta.label}</span>
                            <span className={cn('grid h-5 w-5 place-items-center rounded-full border', selected ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]' : 'border-[var(--color-border)]')}>
                              {selected && <Check className="h-3.5 w-3.5" />}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-[var(--color-ink-3)]">
                            {account ? account.handle : 'not connected'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {connectedByPlatform.size === 0 && (
                  <a href="/app/settings/social" className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--color-ink)] underline underline-offset-4">
                    Connect a platform first
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                {postError && (
                  <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
                    {postError}
                  </div>
                )}

                {postResult?.posted_to && postResult.posted_to.length > 0 && (
                  <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-signal-good)]/30 bg-[var(--color-signal-good)]/10 px-3 py-2 text-sm text-[var(--color-ink)]">
                    Posted to {postResult.posted_to.join(', ')}
                  </div>
                )}
              </div>

              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
                <div className="text-xs text-[var(--color-ink-3)]">
                  {selectedPlatforms.length} selected
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    disabled={posting}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onConfirm}
                    disabled={!canPost || posting}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)] transition-colors hover:bg-[var(--color-ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {posting ? 'Posting' : 'Post selected'}
                  </button>
                </div>
              </footer>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('surface rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 lift', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium">{title}</h3>
        {subtitle && <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">{subtitle}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EventList({ events, empty }: { events: ProgressFrame[]; empty: string }) {
  return (
    <ul className="space-y-2 text-sm">
      {events.map((event) => (
        <li key={event.ts} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">{event.step}</span>
            <span className="font-mono text-[10px] text-[var(--color-ink-3)]">{fmtTime(event.ts)}</span>
          </div>
          <div className="mt-1 text-[var(--color-ink)]">{event.message}</div>
        </li>
      ))}
      {events.length === 0 && <li className="text-sm text-[var(--color-ink-3)]">{empty}</li>}
    </ul>
  );
}

function ArtifactTile({ event }: { event: ProgressFrame }) {
  const href = payloadString(event, 'url') ?? '#';
  const thumb = payloadString(event, 'thumbnail_url');
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="aspect-square bg-[var(--color-paper-3)]">
        {thumb ? (
          <img src={thumb} alt={payloadString(event, 'kind') ?? 'artifact'} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center font-mono text-[10px] text-[var(--color-ink-3)]">
            {payloadString(event, 'mime_type') ?? 'artifact'}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 text-[10px]">
        <span className="font-mono text-[var(--color-ink-3)]">{payloadString(event, 'kind') ?? 'file'}</span>
        <span className="rounded-full bg-[var(--color-paper-3)] px-1.5">{payloadString(event, 'role') ?? 'draft'}</span>
      </div>
    </a>
  );
}

function Timeline({ events }: { events: ProgressFrame[] }) {
  const list = events.slice().reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="font-medium">Timeline</h3>
        <p className="mt-1 text-xs text-[var(--color-ink-3)]">Live event stream</p>
      </header>
      <ol className="min-h-0 flex-1 space-y-px overflow-y-auto overscroll-contain">
        <AnimatePresence initial={false}>
          {list.map((event) => (
            <motion.li
              key={`${event.ts}-${event.step}`}
              layout
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="border-b border-[var(--color-border)]/60 px-5 py-3"
            >
              <div className="flex items-center gap-2">
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dotColor(event.step))} />
                <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">{event.step}</span>
                <span className="ml-auto font-mono text-[10px] text-[var(--color-ink-3)]">{fmtTime(event.ts)}</span>
              </div>
              <div className="mt-1 text-sm text-[var(--color-ink)]">{event.message}</div>
              {event.progress != null && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
                  <div className="h-full bg-[var(--color-ink)]" style={{ width: `${Math.min(100, Math.max(0, event.progress * 100))}%` }} />
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
        {list.length === 0 && <li className="px-5 py-6 text-sm text-[var(--color-ink-3)]">No events yet.</li>}
      </ol>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-paper-3)] px-2.5 py-0.5 text-xs">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'POSTED' ? 'bg-[var(--color-signal-good)]'
            : status === 'FAILED' ? 'bg-[var(--color-signal-bad)]'
              : status === 'REVIEW' ? 'bg-[var(--color-accent-strong)]'
                : 'animate-pulse bg-[var(--color-ink-3)]',
        )}
      />
      {status}
    </span>
  );
}

function ConnectionDot({ status }: { status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' }) {
  const cls = status === 'open' ? 'bg-[var(--color-signal-good)]'
    : status === 'connecting' ? 'animate-pulse bg-[var(--color-accent-strong)]'
      : status === 'error' ? 'bg-[var(--color-signal-bad)]'
        : 'bg-[var(--color-ink-3)]';
  return (
    <span title={`ws ${status}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
      <span className={cn('h-1.5 w-1.5 rounded-full', cls)} />
      <span className="font-mono tracking-wider">{status}</span>
    </span>
  );
}

function pickDefaultPlatforms(platforms: SocialPlatformZ[], accounts: ConnectedSocialAccount[]): LiveSocialPlatform[] {
  const connected = new Set(accounts.filter((a) => a.is_active && isLivePlatform(a.platform)).map((a) => a.platform as LiveSocialPlatform));
  const requested = platforms.filter((p): p is LiveSocialPlatform => isLivePlatform(p) && connected.has(p));
  return requested.length > 0 ? requested : Array.from(connected);
}

function latestMap(events: ProgressFrame[]) {
  return events.reduce<Record<string, ProgressFrame>>((acc, event) => {
    acc[event.step] = event;
    return acc;
  }, {});
}

function resolveStatus(jobStatus: string, latestByStep: Record<string, ProgressFrame>) {
  const postStart = latestByStep[ProgressStep.PostStart];
  const postDone = latestByStep[ProgressStep.PostDone];
  const review = latestByStep[ProgressStep.Review] ?? latestByStep[ProgressStep.AgentFinal] ?? latestByStep[ProgressStep.Complete];
  const reviewTs = review?.ts ?? 0;
  const error = latestByStep[ProgressStep.Error];

  if (postStart && (!postDone || postStart.ts > postDone.ts)) return 'POSTING';
  if (postDone) {
    const postedTo = Array.isArray(postDone.payload?.posted_to) ? postDone.payload.posted_to : [];
    if (postedTo.length > 0 || jobStatus === 'POSTED') return 'POSTED';
    return 'REVIEW';
  }
  if (jobStatus === 'REVIEW' || review) return 'REVIEW';
  if (error && error.ts > reviewTs) return 'FAILED';
  return jobStatus;
}

function isLivePlatform(platform: string): platform is LiveSocialPlatform {
  return LIVE_SOCIAL_PLATFORMS.includes(platform as LiveSocialPlatform);
}

function payloadString(event: ProgressFrame | null, key: string) {
  const value = event?.payload?.[key];
  return typeof value === 'string' ? value : undefined;
}

function payloadNumber(event: ProgressFrame | null, key: string) {
  const value = event?.payload?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function payloadArray(event: ProgressFrame | null, key: string) {
  const value = event?.payload?.[key];
  return Array.isArray(value) ? value.map(String) : [];
}

function dotColor(step: string) {
  if (step === ProgressStep.Error || step === ProgressStep.AgentToolError) return 'bg-[var(--color-signal-bad)]';
  if (step === ProgressStep.PostDone || step === ProgressStep.Complete) return 'bg-[var(--color-signal-good)]';
  if (step === ProgressStep.Review || step === ProgressStep.PostStart) return 'bg-[var(--color-accent-strong)]';
  return 'bg-[var(--color-ink)]';
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}
