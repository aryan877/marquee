import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SubmitJobSchema } from '@marquee/shared/schemas';
import { postBudgetFor, getPlan } from '@marquee/shared/billing';
import { pageFromRows, parseCursorParams } from '@/lib/api/pagination';
import { requireUser, getSupabaseAdmin, getSupabaseServer } from '@/lib/supabase/server';
import { mintJobToken, workerWsUrl } from '@/lib/ws-token';

const JobHistorySearchSchema = z.object({
  brand_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageParams = parseCursorParams(request.nextUrl.searchParams);
  if (!pageParams.ok) {
    return NextResponse.json({ error: 'invalid pagination', issues: pageParams.error }, { status: 400 });
  }

  const parsed = JobHistorySearchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid filters', issues: parsed.error.flatten() }, { status: 400 });
  }

  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('get_content_jobs_page', {
    p_brand_id:          parsed.data.brand_id,
    p_limit:             pageParams.data.limit,
    p_cursor_created_at: pageParams.data.cursor_created_at,
    p_cursor_id:         pageParams.data.cursor_id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(pageFromRows(data, pageParams.data.limit));
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = SubmitJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: profileRows, error: profileErr } = await admin.rpc('get_profile_for_job_submit', { p_user_id: user.id });
  const profile = profileRows?.[0];
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  }
  if (profile.banned_at) {
    return NextResponse.json({ error: 'account suspended' }, { status: 403 });
  }

  const plan = getPlan(profile.plan).id;
  const budget = postBudgetFor(plan);

  const rpcArgs: {
    p_user_id: string;
    p_brand_id: string;
    p_content_type: typeof parsed.data.content_type;
    p_platforms: typeof parsed.data.platforms;
    p_post_budget: number;
    p_topic?: string;
    p_campaign_id?: string;
  } = {
    p_user_id:      user.id,
    p_brand_id:     parsed.data.brand_id,
    p_content_type: parsed.data.content_type,
    p_platforms:    parsed.data.platforms,
    p_post_budget:  budget,
  };
  if (parsed.data.topic)       rpcArgs.p_topic       = parsed.data.topic;
  if (parsed.data.campaign_id) rpcArgs.p_campaign_id = parsed.data.campaign_id;

  const { data: jobId, error } = await admin.rpc('submit_content_job', rpcArgs);

  if (error || !jobId) {
    return NextResponse.json({ error: error?.message ?? 'submit failed' }, { status: 400 });
  }

  const token = mintJobToken({ userId: user.id, jobId, ttlSeconds: 60 * 60 });
  const wsUrl = workerWsUrl(jobId, token);

  return NextResponse.json({ job_id: jobId, ws_url: wsUrl, token });
}
