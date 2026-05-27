import { NextResponse, type NextRequest } from 'next/server';
import { CreateBrandSchema } from '@marquee/shared/schemas';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('create_brand', {
    p_user_id:         user.id,
    p_name:            parsed.data.name,
    p_handle:          parsed.data.handle ?? undefined,
    p_description:     parsed.data.description ?? undefined,
    p_industry:        parsed.data.industry ?? undefined,
    p_target_audience: parsed.data.target_audience ?? undefined,
    p_voice:           parsed.data.voice ?? {},
    p_palette:         parsed.data.palette ?? {},
    p_fonts:           parsed.data.fonts ?? {},
    p_logo_url:        parsed.data.logo_url ?? undefined,
    p_guidelines:      parsed.data.guidelines ?? {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brand_id: data });
}
