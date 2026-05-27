import { NextResponse } from 'next/server';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { getDodo, PRODUCT_FOUNDER } from '@/lib/dodo';

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: 'no email on account' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('username, dodo_customer_id')
    .eq('id', user.id)
    .single();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const dodo = getDodo();

  try {
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: PRODUCT_FOUNDER(), quantity: 1 }],
      customer: profile?.dodo_customer_id
        ? { customer_id: profile.dodo_customer_id }
        : { email: user.email, name: profile?.username ?? user.email },
      return_url: `${baseUrl}/app/settings/billing?status=success`,
      metadata: { user_id: user.id },
    });
    return NextResponse.json({ url: session.checkout_url, session_id: session.session_id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
