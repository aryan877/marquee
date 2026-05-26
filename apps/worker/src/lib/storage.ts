import { Effect } from 'effect';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppConfig } from '../config.js';

export class Storage extends Effect.Service<Storage>()('Storage', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;

    const ensureDir = (file: string) =>
      Effect.tryPromise(() => mkdir(dirname(file), { recursive: true }));

    const saveBytes = (relPath: string, bytes: Uint8Array) =>
      Effect.gen(function* () {
        const fullPath = join(cfg.outputsDir, relPath);
        yield* ensureDir(fullPath);
        yield* Effect.tryPromise(() => writeFile(fullPath, bytes));
        const url = `${cfg.workerHttpUrl}/outputs/${relPath}`;
        return { path: fullPath, url, key: relPath };
      });

    return { saveBytes, outputsDir: cfg.outputsDir } as const;
  }),
  dependencies: [AppConfig.Default],
}) {}

export const StorageLive = Storage.Default;
