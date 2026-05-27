import type { Database } from '@marquee/db';

export type JobFull = Database['public']['Functions']['get_content_job_full']['Returns'][number];
export type BrandCtx = Database['public']['Functions']['get_brand_for_job']['Returns'][number];

export interface PipelineContext {
  job:   JobFull;
  brand: BrandCtx;
}
