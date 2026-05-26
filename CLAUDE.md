# Marquee — Brand-on-autopilot content agent

Built at an open-air hackathon (top 1000 of 10000). Generates daily posters + cat-meme TikTok-style explainer videos for a brand, streams every intermediate artifact to a live Studio UI over raw WebSockets, posts to social platforms. Demo win condition is the live Studio paint.

## Stack

| Layer | Tech |
|---|---|
| Mono | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router) + Tailwind v4 + Framer Motion |
| Worker | Effect TS + Playwright + ffmpeg + msedge-tts |
| Auth | Supabase email/password |
| DB | Cloud Supabase `syrkuqywxczllfdsvmgp` (Prisma DDL + Supabase migrations for RLS/RPCs) |
| Queue | PGMQ + priority dequeue |
| Realtime | **Raw WS** from worker to browser (NOT Supabase Realtime) |
| LLM | OpenRouter (default `openai/gpt-5.5`) — graceful fallback to deterministic templates |
| TTS | `msedge-tts` (pure Node, no Python) |
| Video | ffmpeg + Playwright stills (NOT Remotion) |
| Posters | Playwright screenshots Next.js `/render/poster/[id]` route |
| Social | `@atproto/api` for Bluesky (server-side, no Playwright) |
| Storage | Local FS in dev; R2 in prod. Worker serves `/outputs/` itself |
| Payments | Dodo Payments — Founder Pass $50/mo |

## Layout

```
marquee/
├── apps/
│   ├── web/                # Next.js — landing, app, /render, /api
│   └── worker/             # Effect TS — WS gateway + queue consumer + pipelines
│       ├── assets/cats/    # manifest.json (8 emoji cats v1; real green-screens slot in here)
│       └── src/
│           ├── config.ts        # Effect Config service
│           ├── ws/              # WS gateway: server.ts, job-stream.ts, auth.ts, protocol.ts
│           ├── queue/           # PGMQ consumer
│           ├── lib/             # supabase, llm, renderer (playwright), storage, tts, ffmpeg, cats
│           └── pipelines/       # poster.ts, video.ts, dispatcher
├── packages/
│   ├── db/                 # Prisma schema, generated types, RPC client wrapper
│   └── shared/             # billing, palettes, schemas (zod), constants, progress step taxonomy
├── supabase/migrations/    # RLS, RPCs, triggers, PGMQ queue, pg_cron (numbered 00–80)
└── .env                    # single source of truth, copied to apps/web/.env.local
```

## The demo loop

1. `/signup` → email/password → `/app/onboarding` (4-step brand wizard)
2. `/app/generate` → pick brand, type (POSTER | VIDEO | CAROUSEL | REEL), topic, platforms
3. `POST /api/jobs` calls `submit_content_job` RPC (atomic quota deduct + PENDING insert + `pgmq.send` in one TX), mints a short-lived JWT scoped to `job_id`, returns `{job_id, ws_url, token}`
4. Browser navigates to `/app/jobs/[id]` (Studio) and opens the WS to the worker
5. Worker queue consumer polls `read_next_content_job(vt=300)`, dispatches by content_type:
   - **Poster**: 5 sequential Playwright shots of `/render/poster/[id]?layers=background,wordmark,headline,…` (cumulative), each emits `poster:layer` with `preview_url`
   - **Video**: LLM script → per-line msedge-tts → per-line Playwright card → per-line ffmpeg clip → ffmpeg concat → final.mp4. Streams `script:line`, `tts:chunk`, `asset:fetch`, `render:frame`, `render:done`
6. Worker sets status REVIEW, Studio shows "Approve & Post" CTA
7. `POST /api/jobs/[id]/approve` posts to selected platforms (Bluesky live), sets POSTED, emits `post:done`

## Architecture rules

### Realtime is RAW WS, not Supabase Realtime
The Studio's live progress stream goes over a raw WebSocket served by the Effect worker on `:4001`. The DB persists `progress_events` rows for replay/audit, but the live stream never round-trips through Postgres LISTEN/NOTIFY or Supabase Realtime. Aryan picked this for lowest latency + future flexibility (binary frames, multi-region, edge cache).

Pattern: `Ref<HashMap<jobId, PubSub.dropping(64)>>` keyed by job_id. Per-connection `Effect.forkScoped` pump from PubSub → socket. Subscriber close → finalizer removes empty hubs. Producer emits via fire-and-forget; slow subscribers drop messages, never block.

**Don't import `@supabase/realtime` for job progress.** Don't use `sb.channel(...)` for live UI.

### Prisma owns table DDL. Supabase migrations own everything else.
- Tables, columns, indexes, FKs → `packages/db/prisma/schema.prisma`
- RLS, grants, RPCs, triggers, PGMQ queues, pg_cron jobs → `supabase/migrations/*.sql` (numbered 00–80)
- Never declare the `auth` schema in Prisma. Bridge from `auth.users` lives as triggers in `10_rls_and_triggers.sql`.

Apply order:
```bash
pnpm --filter @marquee/db exec prisma migrate deploy   # tables
pnpm --filter @marquee/db exec tsx scripts/apply-migrations.ts   # SQL
pnpm --filter @marquee/db exec tsx scripts/gen-types.ts          # regen types
```

