# gapdiff

A League of Legends stat tracker for a private friend group — a leaderboard that
settles who is actually the best, built so it can grow into a public op.gg-style
site without a rewrite.

Not endorsed by Riot Games. Riot Games does not endorse or sponsor this project.

## Running it

There is no separate backend, frontend or database server. **One command starts
everything.**

- The **frontend and backend are the same process** — Next.js renders pages on the
  server and serves the browser bundle from the same port.
- The **database needs no server**. Without `DATABASE_URL`, the app runs PGlite, which
  is Postgres compiled to WASM running inside the Node process against the `.pglite/`
  folder. Nothing to install, nothing to start.

```bash
cd C:\Users\wailh\Desktop\Claude-code\gapdiff
npm.cmd run dev
```

Then open **http://localhost:3000**. Stop it with `Ctrl+C`.

> **Use `npm.cmd` and `npx.cmd`, not `npm` and `npx`.** Windows blocks `.ps1` scripts by
> default and both PowerShell launchers trip over it (`running scripts is disabled on this
> system`). The `.cmd` versions skip that wrapper. In cmd.exe or Git Bash, the plain names
> are fine.

### Refreshing the data

The site reads the database, never the Riot API. New games only appear after you
ingest them:

```bash
npm.cmd run ingest
```

Safe to run while the dev server is up, and safe to re-run — stored matches are
skipped. Use `npm.cmd run ingest -- --days=90` to reach further back.

### When the Riot key expires

Development keys die every 24 hours. The symptom is a "Riot key expired" page on any
profile, or `Key rejected (HTTP 401)` from:

```bash
npm.cmd run check-key
```

Regenerate at [developer.riotgames.com](https://developer.riotgames.com), paste it into
`RIOT_API_KEY` in `.env`, and the dev server picks it up without a restart.

### Common problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| `running scripts is disabled` | PowerShell blocks `npm.ps1` / `npx.ps1` | Use `npm.cmd` / `npx.cmd` |
| `Port 3000 is in use` | Another copy is running | `npm.cmd run dev -- --port 3001` |
| `relation "groups" does not exist` | Wrong database opened | Check `PGLITE_DIR` in `.env` is absolute |
| Profile says key expired | 24h dev key | Regenerate, update `.env` |
| Standings look stale | Pages cache for 60s | Wait, or restart the dev server |

## Stack

- **Next.js 15** (App Router, React Server Components) + **React 19** + **TypeScript**
- **Postgres** via **Drizzle ORM**
- Plain CSS with CSS Modules — no utility framework
- Static assets from Data Dragon / Community Dragon

## Setup

### 1. Node.js

Requires Node 20 or newer.

```bash
winget install OpenJS.NodeJS.LTS
```

Restart the terminal afterwards so `PATH` picks it up, then check:

```bash
node -v
```

### 2. Dependencies

```bash
npm install
```

### 3. Run it

```bash
npm run dev
```

The leaderboard is at http://localhost:3000. It renders from placeholder data in
`src/lib/mock.ts`, so this works before any key or database exists.

### 4. Riot API key

Sign in at [developer.riotgames.com](https://developer.riotgames.com) with your Riot
account and copy the development key from the dashboard.

Development keys **expire every 24 hours**. Once there is a working demo, apply for a
personal key on the same site — those are long-lived.

### 5. Environment

```bash
cp .env.example .env
```

Fill in `RIOT_API_KEY`. Everything else is optional.

### 6. Database

**No setup needed.** With `DATABASE_URL` unset, the app runs [PGlite](https://pglite.dev)
— real Postgres compiled to WASM, running in-process against a local `.pglite/` folder.
Migrations, seeding and ingestion all work with no install and no signup.

Set `DATABASE_URL` to a [Neon](https://neon.tech) or [Supabase](https://supabase.com)
connection string when the group needs to be reachable by other people. Nothing else
changes — `src/db/index.ts` picks the driver, and both are typed identically.

> `PGLITE_DIR` must be an **absolute** path. The dev server and the CLI scripts run with
> different working directories, so a relative path quietly opens two separate databases:
> migrations land in one, the app reads the other, and every query fails with
> `relation "groups" does not exist`.

### 7. Migrations

```bash
npm run db:generate   # build SQL from src/db/schema.ts
npm run db:migrate    # apply it
```

`npm run db:studio` opens a browser UI over the database, which is useful while the
app still has no admin screens.

### 8. Seed the group

```bash
cp config/group.example.json config/group.json
```

Add each friend's Riot ID (`Name#TAG`) and set the platform (`euw1`, `na1`, ...), then:

```bash
npm run seed
```

This resolves every Riot ID to a PUUID and creates the group. Re-run it any time you
add someone.

### 9. Ingest matches

```bash
npm run ingest              # last 30 days
npm run ingest -- --days=90 # reach further back
```

Safe to re-run and safe to interrupt — stored matches are skipped.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check-key` | Verify the Riot key, optionally look a player up |
| `npm run db:generate` | Generate migrations from the schema |
| `npm run db:migrate` | Apply migrations (works for both drivers) |
| `npm run db:status` | What's in the database, plus current standings |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed` | Resolve Riot IDs and create the group |
| `npm run ingest` | Fetch and score new matches |

## Routes

| Path | What it does |
| --- | --- |
| `/` | Riot ID search |
| `/player/{platform}/{name}/{tag}` | Live profile — rank, match history, scoreboards |
| `/group/{slug}` | Friend-group standings, computed from ingested history |

## Layout

```
src/
├── app/            routes; pages read the database, never the Riot API
├── components/     UI, one CSS module per component
├── db/             Drizzle schema and client
├── lib/
│   ├── riot/       API client, rate limiter, routing, types
│   ├── rating/     metric extraction, per-game scoring, Gap Score
│   ├── format.ts   display helpers
│   └── mock.ts     placeholder data — delete once ingestion runs
└── scripts/        seed and ingest, run with tsx
```

## Design notes

Two decisions shape everything, both explained at length in [docs/DESIGN.md](docs/DESIGN.md):

**Everything is keyed on `group_id` from day one.** The friend group is group 1. Going
public later changes the ingestion strategy, never the schema.

**Per-game performance is scored against the other nine players in that same match**,
rather than an external rank-cohort dataset. Every game ships with its own control
group at exactly the right MMR, so the score is self-calibrating and needs no data you
don't have yet. When a large dataset does exist, the baseline swaps without the formula
changing.

## Rate limits

Every Riot call goes through `src/lib/riot/client.ts`, which owns a rate limiter that
adopts the limits Riot advertises on each response and backs off on 429. **No page
render ever calls the Riot API** — pages read Postgres, and the ingestion worker owns
all outbound traffic.
