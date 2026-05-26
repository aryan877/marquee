import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Cat {
  id: string;
  emotion: string;
  emoji: string;
  color: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, '..', '..', 'assets', 'cats', 'manifest.json');

let _cats: Cat[] | null = null;
function loadCats(): Cat[] {
  if (_cats) return _cats;
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { cats: Cat[] };
  _cats = raw.cats;
  return _cats;
}

export class Cats extends Effect.Service<Cats>()('Cats', {
  effect: Effect.sync(() => {
    const cats = loadCats();
    const byEmotion: Record<string, Cat[]> = {};
    for (const c of cats) {
      (byEmotion[c.emotion] ??= []).push(c);
    }

    const pickByEmotion = (emotion: string): Cat => {
      const pool = byEmotion[emotion.toLowerCase()] ?? cats;
      return pool[Math.floor(Math.random() * pool.length)]!;
    };

    const pickById = (id: string): Cat | null =>
      cats.find((c) => c.id === id) ?? null;

    const list = () => cats;

    return { pickByEmotion, pickById, list, emotions: Object.keys(byEmotion) } as const;
  }),
}) {}

export const CatsLive = Cats.Default;
