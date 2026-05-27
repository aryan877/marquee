import { NextResponse, type NextRequest } from 'next/server';
import { SubmitJobSchema } from '@marquee/shared/schemas';
import { postBudgetFor, getPlan } from '@marquee/shared/billing';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { mintJobToken, workerWsUrl } from '@/lib/ws-token';

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = SubmitJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: profileRows, error: profileErr } = await admin
    .from('profiles')
    .select('plan, banned_at')
    .eq('id', user.id)
    .single();
  if (profileErr || !profileRows) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  }
  if (profileRows.banned_at) {
    return NextResponse.json({ error: 'account suspended' }, { status: 403 });
  }

  const plan = getPlan(profileRows.plan).id;
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
