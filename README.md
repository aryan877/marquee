# Marquee

Your brand on autopilot. Daily AI-generated posters + cat-meme explainer videos, auto-posted to Instagram and TikTok while you sleep.

Built for the Open-Air Hackathon (top 1000 / 10000 selected).

## Stack

| Layer | Tech |
|---|---|
| Mono | pnpm workspaces + Turborepo |
| Web | Next.js 16 + Tailwind v4 + shadcn + Framer Motion |
| Worker | Effect.ts + Docker |
| Auth | Supabase email/password |
| DB | Supabase Postgres (Prisma DDL + Supabase migrations for RLS/RPCs) |
| Queue | PGMQ (Postgres-native) + priority dequeue |
| Realtime | Raw WebSocket from worker (`ws://:4001/ws/jobs/<id>`) |
| Text gen | `codex` CLI (logged-in OpenAI, $0 marginal cost) |
| Image gen | `gen-img` CLI (logged-in ChatGPT, $0 marginal cost) |
| Video | Remotion |
| Posters | Playwright screenshots `/render/poster/[id]` |
| Social | Playwright with persistent session blobs |
| Storage | Cloudflare R2 |
| Payments | Dodo Payments — Founder Pass $50/mo |

## Layout

```
marquee/
├── apps/
│   ├── web/        # Next.js — landing, app, admin, /render routes
│   └── worker/     # Effect.ts content pipeline
├── packages/
│   ├── db/         # Prisma + Supabase migrations + types
│   ├── ui/         # shadcn components
│   └── shared/     # billing, plans, zod schemas
└── infra/supabase/ # self-host docker-compose (later)
```

## Dev

```bash
pnpm install
pnpm db:gen           # generate types
pnpm dev              # everything in parallel
pnpm dev:web          # just the web
pnpm dev:worker       # just the worker
```
