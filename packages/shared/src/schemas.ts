import { z } from 'zod';

const HEX_COLOR = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const BrandPaletteSchema = z.object({
  primary:   HEX_COLOR,
  secondary: HEX_COLOR,
  accent:    HEX_COLOR,
  bg:        HEX_COLOR,
  fg:        HEX_COLOR,
});

const BrandVoiceSchema = z.object({
  tone:           z.string().optional(),
  style:          z.string().optional(),
  sample_lines:   z.array(z.string()).max(20).default([]),
  banned_phrases: z.array(z.string()).max(50).default([]),
});

const BrandFontsSchema = z.object({
  heading: z.string().optional(),
  body:    z.string().optional(),
});

const BrandGuidelinesSchema = z.object({
  do:         z.array(z.string()).max(30).default([]),
  dont:       z.array(z.string()).max(30).default([]),
  vocabulary: z.array(z.string()).max(50).default([]),
  hashtags:   z.array(z.string()).max(30).default([]),
});

export const CreateBrandSchema = z.object({
  name:            z.string().min(1).max(80),
  handle:          z.string().min(1).max(40).optional(),
  description:     z.string().max(500).optional(),
  industry:        z.string().max(80).optional(),
  target_audience: z.string().max(200).optional(),
  voice:           BrandVoiceSchema.optional(),
  palette:         BrandPaletteSchema.optional(),
  fonts:           BrandFontsSchema.optional(),
  logo_url:        z.string().url().optional(),
  guidelines:      BrandGuidelinesSchema.optional(),
});

export const UpdateBrandSchema = CreateBrandSchema.extend({
  is_active: z.boolean().optional(),
});

const SocialPlatformSchema = z.enum([
  'INSTAGRAM',
  'TIKTOK',
  'TWITTER',
  'LINKEDIN',
  'FACEBOOK',
  'YOUTUBE',
  'BLUESKY',
  'THREADS',
  'PINTEREST',
  'GOOGLE_BUSINESS',
  'MASTODON',
  'DISCORD',
  'TELEGRAM',
]);
export type SocialPlatformZ = z.infer<typeof SocialPlatformSchema>;

export const LIVE_SOCIAL_PLATFORMS = [
  'BLUESKY',
  'MASTODON',
  'DISCORD',
  'TELEGRAM',
  'TWITTER',
] as const satisfies readonly SocialPlatformZ[];

export type LiveSocialPlatform = (typeof LIVE_SOCIAL_PLATFORMS)[number];

const ContentTypeSchema = z.enum([
  'POSTER',
  'VIDEO',
  'CAROUSEL',
  'REEL',
]);

export const JobInputAssetSchema = z.object({
  id:          z.string().uuid(),
  url:         z.string().url(),
  key:         z.string().min(1).max(500),
  file_name:   z.string().min(1).max(160),
  mime_type:   z.string().min(1).max(120),
  size:        z.number().int().min(1).max(50 * 1024 * 1024),
  kind:        z.enum(['image', 'video', 'document', 'other']),
  description: z.string().max(500).optional(),
  usage_hint:  z.string().max(300).optional(),
});

export type JobInputAsset = z.infer<typeof JobInputAssetSchema>;

export const SubmitJobSchema = z.object({
  brand_id:     z.string().uuid(),
  content_type: ContentTypeSchema,
  topic:        z.string().min(1).max(300).optional(),
  platforms:    z.array(z.enum(LIVE_SOCIAL_PLATFORMS)).max(LIVE_SOCIAL_PLATFORMS.length).default([]),
  campaign_id:  z.string().uuid().optional(),
  assets:       z.array(JobInputAssetSchema).max(8).default([]),
});
