import { NextResponse, type NextRequest } from 'next/server';
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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: jobRow, error: jobErr } = await admin
    .from('content_jobs')
    .select('id, user_id, brand_id, status, output_url, caption, platforms')
    .eq('id', id)
    .single();
  if (jobErr || !jobRow) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (jobRow.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (jobRow.status !== 'REVIEW') {
    return NextResponse.json({ error: `job not in REVIEW (was ${jobRow.status})` }, { status: 409 });
  }
  if (!jobRow.output_url) {
    return NextResponse.json({ error: 'no output to post' }, { status: 400 });
  }

  const requested: SocialPlatformZ[] = jobRow.platforms ?? [];
  const targets: LiveSocialPlatform[] = requested.filter(
    (p): p is LiveSocialPlatform => LIVE_SET.has(p),
  );
  if (targets.length === 0) {
    return NextResponse.json({ error: 'no live platforms selected' }, { status: 400 });
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

  if (posted.length === 0) {
    await admin.rpc('refund_content_job', {
      p_job_id:        id,
      p_error_message: `All platform posts failed: ${JSON.stringify(results)}`,
    });
    return NextResponse.json({ error: 'all platform posts failed', results }, { status: 500 });
  }

  await admin.rpc('update_content_job_status', { p_job_id: id, p_status: 'POSTED' });

  const donePayload: PostDonePayload = { posted_to: posted, failed, results };
  await admin.rpc('emit_progress_event', {
    p_job_id:  id,
    p_step:    ProgressStep.PostDone,
    p_message: `Posted to ${posted.join(', ')}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`,
    p_payload: donePayload as never,
  });

  return NextResponse.json({ ok: true, posted_to: posted, failed, results });
}
