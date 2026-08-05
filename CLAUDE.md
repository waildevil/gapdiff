# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Windows: use `npm.cmd` / `npx.cmd`, not `npm` / `npx` — PowerShell's script-execution
policy blocks the plain `.ps1` launchers. Git Bash and cmd.exe don't have this problem.

```bash
npm run dev              # dev server on :3000 (frontend + backend, one process)
npm run typecheck        # tsc --noEmit — silent on success
npm run build             # production build
npm run db:generate       # diff src/db/schema.ts into a new drizzle/*.sql migration
npm run db:migrate        # apply migrations (works against PGlite or hosted Postgres)
npm run db:status         # what's in the database, plus current standings — use this
                          # instead of writing an ad-hoc introspection script
npm run db:studio         # Drizzle Studio, browser UI over the database
npm run seed              # resolve config/group.json's Riot IDs, create/update the group
npm run ingest            # fetch and score new matches; `-- --days=90` to backfill
npm run check-key         # verify RIOT_API_KEY is still alive (dev keys expire in 24h)
```

There is no test suite. `npm run typecheck` plus manual verification (dev server, or a
throwaway `tsx` script against the real `lib/` functions) is the whole loop — see the
Playbooks section for how this session actually verified changes when it couldn't reach
`localhost:3000`.

No `DATABASE_URL` in `.env` means the app runs PGlite (Postgres-in-WASM against
`.pglite/`) — nothing to install, migrations/seed/ingest all work unmodified. Set
`DATABASE_URL` to point at hosted Postgres (Neon in production); `src/db/index.ts`
picks the driver and both are typed identically. `PGLITE_DIR` must be an absolute path,
or the dev server and CLI scripts silently open two different databases.

Full setup steps, the deploy flow, and the common-problems table are in
[README.md](README.md) — don't re-derive them here.

## Architecture

**Two decisions shape almost every table and query — read
[docs/DESIGN.md](docs/DESIGN.md) before changing either:**
1. Everything is keyed on `group_id` from day one (the friend group is group 1), so
   going public later changes ingestion, never the schema.
2. Per-game performance is scored against the other nine players in *that same match*,
   not an external cohort — self-calibrating, no data you don't already have.

**Derive, don't store.** Standings, movement ("up two places since last week"), and a
live duel's current rank are all recomputed at read time from `matches`,
`match_participants`, and `rank_snapshots` — nothing aggregated is cached, so a past
standing is reproduced exactly by recomputing with a cutoff rather than trusting a
stored number. The one deliberate exception: once a duel's `endAt` has passed, the
first read settles it — freezes each racer's final rank into
`duel_participants.end*` and picks a winner — because an "ended" result that kept
recomputing forever would drift every time someone reopened the link. There is no cron
for this; `getDuel()` does it lazily on whichever view crosses the line first.

**Server actions are thin.** Every `'use server'` file under `src/app/actions/` does
auth-check-then-delegate: pull the session, call into `src/lib/*.ts`, catch a domain
error class (`GroupError`, `DuelError`, `VerificationError`) and turn it into
`{ ok: false, error }`. All business logic and Drizzle queries live in `lib/`, never in
an action or a page component — that's also where to add new mutations.

**Duels** (`src/lib/duels.ts`) are a challenge/accept model, not a group feature: a
racer's `invitedUserId` is resolved from a *verified* `accountClaims` row (so a
challenge always reaches a real inbox), a racer's numbers stay null in `getDuel()`
until they accept, and the whole thing is intentionally not scoped to one `group_id` —
`searchDuelTargets` favors the challenger's own groups but can reach any verified
account in the app.

**Scheduled work lives in `.github/workflows/`** (`ingest.yml` nightly, `digest.yml`
for the Discord post), not in the deployed app or on a Vercel cron. The app itself never
runs a background job — pages only ever read Postgres, and outbound Riot calls happen
exclusively through the ingestion worker via `src/lib/riot/client.ts`'s rate limiter.

**Auth** is Discord OAuth via NextAuth v5 (beta) + `@auth/drizzle-adapter`. Its tables
carry an `auth_` prefix in `src/db/schema.ts` specifically because its own `accounts`
table (OAuth provider link) would otherwise collide with this app's `accounts` table
(a tracked Riot account) — two unrelated things that happen to share a name.

**Styling** is plain CSS: shared tokens and primitives (`.card`, `.page-head`,
`.eyebrow`, the chamfer clip-path, LoL tier colors) live in `src/app/globals.css`; every
component gets its own co-located CSS Module for the rest. No Tailwind, no CSS-in-JS.

## Playbooks

**Verifying a change when the dev server is unavailable** (e.g. another session already
holds `:3000` — only one process can bind it, and retrying `preview_start` just errors
again): write a throwaway script at `src/scripts/_tmp-*.ts` that imports the real
`lib/` functions and exercises them against the actual database with `npx tsx`, then
delete it once it's done its job. This is how duel creation, accept/decline, and
settlement were all confirmed against the live Neon database in this session without a
browser. Don't leave the script behind, and don't write a second one that re-does what
the first already proved.

**Reading `matches`**: `raw` and `timeline` are full Riot API payloads stored as JSONB
and are large. Always `select({...})` a specific column shape against this table —
never a bare `.select()` — following the pattern already used in `leaderboard.ts` and
`movement.ts`.

**Finding something in a big file**: `schema.ts`, `leaderboard.ts`, and `duels.ts` are
each several hundred lines. Grep for the table/export name first and read a bounded
range around it rather than the whole file.

**Never read**: `tsconfig.tsbuildinfo`, `package-lock.json`, `.next/`, `.pglite/` — none
of it is useful context and all of it is large.
