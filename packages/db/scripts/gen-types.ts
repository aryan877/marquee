import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const OUT = resolve(__dirname, '..', 'src', 'database.types.ts');
const url = process.env.DIRECT_URL;
if (!url) {
  console.error('DIRECT_URL missing');
  process.exit(1);
}

const out = execSync(
  `supabase gen types typescript --db-url "${url}" --schema public 2>/dev/null`,
  { encoding: 'utf8', shell: '/bin/bash' },
);
writeFileSync(OUT, out);
console.log(`Wrote ${OUT} (${out.length} bytes, ${out.split('\n').length} lines)`);
