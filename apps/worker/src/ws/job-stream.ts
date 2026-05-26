import { Effect, HashMap, PubSub, Ref } from 'effect';
import type { ProgressFrame } from './protocol.js';

export class JobStream extends Effect.Service<JobStream>()('JobStream', {
  effect: Effect.gen(function* () {
    const hubs = yield* Ref.make(
      HashMap.empty<string, PubSub.PubSub<ProgressFrame>>(),
    );

    const getOrCreateHub = (jobId: string) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(hubs);
        const existing = HashMap.get(map, jobId);
        if (existing._tag === 'Some') return existing.value;
        const hub = yield* PubSub.dropping<ProgressFrame>(64);
        yield* Ref.update(hubs, (m) => HashMap.set(m, jobId, hub));
        return hub;
      });

    const tryGetHub = (jobId: string) =>
      Ref.get(hubs).pipe(Effect.map((m) => HashMap.get(m, jobId)));

    const removeHubIfEmpty = (jobId: string) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(hubs);
        const maybe = HashMap.get(map, jobId);
        if (maybe._tag !== 'Some') return;
        const size = yield* PubSub.size(maybe.value);
        if (size === 0) yield* Ref.update(hubs, (m) => HashMap.remove(m, jobId));
      });

    const emit = (frame: ProgressFrame) =>
      tryGetHub(frame.job_id).pipe(
        Effect.flatMap((maybe) =>
          maybe._tag === 'Some'
            ? PubSub.publish(maybe.value, frame)
            : Effect.succeed(false),
        ),
      );

    return { getOrCreateHub, tryGetHub, removeHubIfEmpty, emit } as const;
  }),
}) {}
