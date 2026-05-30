import { NextResponse, type NextRequest } from 'next/server';
import { pageFromRows, parseCursorParams } from '@/lib/api/pagination';
import { requireUser, getSupabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageParams = parseCursorParams(request.nextUrl.searchParams);
  if (!pageParams.ok) {
    return NextResponse.json({ error: 'invalid pagination', issues: pageParams.error }, { status: 400 });
  }

  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('get_campaigns_page', {
    p_limit:             pageParams.data.limit,
    p_cursor_created_at: pageParams.data.cursor_created_at,
    p_cursor_id:         pageParams.data.cursor_id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(pageFromRows(data, pageParams.data.limit));
}
