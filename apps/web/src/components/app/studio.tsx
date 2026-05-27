'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useJobStream, type ProgressFrame } from '@/lib/use-job-stream';
import { cn } from '@/lib/cn';
import type { Database } from '@marquee/db';

type Job = Database['public']['Functions']['get_content_job']['Returns'][number];
export type InitialProgressEvent = Omit<ProgressFrame, 'v'>;

export function Studio({ job, wsUrl, initialEvents }: { job: Job; wsUrl: string; initialEvents: InitialProgressEvent[] }) {
 const stream = useJobStream({ wsUrl, initialEvents });
 const router = useRouter();
 const [approving, startApprove] = useTransition();
 const [approveError, setApproveError] = useState<string | null>(null);
 const liveStatus = stream.latestByStep['post:done'] ? 'POSTED'
 : stream.latestByStep['post:start'] ? 'POSTING'
 : stream.latestByStep['review'] ? 'REVIEW'
 : stream.latestByStep['error'] ? 'FAILED'
 : job.status;

 function approve() {
 setApproveError(null);
 startApprove(async () => {
 const res = await fetch(`/api/jobs/${job.id}/approve`, { method: 'POST' });
 const body = await res.json().catch(() => ({}));
 if (!res.ok) {
 setApproveError(body.error ?? 'Failed to post');
 return;
 }
 router.refresh();
 });
 }

 const scriptLines = useMemo(
 () => stream.events.filter((e) => e.step === 'script:line'),
 [stream.events],
 );
 const ttsChunks = useMemo(
 () => stream.events.filter((e) => e.step === 'tts:chunk'),
 [stream.events],
 );
 const assets = useMemo(
 () => stream.events.filter((e) => e.step === 'asset:fetch' || e.step === 'asset:keyed'),
 [stream.events],
 );
 const posterLayers = useMemo(
 () => stream.events.filter((e) => e.step === 'poster:layer'),
 [stream.events],
 );
 const frames = useMemo(
 () => stream.events.filter((e) => e.step === 'render:frame'),
 [stream.events],
 );

 const lastFrame = frames[frames.length - 1] ?? null;
 const lastPoster = posterLayers[posterLayers.length - 1] ?? null;
 const previewUrl = (lastPoster?.payload?.preview_url as string | undefined)
 ?? (lastFrame?.payload?.thumbnail_url as string | undefined)
 ?? job.thumbnail_url
 ?? job.output_url
 ?? null;

 return (
 <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[1fr_360px]">
 <section className="flex min-w-0 flex-col">
 <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-6 py-4 md:px-10">
 <div className="min-w-0">
 <div className="flex items-center gap-3">
 <StatusBadge status={liveStatus} />
 <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">
 {job.content_type}
 </span>
 <ConnectionDot status={stream.status} />
 </div>
 <h1 className="mt-2 truncate font-display text-3xl tracking-[-0.04em] md:text-4xl">
 {job.topic ?? 'Untitled'}
 </h1>
 </div>
 <div className="flex items-center gap-3 text-xs text-[var(--color-ink-3)]">
 <span><span className="font-mono">{stream.events.length}</span> events</span>
 {liveStatus === 'REVIEW' && (
 <button
 onClick={approve}
 disabled={approving}
 className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
 >
 {approving ? 'Posting…' : 'Approve & Post'} {!approving && <span aria-hidden>→</span>}
 </button>
 )}
 </div>
 {approveError && (
 <div className="basis-full rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
 {approveError}
 </div>
 )}
 </header>

 <div className="flex-1 overflow-auto p-6 md:p-10">
 <div className="grid gap-6 md:grid-cols-2">
 <Panel title="Preview" subtitle="Latest artifact">
 <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-paper-3)]">
 {previewUrl ? (
 <img
 src={previewUrl}
 alt="preview"
 className="absolute inset-0 h-full w-full object-cover"
 />
 ) : (
 <div className="grid h-full place-items-center text-sm text-[var(--color-ink-3)]">
 Awaiting first frame…
 </div>
 )}
 </div>
 </Panel>

 <Panel title="Script" subtitle={`${scriptLines.length} lines`}>
 <ol className="space-y-2 text-sm">
 <AnimatePresence initial={false}>
 {scriptLines.map((line, i) => (
 <motion.li
 key={line.ts}
 layout
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0 }}
 transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
 className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
 >
 <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">
 step {i + 1}
 </span>
 <div className="mt-1 text-[var(--color-ink)]">
 {(line.payload?.text as string) ?? line.message}
 </div>
 </motion.li>
 ))}
 </AnimatePresence>
 {scriptLines.length === 0 && (
 <li className="text-sm text-[var(--color-ink-3)]">Waiting for the writer…</li>
 )}
 </ol>
 </Panel>

 <Panel title="Cat picks" subtitle={`${assets.length} clips`}>
 <div className="grid grid-cols-3 gap-2">
 <AnimatePresence initial={false}>
 {assets.map((a) => (
 <motion.div
 key={a.ts}
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-paper-3)] ring-1 ring-[var(--color-border)]"
 >
 {(a.payload?.thumbnail_url as string | undefined) ? (
 <img
 src={a.payload!.thumbnail_url as string}
 alt={(a.payload?.emotion as string) ?? 'cat'}
 className="h-full w-full object-cover"
 />
 ) : (
 <div className="grid h-full place-items-center text-xs text-[var(--color-ink-3)]">
 {(a.payload?.emotion as string) ?? '...'}
 </div>
 )}
 </motion.div>
 ))}
 </AnimatePresence>
 </div>
 </Panel>

 <Panel title="Narration" subtitle={`${ttsChunks.length} clips`}>
 <ul className="space-y-2 text-sm">
 {ttsChunks.map((c, i) => (
 <li
 key={c.ts}
 className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
 >
 <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">
 line {i + 1}
 </span>
 {(c.payload?.url as string | undefined) ? (
 <audio src={c.payload!.url as string} controls className="h-7" />
 ) : (
 <span className="text-xs text-[var(--color-ink-3)]">recording…</span>
 )}
 </li>
 ))}
 {ttsChunks.length === 0 && (
 <li className="text-sm text-[var(--color-ink-3)]">No clips yet.</li>
 )}
 </ul>
 </Panel>
 </div>

 {frames.length > 0 && (
 <Panel title="Render" subtitle={`frame ${(lastFrame?.payload?.frame as number) ?? 0} / ${(lastFrame?.payload?.total as number) ?? '?'}`} className="mt-6">
 <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
 {frames.slice(-30).map((f) => (
 <div
 key={f.ts}
 className="aspect-square overflow-hidden rounded-[var(--radius-xs)] bg-[var(--color-paper-3)]"
 >
 {(f.payload?.thumbnail_url as string | undefined) && (
 <img
 src={f.payload!.thumbnail_url as string}
 alt={`frame ${f.payload?.frame as number}`}
 className="h-full w-full object-cover"
 />
 )}
 </div>
 ))}
 </div>
 </Panel>
 )}
 </div>
 </section>

 <aside className="border-l border-[var(--color-border)] bg-[var(--color-paper-2)]">
 <Timeline events={stream.events} />
 </aside>
 </div>
 );
}

