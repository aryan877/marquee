'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Maximize2, Pause, Play } from 'lucide-react';
import type { ProgressFrame } from '@/lib/use-job-stream';
import { cn } from '@/lib/cn';

export type JobMedia = {
  url: string;
  kind: 'image' | 'video';
  mimeType?: string;
};

export function mediaFromUrl(url: string | null | undefined, preferredKind?: JobMedia['kind']): JobMedia | null {
  if (!url) return null;
  return { url, kind: preferredKind ?? inferKind({ url }) };
}

export function mediaFromArtifact(event: ProgressFrame | null, mode: 'preview' | 'tile' = 'preview'): JobMedia | null {
  const url = payloadString(event, 'url');
  const thumbnailUrl = payloadString(event, 'thumbnail_url');
  const mimeType = payloadString(event, 'mime_type');
  const kind = inferKind({ url, mimeType, artifactKind: payloadString(event, 'kind') });

  if (mode === 'tile' && thumbnailUrl) {
    return { url: thumbnailUrl, kind: 'image', mimeType: 'image/*' };
  }

  if (url) return { url, kind, mimeType };
  if (thumbnailUrl) return { url: thumbnailUrl, kind: 'image', mimeType: 'image/*' };
  return null;
}

export function JobMediaPreview({
  media,
  alt,
  compact = false,
}: {
  media: JobMedia;
  alt: string;
  compact?: boolean;
}) {
  if (media.kind === 'video') {
    return <JobVideoPlayer src={media.url} compact={compact} />;
  }

  return <img src={media.url} alt={alt} className="absolute inset-0 h-full w-full object-cover" />;
}

export function JobMediaFrame({
  media,
  alt,
  className,
  empty,
}: {
  media: JobMedia | null;
  alt: string;
  className?: string;
  empty: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative mx-auto overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-paper-3)]',
        media?.kind === 'video' ? 'aspect-[9/16] max-h-[70dvh] w-full max-w-[360px]' : 'aspect-[4/5] w-full',
        className,
      )}
    >
      {media ? <JobMediaPreview media={media} alt={alt} /> : empty}
    </div>
  );
}

function JobVideoPlayer({ src, compact }: { src: string; compact: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      return;
    }
    video.pause();
  }

  function enterFullscreen() {
    const target = frameRef.current;
    if (!target?.requestFullscreen) return;
    void target.requestFullscreen();
  }

  return (
    <div ref={frameRef} className="absolute inset-0 flex flex-col overflow-hidden bg-[var(--color-ink)]">
      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 h-full w-full object-contain"
          muted={compact}
          playsInline
          preload="metadata"
          autoPlay={compact}
          loop={compact}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        />
      </div>
      {!compact && (
        <div className="shrink-0 border-t border-white/10 bg-black px-3 py-3 text-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
              aria-label={playing ? 'Pause video' : 'Play video'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/80">
              {formatClock(currentTime)} / {formatClock(duration)}
            </span>
            <button
              type="button"
              onClick={enterFullscreen}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Open fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function inferKind({
  url,
  mimeType,
  artifactKind,
}: {
  url?: string | null;
  mimeType?: string | null;
  artifactKind?: string | null;
}): JobMedia['kind'] {
  if (mimeType?.startsWith('video/')) return 'video';
  if (artifactKind === 'video') return 'video';
  if (url && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return 'video';
  return 'image';
}

function payloadString(event: ProgressFrame | null, key: string) {
  const value = event?.payload?.[key];
  return typeof value === 'string' ? value : undefined;
}

function formatClock(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
