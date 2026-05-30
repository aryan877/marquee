import { Effect } from 'effect';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface RunResult { code: number; stdout: string; stderr: string }

function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolveP, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    p.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => resolveP({ code: code ?? -1, stdout, stderr }));
  });
}

export class Ffmpeg extends Effect.Service<Ffmpeg>()('Ffmpeg', {
  effect: Effect.sync(() => {
    const ensureDir = (file: string) =>
      Effect.tryPromise(() => mkdir(dirname(file), { recursive: true }));

    const probeDurationSeconds = (file: string) =>
      Effect.tryPromise({
        try: async () => {
          const { code, stdout, stderr } = await run('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', file,
          ]);
          if (code !== 0) throw new Error(stderr);
          const duration = parseFloat(stdout.trim());
          if (!isFinite(duration)) throw new Error('could not parse duration');
          return duration;
        },
        catch: (err) => new Error(`ffprobe failed: ${String(err)}`),
      });

    const makeClipFromStillAndAudio = (args: {
      imagePath: string;
      audioPath: string;
      outPath: string;
      durationSec: number;
    }) =>
      Effect.gen(function* () {
        yield* ensureDir(args.outPath);
        const result = yield* Effect.tryPromise(() =>
          run('ffmpeg', [
            '-y',
            '-loop', '1', '-i', args.imagePath,
            '-i', args.audioPath,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k',
            '-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
            '-t', String(args.durationSec.toFixed(3)),
            '-r', '30',
            '-shortest',
            args.outPath,
          ]),
        );
        if (result.code !== 0) {
          return yield* Effect.fail(new Error(`ffmpeg clip: ${result.stderr.slice(-500)}`));
        }
      });

    const concatClips = (args: { clipPaths: string[]; outPath: string }) =>
      Effect.gen(function* () {
        yield* ensureDir(args.outPath);
        const listFile = `${args.outPath}.list.txt`;
        const lines = args.clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
        yield* Effect.tryPromise(() => writeFile(listFile, lines));

        const result = yield* Effect.tryPromise(() =>
          run('ffmpeg', [
            '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
            '-c', 'copy', args.outPath,
          ]),
        );
        if (result.code !== 0) {
          return yield* Effect.fail(new Error(`ffmpeg concat: ${result.stderr.slice(-500)}`));
        }
      });

    const extractFrame = (args: { videoPath: string; outPath: string; atSeconds: number }) =>
      Effect.gen(function* () {
        yield* ensureDir(args.outPath);
        const result = yield* Effect.tryPromise(() =>
          run('ffmpeg', [
            '-y', '-ss', String(Math.max(0, args.atSeconds).toFixed(3)),
            '-i', args.videoPath, '-frames:v', '1', '-q:v', '2', args.outPath,
          ]),
        );
        if (result.code !== 0) {
          return yield* Effect.fail(new Error(`ffmpeg frame: ${result.stderr.slice(-500)}`));
        }
      });

    return { probeDurationSeconds, makeClipFromStillAndAudio, concatClips, extractFrame } as const;
  }),
}) {}

export const FfmpegLive = Ffmpeg.Default;
