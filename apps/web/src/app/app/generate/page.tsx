import { redirect } from 'next/navigation';
import { pageFromRows } from '@/lib/api/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { GenerateForm } from '@/components/app/generate-form';

export default async function GeneratePage() {
 const sb = await getSupabaseServer();
 const { data: brands } = await sb.rpc('get_brands_page', { p_limit: 20 });
 const initialBrandsPage = pageFromRows(brands, 20);
 if (initialBrandsPage.items.length === 0) redirect('/app/onboarding');

 return (
 <div className="px-6 py-10 md:px-10 md:py-14">
 <div className="mx-auto max-w-3xl">
 <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">New post</p>
 <h1 className="mt-2 font-display text-5xl tracking-[-0.05em] md:text-6xl">Generate.</h1>
 <p className="mt-3 text-[var(--color-ink-2)]">
 Pick a brand, pick what you want made, pick where it goes. The agent runs in front of you.
 </p>
 <GenerateForm initialBrandsPage={initialBrandsPage} />
 </div>
 </div>
 );
}
