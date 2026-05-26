export const ProgressStep = {
  Queued: 'queued',
  Research: 'research',
  ScriptStart: 'script:start',
  ScriptLine: 'script:line',
  ScriptDone: 'script:done',
  TtsChunk: 'tts:chunk',
  AssetFetch: 'asset:fetch',
  PosterLayer: 'poster:layer',
  ImageDone: 'image:done',
  RenderStart: 'render:start',
  RenderFrame: 'render:frame',
  RenderDone: 'render:done',
  Review: 'review',
  PostStart: 'post:start',
  PostDone: 'post:done',
  Complete: 'complete',
  Error: 'error',
} as const;

export type ProgressStep = (typeof ProgressStep)[keyof typeof ProgressStep];

export interface PlatformPostOk {
  ok: true;
  detail: unknown;
}
export interface PlatformPostErr {
  ok: false;
  detail: string;
}
export type PlatformPostResult = PlatformPostOk | PlatformPostErr;

export interface PostStartPayload {
  platforms: string[];
}

export interface PostDonePayload {
  posted_to: string[];
  failed:    string[];
  results:   Record<string, PlatformPostResult>;
}
