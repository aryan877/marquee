import { Effect, Layer } from 'effect';
import { createServer } from 'node:http';
import { JobStream } from './job-stream.js';
import { PROTOCOL_VERSION, type ProgressFrame } from './protocol.js';

const DEV_EMIT_PORT = 4002;

export const DevEmitLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    if (process.env.NODE_ENV === 'production') return;
    const stream = yield* JobStream;

    const server = createServer((req, res) => {
      if (req.method !== 'POST' || !req.url?.startsWith('/emit/')) {
        res.writeHead(404).end('not found');
        return;
      }
      const jobId = req.url.slice('/emit/'.length).split('?')[0]!;
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as Partial<ProgressFrame>;
          const frame: ProgressFrame = {
            v: PROTOCOL_VERSION,
            job_id: jobId,
            step: parsed.step ?? 'queued',
            message: parsed.message ?? '(dev emit)',
            progress: parsed.progress ?? null,
            payload: parsed.payload ?? null,
            ts: Date.now(),
          };
          // ensure a hub exists so the first viewer sees future emits
          void Effect.runPromise(
            stream.getOrCreateHub(jobId).pipe(
              Effect.flatMap(() => stream.emit(frame)),
            ),
          );
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400).end(String(err));
        }
      });
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => server.close()),
    );

    yield* Effect.async<void>(() => {
      server.listen(DEV_EMIT_PORT, '0.0.0.0', () => {
        console.log(`[dev-emit] POST http://localhost:${DEV_EMIT_PORT}/emit/<job_id>`);
      });
    }).pipe(Effect.fork);
  }),
);