function Panel({
 title, subtitle, children, className,
}: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
 return (
 <div className={cn('surface rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 lift', className)}>
 <div className="flex items-baseline justify-between">
 <h3 className="font-medium">{title}</h3>
 {subtitle && (
 <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">
 {subtitle}
 </span>
 )}
 </div>
 <div className="mt-4">{children}</div>
 </div>
 );
}

function Timeline({ events }: { events: ProgressFrame[] }) {
 const list = events.slice().reverse();
 return (
 <div className="flex h-full max-h-[calc(100vh-3.5rem)] flex-col">
 <header className="border-b border-[var(--color-border)] px-5 py-4">
 <h3 className="font-medium">Timeline</h3>
 <p className="mt-1 text-xs text-[var(--color-ink-3)]">Live event stream</p>
 </header>
 <ol className="flex-1 space-y-px overflow-auto">
 <AnimatePresence initial={false}>
 {list.map((e) => (
 <motion.li
 key={e.ts}
 layout
 initial={{ opacity: 0, x: 8 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ duration: 0.2 }}
 className="border-b border-[var(--color-border)]/60 px-5 py-3"
 >
 <div className="flex items-center gap-2">
 <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ink)]" />
 <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">
 {e.step}
 </span>
 <span className="ml-auto font-mono text-[10px] text-[var(--color-ink-3)]">
 {fmtTime(e.ts)}
 </span>
 </div>
 <div className="mt-1 text-sm text-[var(--color-ink)]">{e.message}</div>
 {e.progress != null && (
 <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
 <div
 className="h-full bg-[var(--color-ink)]"
 style={{ width: `${Math.min(100, Math.max(0, e.progress * 100))}%` }}
 />
 </div>
 )}
 </motion.li>
 ))}
 </AnimatePresence>
 {list.length === 0 && (
 <li className="px-5 py-6 text-sm text-[var(--color-ink-3)]">
 No events yet. The worker is picking this up.
 </li>
 )}
 </ol>
 </div>
 );
}

function StatusBadge({ status }: { status: string }) {
 return (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-paper-3)] px-2.5 py-0.5 text-xs">
 <span className={cn('h-1.5 w-1.5 rounded-full',
 status === 'POSTED' ? 'bg-[var(--color-signal-good)]' :
 status === 'FAILED' ? 'bg-[var(--color-signal-bad)]' :
 status === 'REVIEW' ? 'bg-[var(--color-accent-strong)]' :
 'bg-[var(--color-ink-3)] animate-pulse',
 )} />
 {status}
 </span>
 );
}

function ConnectionDot({ status }: { status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' }) {
 const cls =
 status === 'open' ? 'bg-[var(--color-signal-good)]' :
 status === 'connecting' ? 'bg-[var(--color-accent-strong)] animate-pulse' :
 status === 'error' ? 'bg-[var(--color-signal-bad)]' :
 'bg-[var(--color-ink-3)]';
 return (
 <span title={`ws ${status}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
 <span className={cn('h-1.5 w-1.5 rounded-full', cls)} />
 <span className="font-mono tracking-wider">{status}</span>
 </span>
 );
}

function fmtTime(ts: number) {
 return new Date(ts).toLocaleTimeString([], { hour12: false });
}
