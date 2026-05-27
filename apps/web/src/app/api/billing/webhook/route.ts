import { NextResponse, type NextRequest } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getDodo } from '@/lib/dodo';

export async function POST(request: NextRequest) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });

  const body = await request.text();
  const headers = {
    'webhook-id':        request.headers.get('webhook-id')        ?? '',
    'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
    'webhook-signature': request.headers.get('webhook-signature') ?? '',
  };

  const wh = new Webhook(secret);
  let event: { type: string; data: Record<string, unknown>; id?: string };
  try {
    event = wh.verify(body, headers) as typeof event;
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  const webhookId = headers['webhook-id'];
  const admin = getSupabaseAdmin();

  const { data: isNew, error: recErr } = await admin.rpc('record_webhook_event', {
    p_webhook_id: webhookId,
    p_event_type: event.type,
    p_payload:    event as never,
  });
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!isNew) return NextResponse.json({ deduped: true });

  try {
    await dispatchEvent(event, admin);
    await admin.rpc('mark_webhook_processed', { p_webhook_id: webhookId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await admin.rpc('mark_webhook_processed', {
      p_webhook_id:    webhookId,
      p_error_message: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function dispatchEvent(
  event: { type: string; data: Record<string, unknown> },
  admin: ReturnType<typeof getSupabaseAdmin>,
) {
  const data = event.data as { subscription_id?: string; customer_id?: string; current_period_end?: string; metadata?: Record<string, string> };

  switch (event.type) {
    case 'subscription.active':
    case 'subscription.created': {
      const userId = data.metadata?.user_id;
      if (!userId || !data.subscription_id || !data.customer_id || !data.current_period_end) return;
      await admin.rpc('activate_subscription', {
        p_user_id:         userId,
        p_subscription_id: data.subscription_id,
        p_customer_id:     data.customer_id,
        p_period_ends_at:  data.current_period_end,
      });
      return;
    }
    case 'subscription.renewed': {
      if (!data.subscription_id || !data.current_period_end) return;
      await admin.rpc('renew_subscription', {
        p_subscription_id: data.subscription_id,
        p_period_ends_at:  data.current_period_end,
      });
      return;
    }
    case 'subscription.cancelled':
    case 'subscription.canceled': {
      if (!data.subscription_id) return;
      await admin.rpc('cancel_subscription', {
        p_subscription_id:      data.subscription_id,
        p_cancel_at_period_end: true,
      });
      return;
    }
    case 'subscription.expired': {
      if (!data.subscription_id) return;
      await admin.rpc('expire_subscription', { p_subscription_id: data.subscription_id });
      return;
    }
    default:
      void getDodo();
      return;
  }
}