### RPC rules
- `SECURITY DEFINER`, `SET search_path = ''`, `(select auth.uid())` for client-scoped reads
- Every function ends with `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role` (or `authenticated, service_role` for client reads)
- Pass JS objects to `.rpc()`, never `JSON.stringify()`
- Enums always qualified: `::public."ContentJobStatus"`

### Frontend typing
All DB types come from `packages/db/src/database.types.ts` (generated). Never define custom types for DB entities:
```ts
import type { Database } from '@marquee/db';
type Job = Database['public']['Functions']['get_content_job']['Returns'][number];
type Brand = Database['public']['Functions']['get_brand_for_job']['Returns'][number];
type ContentType = Database['public']['Enums']['ContentType'];
```

Server: `getSupabaseServer()` for user-scoped reads, `getSupabaseAdmin()` (service role) for mutations.
Browser: `getSupabaseBrowser()`. Pass `<Database>` generic — wiring already does this.

### `progress_events.payload` (JSONB) is the protocol
Worker emits typed payloads per step group. The Studio reads them by step prefix:
- `script:line` → `{index, text, emotion}`
- `tts:chunk`   → `{line_index, url, duration_s, voice}`
- `asset:fetch` → `{asset_id, emotion, url, thumbnail_url, scene_index}`
- `poster:layer` → `{layer, preview_url, template}`
- `render:frame` → `{frame, total, thumbnail_url, fps, clip_url}`

Canonical step list lives in `packages/shared/src/progress.ts`. Adding a new step? Add it there first, then in the pipeline, then in the Studio panel that consumes it.

### WS frame protocol
Versioned envelope, see `apps/worker/src/ws/protocol.ts`:
```ts
{v: 1, job_id, step, message, progress, payload, ts}
```
Bump `v` to evolve. Client hook `apps/web/src/lib/use-job-stream.ts` reconnects on close, pings every 20s.

## Pipelines

### Poster pipeline (`apps/worker/src/pipelines/poster.ts`)
Templates: editorial, stat, listicle, quote. Worker:
1. LLM writes `{headline, subhead, caption, hashtags}` JSON
2. For each layer in `[background, wordmark, headline, accent, final]`:
   - Build URL: `/render/poster/[id]?template=editorial&layers=background,wordmark,…&headline=…`
   - Playwright shot at 1080×1350
   - Save to `/outputs/<job_id>/layer-N-<layer>.png`
   - Emit `poster:layer` with `preview_url`
3. Final layer = output. Sets caption + hashtags. Status → REVIEW.

### Video pipeline (`apps/worker/src/pipelines/video.ts`)
Format: 30-second cat-meme TikTok explainer. 1080×1920 vertical. Worker:
1. LLM writes `{hook, lines: [{text, emotion}]×5-7, caption, hashtags}` JSON
2. For each line: msedge-tts → MP3 → ffprobe duration → Playwright card render (`/render/video/card/[id]?line=…&emoji=…&color=…`) → ffmpeg clip (still+audio → MP4)
3. ffmpeg concat all clips → `final.mp4`
4. Real green-screen cat clips slot in later by extending `apps/worker/assets/cats/manifest.json` with `{url, type:'mp4', chroma:'#00ff00'}` entries and adding a chroma-key step in `lib/ffmpeg.ts`.

### Pipeline dispatch
`apps/worker/src/pipelines/index.ts` routes by `job.content_type`. Add a new pipeline? Add a case here, write the handler, ensure all its deps are in the `Infrastructure` layer in `apps/worker/src/index.ts`.

## Queue + worker lifecycle

PGMQ queue `content_jobs`. Worker polls `read_next_content_job(vt=300)` every 750ms.
- Priority: `queue_priority_for_plan(FOUNDER=200, FREE=0)`, snapshotted at submit so queue order is deterministic even if plan changes mid-wait
- Visibility timeout 5 min → if worker dies mid-pipeline, msg reappears, sweeper marks orphan jobs FAILED + refunds (every minute via pg_cron, `sweep_orphan_jobs`)
- Terminal → `archive_content_job(msg_id)`. Failure → `refund_content_job(job_id, error_message)` (idempotent)
- Worker heartbeat to `worker_heartbeat` every 15s

## Storage

Dev: local filesystem at `/tmp/marquee-outputs/<job_id>/...`. Worker hosts a static file server on the SAME port as the WS (`:4001/outputs/...`) so the Studio can `<img src=…>` directly. CORS open.

Prod: swap `Storage.saveBytes` to write to R2; URL becomes `${R2_PUBLIC_URL}/<key>`.

## LLM

OpenRouter (OpenAI-compatible HTTP API). One model does all jobs (script, headline, caption, emotion). Default `openai/gpt-5.5`, override via `OPENROUTER_MODEL` env. Service is `apps/worker/src/lib/llm.ts` with `complete()` + `completeJson()`.

No API key? Pipelines gracefully fall back to deterministic templates so the demo still produces real output. Look for `if (!llm.isReady)` branches.

## Auth tokens for WS

