import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@marquee/db/database.types';

export async function isBrandOwner(
  admin: SupabaseClient<Database>,
  brandId: string,
  userId: string,
) {
  const { data, error } = await admin.rpc('get_brand_owner', { p_brand_id: brandId });
  if (error) throw new Error(error.message);
  return data?.[0]?.user_id === userId;
}
