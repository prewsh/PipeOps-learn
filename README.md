# PipeOps Learn

Program-operations and learning platform. First program: the **PipeOps UGC
Program, Cohort 01** — a six-week creator course paired with weekly publishing
tasks.

It is not a course website. The loop is
**Learn → Create → Submit → Publish → Measure → Improve.**

## Quick start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

```bash
pnpm verify   # typecheck + lint + build — the definition of done
pnpm e2e      # end-to-end suite
```

Requires Node 22+ and pnpm (`corepack enable pnpm`).

## Where things are

| Path | What |
| --- | --- |
| `AGENTS.md` | **Working rules.** Read first — humans and coding agents alike. |
| `docs/PRD.md` | Full V1 specification, with stable requirement IDs (`F7.6`) |
| `docs/TASKBOARD.md` | Five prototypes, what ships when, current status |
| `docs/DESIGN.md` | Design system — tokens, type, status model, rules |
| `docs/decisions/` | Architecture decision records |
| `design/` | Claude Design handoff — HTML prototypes (mockups, not code) |
| `app/` | Next.js App Router — routes, layouts, server actions |
| `lib/` | Shared non-UI code (`env.ts`, `time.ts`) |
| `supabase/migrations/` | Checked-in SQL — the schema source of truth |
| `e2e/` | Playwright specs, fixtures and run artifacts |

## Picking this up

1. Read `AGENTS.md` — especially §6 domain invariants and §10 testing.
2. Skim `docs/TASKBOARD.md` to see what is built and what is next.
3. Look up whatever you are building by requirement ID in `docs/PRD.md`.
4. Check `docs/DESIGN.md` before writing any UI.

## Status

Scaffold complete (Prototype 0). Next: **Prototype 1 — Log in and learn.**
No database, authentication or product features exist yet.

## Stack

Next.js · React · TypeScript · Tailwind v4 · Biome · Supabase (Postgres, Auth,
Storage) · Playwright · Resend · deployed on PipeOps.
