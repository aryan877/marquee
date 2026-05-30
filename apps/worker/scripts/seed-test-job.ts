import { createClient } from '@supabase/supabase-js';
import { DEFAULT_BRAND_STYLE, fontsById, paletteById, voiceById } from '@marquee/shared/palettes';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const voice = voiceById(DEFAULT_BRAND_STYLE.voiceId);
const palette = paletteById(DEFAULT_BRAND_STYLE.paletteId);
const fonts = fontsById(DEFAULT_BRAND_STYLE.fontsId);

async function main() {
  const email = process.argv[2] ?? `dev+${Date.now()}@marquee.app`;
  const password = 'marquee-dev-1234';

  console.log(`Creating user: ${email}`);
  const { data: user, error: userErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (userErr || !user.user) throw userErr ?? new Error('no user');
  const userId = user.user.id;
  console.log(`  user_id = ${userId}`);

  console.log('Creating brand…');
  const { data: brandId, error: brandErr } = await sb.rpc('create_brand', {
    p_user_id:    userId,
    p_name:       'Marquee Coffee',
    p_handle:     '@marqueecoffee',
    p_description: 'Specialty coffee roastery for the perpetually online.',
    p_industry:   'Coffee',
    p_target_audience: 'Caffeine-dependent founders aged 24-40',
    p_voice:      { tone: voice.label, sample_lines: [voice.sample] } as never,
    p_palette:    palette.colors as never,
    p_fonts:      { heading: fonts.heading, body: fonts.body } as never,
    p_guidelines: { do: ['be direct'], dont: ['use AI slop words'] } as never,
  });
  if (brandErr) throw brandErr;
  console.log(`  brand_id = ${brandId}`);

  console.log('Submitting poster job…');
  const { data: jobId, error: jobErr } = await sb.rpc('submit_content_job', {
    p_user_id:      userId,
    p_brand_id:     brandId as string,
    p_content_type: 'POSTER',
    p_platforms:    ['INSTAGRAM'] as never,
    p_post_budget:  30,
    p_topic:        'why your 5am routine is fake',
  });
  if (jobErr) throw jobErr;
  console.log(`  job_id = ${jobId}`);
  console.log(`\nOpen: http://localhost:3000/app/jobs/${jobId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
