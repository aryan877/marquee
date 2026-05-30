import { NextResponse, type NextRequest } from 'next/server';
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import {
  PALETTE_PRESETS,
  VOICE_PRESETS,
  FONT_PAIRS,
  PALETTE_IDS,
  VOICE_IDS,
  FONT_IDS,
  PaletteIdSchema,
  VoiceIdSchema,
  FontIdSchema,
} from '@marquee/shared/palettes';
import { requireUser } from '@/lib/supabase/server';

const BrandDraftSchema = z.object({
  name:           z.string().max(120).optional(),
  handle:         z.string().max(80).optional(),
  description:    z.string().max(800).optional(),
  industry:       z.string().max(120).optional(),
  targetAudience: z.string().max(260).optional(),
  voiceId:        VoiceIdSchema.optional(),
  paletteId:      PaletteIdSchema.optional(),
  fontsId:        FontIdSchema.optional(),
}).default({});

const BrandFillRequestSchema = z.object({
  form:  z.literal('brand-onboarding'),
  draft: BrandDraftSchema,
});

const GenerateFillRequestSchema = z.object({
  form:        z.literal('generation-topic'),
  contentType: z.enum(['POSTER', 'VIDEO', 'CAROUSEL', 'REEL']),
  topic:       z.string().max(360).optional(),
  brand:       z.object({
    name:             z.string().max(120),
    handle:           z.string().max(80).nullable().optional(),
    description:      z.string().max(800).nullable().optional(),
    industry:         z.string().max(120).nullable().optional(),
    target_audience:  z.string().max(260).nullable().optional(),
  }).nullable(),
});

const FormFillRequestSchema = z.discriminatedUnion('form', [
  BrandFillRequestSchema,
  GenerateFillRequestSchema,
]);

const BrandSuggestionSchema = z.object({
  name:           z.string().max(80).nullable(),
  handle:         z.string().max(40).nullable(),
  industry:       z.string().max(80).nullable(),
  targetAudience: z.string().max(200).nullable(),
  description:    z.string().max(500).nullable(),
  voiceId:        VoiceIdSchema.nullable(),
  paletteId:      PaletteIdSchema.nullable(),
  fontsId:        FontIdSchema.nullable(),
});

const TopicSuggestionSchema = z.object({
  topic: z.string().min(1).max(300),
});

type FormFillRequest = z.output<typeof FormFillRequestSchema>;

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = FormFillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY is not set' }, { status: 500 });

  const modelId = process.env.OPENROUTER_FORM_MODEL?.trim();
  if (!modelId) return NextResponse.json({ error: 'OPENROUTER_FORM_MODEL is not set' }, { status: 500 });

  const openrouter = createOpenRouter({
    apiKey,
    appName: process.env.OPENROUTER_SITE_NAME ?? 'Marquee',
    appUrl: process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  try {
    const { object } = await generateObject({
      model: openrouter(modelId),
      schema: parsed.data.form === 'brand-onboarding' ? BrandSuggestionSchema : TopicSuggestionSchema,
      schemaName: parsed.data.form === 'brand-onboarding' ? 'brandFormFill' : 'generationTopicFill',
      schemaDescription: 'JSON fields used to fill a Marquee app form.',
      temperature: 0.35,
      maxOutputTokens: parsed.data.form === 'brand-onboarding' ? 500 : 140,
      prompt: buildPrompt(parsed.data),
    });

    return NextResponse.json({ suggestion: object, model: modelId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI form fill failed' }, { status: 502 });
  }
}

function buildPrompt(request: FormFillRequest) {
  if (request.form === 'brand-onboarding') {
    return JSON.stringify({
      task: 'Complete this brand onboarding form. Preserve good existing user values. Use null only when a field should stay blank.',
      current: request.draft,
      output: {
        name: 'brand name, <= 80 chars',
        handle: 'social handle starting with @, <= 40 chars',
        industry: 'short industry label, <= 80 chars',
        targetAudience: 'specific audience, <= 200 chars',
        description: 'plain English brand description, <= 500 chars',
        voiceId: VOICE_IDS,
        paletteId: PALETTE_IDS,
        fontsId: FONT_IDS,
      },
      voiceOptions: VOICE_PRESETS.map((v) => ({ id: v.id, label: v.label, sample: v.sample })),
      paletteOptions: PALETTE_PRESETS.map((p) => ({ id: p.id, name: p.name })),
      fontOptions: FONT_PAIRS.map((f) => ({ id: f.id, heading: f.heading, body: f.body })),
    });
  }

  return JSON.stringify({
    task: 'Suggest or improve one topic for the selected brand and content type.',
    contentType: request.contentType,
    currentTopic: request.topic ?? null,
    brand: request.brand,
    output: {
      topic: 'one specific topic, <= 300 chars',
    },
  });
}
