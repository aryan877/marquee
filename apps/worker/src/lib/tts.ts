import { Effect } from 'effect';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VOICE = 'en-US-GuyNeural';

export class Tts extends Effect.Service<Tts>()('Tts', {
  effect: Effect.sync(() => {
    const speak = (text: string) =>
      Effect.tryPromise({
        try: async () => {
          const tts = new MsEdgeTTS();
          await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
          const dir = await mkdtempLike();
          const { audioFilePath } = await tts.toFile(dir, text);
          const bytes = await readFile(audioFilePath);
          tts.close();
          // best-effort cleanup
          await rm(dir, { recursive: true, force: true }).catch(() => {});
          return new Uint8Array(bytes);
        },
        catch: (err) => new Error(`TTS failed: ${String(err)}`),
      });

    return { speak, voice: VOICE } as const;
  }),
}) {}

async function mkdtempLike(): Promise<string> {
  const dir = join(tmpdir(), `marquee-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dirname(dir), { recursive: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

export const TtsLive = Tts.Default;
