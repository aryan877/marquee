import { NextResponse, type NextRequest } from 'next/server';
import { UpdateBrandSchema } from '@marquee/shared/schemas';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('update_brand', {
    p_brand_id:        id,
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
    p_is_active:       parsed.data.is_active ?? true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const brand = data?.[0];
  if (!brand) return NextResponse.json({ error: 'brand not found' }, { status: 404 });

  return NextResponse.json({ brand });
}
