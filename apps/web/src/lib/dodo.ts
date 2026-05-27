import 'server-only';
import DodoPayments from 'dodopayments';

let _client: DodoPayments | null = null;
export function getDodo(): DodoPayments {
  if (!_client) {
    const apiKey = process.env.DODO_API_KEY;
    if (!apiKey) throw new Error('DODO_API_KEY missing');
    _client = new DodoPayments({
      bearerToken: apiKey,
      environment: process.env.DODO_ENV === 'live' ? 'live_mode' : 'test_mode',
    });
  }
  return _client;
}

export const PRODUCT_FOUNDER = () => {
  const id = process.env.DODO_PRODUCT_ID_FOUNDER;
  if (!id) throw new Error('DODO_PRODUCT_ID_FOUNDER missing');
  return id;
};