Web mints a JWT at job-submit time (signed with `JWT_SECRET`, scoped to one `job_id`, 1h TTL) and ships it back with `ws_url`. Worker rejects the upgrade BEFORE accepting (not after) via `ws.handleUpgrade` after `verifyJobToken`. See `apps/worker/src/ws/server.ts` and `apps/web/src/lib/ws-token.ts`.

For Studio reload, `POST /api/jobs/[id]/ws-token` mints a fresh token.

## Payments

Dodo Payments. Single product: Founder Pass $50/mo.
- `/api/billing/checkout` → checkout session, returns `checkout_url`
- `/api/billing/webhook` → `standardwebhooks` verify → `record_webhook_event` (idempotency) → dispatch to `activate_subscription`/`renew_subscription`/`cancel_subscription`/`expire_subscription` RPCs
- Banner on `/app` (above the dashboard) only renders if `profile.plan !== 'FOUNDER'`

## Social posting

Bluesky is API-native (`@atproto/api`) — no Playwright. App password collected via `/app/settings/social`, AES-256-GCM encrypted with key derived from `JWT_SECRET`, stored in `social_accounts.session_enc` (BYTEA). `lib/bluesky.ts:postPosterToBluesky` fetches output PNG → `uploadBlob` → `agent.post` with image embed + RichText facets.

Other platforms (IG/TikTok/X/LinkedIn) are stubs — UI shows them in the platform grid. Adding a new platform: write a `lib/<platform>.ts:postPosterTo<Platform>`, dispatch in `/api/jobs/[id]/approve`, no schema changes needed.

## Env vars

Single `.env` at repo root. `apps/web/.env.local` is a copy (Next.js needs it locally). When you change `.env`, also `cp .env apps/web/.env.local`.

Required:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`, `DIRECT_URL` (Supabase pooler + direct)
- `JWT_SECRET` (shared web ↔ worker, signs WS tokens + encrypts social creds)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_WORKER_WS_URL`, `WORKER_HTTP_URL`

For features that need keys (works without — fall back paths exist):
- `OPENROUTER_API_KEY` — real LLM copy
- `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PRODUCT_ID_FOUNDER` — checkout
- `R2_*` — prod storage (skip for dev)

## Dev

```bash
# Both servers
pnpm dev

# Just web
pnpm dev:web         # http://localhost:3000

# Just worker
pnpm dev:worker      # ws :4001, http :4001/outputs/, dev-emit :4002

# DB
pnpm db:migrate      # prisma migrate (tables)
pnpm db:gen          # gen src/database.types.ts from Supabase
pnpm --filter @marquee/db exec tsx scripts/apply-migrations.ts   # apply RLS/RPC SQL
```

To seed a real test job (creates user + brand + submits job):
```bash
cd apps/worker && pnpm exec tsx scripts/seed-test-job.ts        # poster
cd apps/worker && pnpm exec tsx scripts/seed-video.ts           # video
```

To test the WS gateway directly:
```bash
# from anywhere
curl -X POST http://localhost:4002/emit/<job_id> -d '{"step":"script:line","message":"hi","payload":{"text":"hi"}}'
```

## What's NOT built yet

- **Real green-screen cat MP4s** — manifest is emoji-only v1. Curate ~50 clips from greenscreenmemes.com or Pixabay, drop in `apps/worker/assets/cats/clips/`, extend manifest, add ffmpeg chroma-key step.
- **Whisper word-level captions** — video uses line-level timing from TTS duration. For per-word burned captions, add whisper.cpp call after each `tts.speak()` and emit `caption:align` with word timings; render captions in `/render/video/card/[id]`.
- **R2 storage** — `Storage.saveBytes` writes local FS only. Add an R2 branch when `R2_*` env present.
- **Autopilot auto-publish** — `sweep_autopilot` enqueues jobs from `campaigns.next_run_at`, but Founder Pass `auto_publish` branch in `/api/jobs/[id]/approve` (post automatically, skip REVIEW) isn't wired. Default = manual approval, as documented.
- **IG/TikTok/X/LinkedIn posting** — only Bluesky lives in `lib/bluesky.ts`. UI shows the others as "soon".
- **Worker container image** — `Dockerfile` not written. For prod, base off `node:22-bookworm-slim`, install chromium deps + ffmpeg.

## Important details

- **Don't write chatty comments.** No "what this does" prose, no module-purpose headers. Production-grade, minimal. Aryan has called this out explicitly. SQL migrations get one-line headers max.
- **Don't model `auth.users` in Prisma.** Cross-schema needs go in `10_rls_and_triggers.sql` as triggers.
- **Don't use `pgmq.pop`.** Use `read_next_content_job(vt)` + `archive_content_job(msg_id)` — durable until terminal.
- **Worker dispatches by `content_type` only.** Don't switch on topic/payload — keep handlers clean.
- **The Free Launch banner** sits at the TOP of `/app/*` for FREE users only. Render path: `apps/web/src/app/app/layout.tsx` reads `profile.plan` server-side.
- **The Studio approves directly from `/api/jobs/[id]/approve`**, not via a separate post job in PGMQ. Simpler for v1; can be promoted to a post queue if posting becomes slow.
