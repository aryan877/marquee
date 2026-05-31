import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  LIVE_SOCIAL_PLATFORMS,
  type LiveSocialPlatform,
  type SocialPlatformZ,
} from '@marquee/shared/schemas';
import {
  ProgressStep,
  type PlatformPostResult,
  type PostDonePayload,
  type PostStartPayload,
} from '@marquee/shared/progress';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { postPosterToBluesky,  type BlueskyPostResult }  from '@/lib/bluesky';
import { postPosterToMastodon, type MastodonPostResult } from '@/lib/mastodon';
import { postPosterToDiscord,  type DiscordPostResult }  from '@/lib/discord';
import { postPosterToTelegram, type TelegramPostResult } from '@/lib/telegram';
import { postPosterToTwitter,  type TwitterPostResult }  from '@/lib/twitter';

interface PlatformPostArgs { brandId: string; imageUrl: string; caption: string }

type PosterDetail = {
  BLUESKY:  BlueskyPostResult;
  MASTODON: MastodonPostResult;
  DISCORD:  DiscordPostResult;
  TELEGRAM: TelegramPostResult;
  TWITTER:  TwitterPostResult;
};
type PlatformPoster<P extends LiveSocialPlatform> = (a: PlatformPostArgs) => Promise<PosterDetail[P]>;

const POSTERS: { [P in LiveSocialPlatform]: PlatformPoster<P> } = {
  BLUESKY:  postPosterToBluesky,
  MASTODON: postPosterToMastodon,
  DISCORD:  postPosterToDiscord,
  TELEGRAM: postPosterToTelegram,
  TWITTER:  postPosterToTwitter,
};

const LIVE_SET = new Set<SocialPlatformZ>(LIVE_SOCIAL_PLATFORMS);
const ApproveSchema = z.object({
  platforms: z.array(z.enum(LIVE_SOCIAL_PLATFORMS)).min(1).max(LIVE_SOCIAL_PLATFORMS.length),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'choose at least one connected platform', issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: jobRows, error: jobErr } = await admin.rpc('get_content_job_for_approval', { p_job_id: id });
  const jobRow = jobRows?.[0];
  if (jobErr || !jobRow) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (jobRow.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (jobRow.status !== 'REVIEW') {
    return NextResponse.json({ error: `job not in REVIEW (was ${jobRow.status})` }, { status: 409 });
  }
  if (!jobRow.output_url) {
    return NextResponse.json({ error: 'no output to post' }, { status: 400 });
  }

  const requested: SocialPlatformZ[] = parsed.data.platforms;
  const targets: LiveSocialPlatform[] = requested.filter(
    (p): p is LiveSocialPlatform => LIVE_SET.has(p),
  );
  if (targets.length === 0) {
    return NextResponse.json({ error: 'no live platforms selected' }, { status: 400 });
  }

  const { data: accounts, error: accountsErr } = await admin.rpc('get_connected_social_accounts_for_job', {
    p_job_id: id,
  });
  if (accountsErr) return NextResponse.json({ error: accountsErr.message }, { status: 500 });

  const connected = new Set((accounts ?? []).map((account) => account.platform));
  const missing = targets.filter((platform) => !connected.has(platform));
  if (missing.length > 0) {
    return NextResponse.json({ error: `connect ${missing.join(', ')} before posting`, missing }, { status: 400 });
  }

  await admin.rpc('update_content_job_status', { p_job_id: id, p_status: 'POSTING' });

  const startPayload: PostStartPayload = { platforms: targets };
  await admin.rpc('emit_progress_event', {
    p_job_id:  id,
    p_step:    ProgressStep.PostStart,
    p_message: `Posting to ${targets.join(', ')}`,
    p_payload: startPayload as never,
  });

  const results: Record<string, PlatformPostResult> = {};
  const postArgs: PlatformPostArgs = {
    brandId:  jobRow.brand_id,
    imageUrl: jobRow.output_url,
    caption:  jobRow.caption ?? '',
  };

  for (const platform of targets) {
    const key = platform.toLowerCase();
    try {
      const detail = await POSTERS[platform](postArgs);
      results[key] = { ok: true, detail };
    } catch (err) {
      results[key] = { ok: false, detail: String(err) };
    }
  }

  const posted = Object.entries(results).filter(([, v]) => v.ok).map(([k]) => k);
  const failed = Object.entries(results).filter(([, v]) => !v.ok).map(([k]) => k);
  const donePayload: PostDonePayload = { posted_to: posted, failed, results };

  if (posted.length === 0) {
    await admin.rpc('update_content_job_status', { p_job_id: id, p_status: 'REVIEW' });
    await admin.rpc('emit_progress_event', {
      p_job_id:  id,
      p_step:    ProgressStep.PostDone,
      p_message: `Posting failed for ${failed.join(', ')}`,
      p_payload: donePayload as never,
    });
    return NextResponse.json({ error: 'all selected platform posts failed', posted_to: posted, failed, results }, { status: 502 });
  }

  await admin.rpc('mark_content_job_approved', { p_job_id: id });
  await admin.rpc('set_content_job_platforms', { p_job_id: id, p_platforms: targets });
  await admin.rpc('update_content_job_status', { p_job_id: id, p_status: 'POSTED' });

  await admin.rpc('emit_progress_event', {
    p_job_id:  id,
    p_step:    ProgressStep.PostDone,
    p_message: `Posted to ${posted.join(', ')}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`,
    p_payload: donePayload as never,
  });

  return NextResponse.json({ ok: true, posted_to: posted, failed, results });
}
