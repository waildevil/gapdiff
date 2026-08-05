# gapdiff — design

A League of Legends stat tracker for a private friend group, built so it can grow
into a public op.gg-style site without a rewrite.

## Goals

1. **Now**: a private leaderboard that settles who is actually the best in the group,
   plus enough fun (awards, streaks, head-to-head, Discord posts) that people check it.
2. **Later**: public summoner search, profile pages, champion stats — the op.gg surface —
   on the same schema and the same ingestion pipeline.

## Why "friends-only" is an advantage

The hard constraint on any Riot API project is rate limits. A public site must fetch
data on demand for arbitrary players and is permanently starved.

A fixed roster of N players (N ~ 5-20) inverts this:

- Every tracked account's full match history can be ingested once and kept fresh
  with a poll every few minutes.
- Cost is `N x (1 match-ids call + new matches)` per cycle — trivial against a
  20 req/s budget.
- You end up owning a **complete** dataset for those players, which is what makes
  custom cross-player ranking possible at all.

## Architecture

```
                   +----------------------+
   Riot API  <---- |  riot client         |   rate limiter, routing, retries
                   |  (src/lib/riot)      |   the ONLY thing that talks to Riot
                   +----------+-----------+
                              |
                   +----------v-----------+
                   |  ingestion worker    |   cron: sync every tracked account
                   |  (src/jobs)          |   writes raw + derived rows
                   +----------+-----------+
                              |
                   +----------v-----------+
                   |  Postgres (Drizzle)  |
                   +----------+-----------+
                              |
              +---------------+---------------+
              |                               |
   +----------v-----------+       +-----------v----------+
   |  rating engine       |       |  Next.js app         |
   |  (src/lib/rating)    |       |  reads DB only       |
   +----------------------+       +----------------------+
```

**Hard rule: no page render ever calls the Riot API.** Pages read Postgres. The worker
owns all Riot traffic. This is what keeps the site fast and what makes the public
version possible later.

### Riot API notes that bite people

- Summoner-name lookup is gone. Entry point is **Riot ID** (`Name#TAG`) via
  ACCOUNT-V1 -> PUUID. Everything downstream is PUUID-keyed.
- **Two routing schemes.** Platform routes (`euw1`, `na1`, `kr`) for summoner/league/
  spectator. Regional routes (`europe`, `americas`, `asia`, `sea`) for account/match.
  Mixing them up produces confusing 404s.
- Dev keys expire every 24h. Apply for a personal key once there's a working demo.
- Static assets (champion/item/rune icons) come from Data Dragon and Community Dragon.
  Never self-host them.
- Riot policy: display the "not endorsed by Riot Games" disclaimer, don't monetize
  without approval.

### Storage strategy

Store **both** the raw match JSON and extracted columns. Riot changes payload shapes
between patches, and having the raw blob means derived stats can be recomputed
without re-fetching anything. Re-fetching is the expensive thing; disk is not.

## The ranking system

### Problem

Friends play different roles, champions, ranks, and volumes. Ranking by soloq LP alone
is boring and frequently wrong (300 games of hardstuck Gold vs 20 games of smurfing).
Ranking by KDA is worse. The system needs to be defensible enough to end arguments and
transparent enough to start them.

### Gap Score = 0-100, three pillars

| Pillar         | Weight | Captures                                              |
| -------------- | ------ | ----------------------------------------------------- |
| Rank           | 40%    | Actual LP, linearised Iron IV -> Challenger           |
| Performance    | 40%    | How well you play relative to the lobby you're in     |
| Consistency    | 20%    | Variance penalty + volume confidence                  |

### Pillar 1 — Rank points

Tier and division collapse to a single ladder position:

```
rankPoints = tierIndex * 400 + divisionIndex * 100 + LP
```

Master+ has no divisions, so LP accumulates directly above the Diamond I ceiling.
The result is normalised to 0-100 across the full ladder.

### Pillar 2 — Performance score (the interesting one)

For each game, each player is scored **against the other nine players in that same
match**, with extra weight on the direct role opponent.

This is the core design decision. Every match ships with its own control group at
exactly the right MMR, so the score is self-calibrating and needs no external
rank-cohort dataset. When a large dataset does exist later, the baseline swaps from
"this lobby" to "this rank cohort" without changing anything else in the formula.

Metrics are all shares or per-minute rates, so game duration doesn't distort them:

- kill participation `(K + A) / teamKills`
- death share `D / teamDeaths` *(negative weight)*
- damage share to champions
- gold share
- CS per minute
- vision score per minute
- damage taken share *(frontline signal)*
- objective damage and objective participation

Each metric is z-scored across the lobby, then combined with **role-specific weights** —
vision dominates for support, CS and damage share for ADC, objective participation for
jungle. The weighted sum is squashed through a logistic to 0-100, plus a modest win
bonus (winning matters, but a 25/3 loss should still outscore a 2/6 win).

### Pillar 3 — Consistency and volume

Raw averages are unfair to low sample sizes in both directions. Two corrections:

- **Bayesian shrinkage** toward the group mean: `(n * avg + k * prior) / (n + k)`, k ~ 15.
  Four great games pull you toward the middle until you prove it.
- **Variance penalty** from the standard deviation of recent performance scores. A player
  who alternates hard carries and hard ints ranks below a steady one at the same mean.

Recent form counts more than ancient history: performance is an exponentially weighted
moving average with a half-life of about 20 games.

### Seasons

The leaderboard resets weekly, every Monday at 19:00 Aachen time. Keeps it competitive,
gives everyone a fresh shot, and stops one hot streak from deciding the whole season.
All-time standings are kept alongside.

### Transparency

The leaderboard shows the pillar breakdown for every player, not just the final number.
An opaque score nobody can argue with is a score nobody cares about.

## The fun layer

The ranking is the skeleton; this is the reason anyone opens the site twice.

- **Weekly awards** from the same data: Farm King, Ward Andy, The Wall (damage taken),
  Executioner (solo kills), Int Merchant (death share), Coin Flip (highest variance),
  Tilt Proof (best winrate after a loss), Duo Bond (best synergy pair).
- **Head-to-head** records for games where friends were on opposite teams.
- **Synergy matrix** — winrate for every pair that queued together.
- **Activity feed** — chronological notable events.
- **Discord webhook** — posts milestones and disasters to the group chat. This is the
  single highest-leverage feature for a friend-group app.
- **Streaks and milestones** — first to Gold, longest win streak, most games in a week.

## Scaling to the public version

Everything is keyed on `group_id` from day one. The friend group is group 1.

Going public means:

| Concern    | Private now                     | Public later                        |
| ---------- | ------------------------------- | ----------------------------------- |
| Ingestion  | cron over all tracked accounts  | + on-demand fetch with cache TTL    |
| Accounts   | seeded from a config file       | created on first search             |
| Ranking    | scoped to a group               | groups optional; global percentiles |
| Baselines  | the 9 other players in a match  | real rank-cohort aggregates         |
| Pages      | leaderboard-first               | profile-first, search-driven        |

None of these change the schema. That is the entire point of doing it this way now.

## Build order

1. Riot client: routing, rate limiter, retries, typed responses.
2. Schema + migrations.
3. Ingestion worker: resolve Riot IDs -> PUUIDs, backfill matches, poll for new ones.
4. Rating engine over stored matches.
5. Leaderboard page.
6. Profile and match detail pages.
7. Awards, head-to-head, synergy.
8. Discord webhook.
9. Live game (spectator) view.
