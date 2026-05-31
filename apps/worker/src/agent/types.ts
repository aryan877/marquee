import type { PipelineContext } from '../pipelines/types.js';
import type { JobWorkspace } from './workspace.js';

type Emit = (
  step: string,
  message: string,
  progress?: number | null,
  payload?: Record<string, unknown> | null,
) => unknown;

export interface ArtifactRecord {
  id: string;
  kind: 'poster' | 'video' | 'frame' | 'audio' | 'review' | 'spec' | 'image';
  role: 'draft' | 'final' | 'thumbnail' | 'intermediate';
  iteration: number;
  url: string | null;
  key: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  metadata: Record<string, unknown>;
}

export interface ContentAgentState {
  ctx: PipelineContext;
  emit: Emit;
  workspace: JobWorkspace;
  artifacts: ArtifactRecord[];
  toolCalls: number;
  finalized: boolean;
}
