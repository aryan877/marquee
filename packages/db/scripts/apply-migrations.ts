import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const MIGRATIONS_DIR = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations');

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL missing');
    process.exit(1);
  }

  const filterArg = process.argv[2];
  const filterSet = filterArg ? new Set(filterArg.split(',').map((s) => s.trim())) : null;

  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const files = filterSet
    ? all.filter((f) => Array.from(filterSet).some((id) => f.startsWith(id)))
    : all;

  console.log(`Applying ${files.length} migration${files.length === 1 ? '' : 's'}`);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const file of files) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`  · ${file} … `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('failed');
        throw err;
      }
    }
  } finally {
    await client.end();
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
