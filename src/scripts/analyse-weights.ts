/**
 * Are the eight scored metrics independent, and does the composite predict
 * winning?
 *
 *   npx tsx src/scripts/analyse-weights.ts
 *
 * Run this before and after touching ROLE_WEIGHTS. Correlations show which
 * metrics are measuring the same thing; Cohen d and AUC show which ones
 * separate winners from losers at all. Note that within-team shares cannot
 * carry outcome signal by construction — their five values sum to 1 whether
 * the team won or lost — so an AUC near 0.50 there is arithmetic, not a fault.
 */
import 'dotenv/config';
import { and, eq, gte } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { matchParticipants, matches } from '@/db/schema';
import { seasonStart } from '@/lib/titles';

const METRICS = [
  'killParticipation',
  'deathShare',
  'damageShare',
  'goldShare',
  'damageTakenShare',
  'objectiveDamageShare',
  'csPerMin',
  'visionPerMin',
] as const;
type Metric = (typeof METRICS)[number];

const SHORT: Record<Metric, string> = {
  killParticipation: 'KP',
  deathShare: 'DthSh',
  damageShare: 'DmgSh',
  goldShare: 'GldSh',
  damageTakenShare: 'DmgTk',
  objectiveDamageShare: 'ObjDm',
  csPerMin: 'CS/m',
  visionPerMin: 'Vis/m',
};

type Row = Record<Metric, number> & { win: boolean; role: string; raw: number | null };

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx, b = ys[i]! - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Cohen's d: how many SDs apart winners and losers are on this metric. */
function cohensD(a: number[], b: number[]): number {
  const m = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  const sd = (v: number[], mean: number) =>
    Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, v.length - 1));
  const ma = m(a), mb = m(b);
  const pooled = Math.sqrt((sd(a, ma) ** 2 + sd(b, mb) ** 2) / 2);
  return pooled ? (ma - mb) / pooled : 0;
}

/** Probability a random winner outranks a random loser. 0.5 = coin flip. */
function auc(winners: number[], losers: number[]): number {
  const all = [...winners.map((v) => ({ v, w: 1 })), ...losers.map((v) => ({ v, w: 0 }))]
    .sort((a, b) => a.v - b.v);
  let rankSum = 0;
  for (let i = 0; i < all.length; i++) if (all[i]!.w === 1) rankSum += i + 1;
  const n1 = winners.length, n0 = losers.length;
  if (!n1 || !n0) return 0.5;
  return (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

async function main() {
  const raw = await db
    .select({
      role: matchParticipants.role,
      win: matchParticipants.win,
      raw: matchParticipants.performanceRaw,
      killParticipation: matchParticipants.killParticipation,
      deathShare: matchParticipants.deathShare,
      damageShare: matchParticipants.damageShare,
      goldShare: matchParticipants.goldShare,
      damageTakenShare: matchParticipants.damageTakenShare,
      objectiveDamageShare: matchParticipants.objectiveDamageShare,
      csPerMin: matchParticipants.csPerMin,
      visionPerMin: matchParticipants.visionPerMin,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .where(and(eq(matches.scorable, true), gte(matches.gameCreation, seasonStart())));

  const rows = raw as unknown as Row[];
  console.log(`participants analysed: ${rows.length}\n`);

  // --- 1. redundancy, within a single role so role differences don't fake it
  for (const role of ['MIDDLE', 'UTILITY'] as const) {
    const sub = rows.filter((r) => r.role === role);
    if (sub.length < 50) continue;
    console.log(`--- correlations within ${role} (n=${sub.length}), |r| >= 0.45 ---`);
    const pairs: [string, number][] = [];
    for (let i = 0; i < METRICS.length; i++) {
      for (let j = i + 1; j < METRICS.length; j++) {
        const a = METRICS[i]!, b = METRICS[j]!;
        const r = pearson(sub.map((x) => x[a]), sub.map((x) => x[b]));
        if (Math.abs(r) >= 0.45) pairs.push([`${SHORT[a]} ~ ${SHORT[b]}`, r]);
      }
    }
    pairs.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    for (const [label, r] of pairs) console.log(`   ${label.padEnd(18)} ${r.toFixed(2)}`);
    if (!pairs.length) console.log('   (none)');
    console.log();
  }

  // --- 2. does each metric separate winners from losers?
  const wins = rows.filter((r) => r.win);
  const losses = rows.filter((r) => !r.win);
  console.log(`--- win/loss separation (n=${wins.length}W / ${losses.length}L) ---`);
  console.log(`   ${'metric'.padEnd(8)} ${'Cohen d'.padStart(8)} ${'AUC'.padStart(6)}`);
  const scored: [string, number, number][] = [];
  for (const m of METRICS) {
    const d = cohensD(wins.map((r) => r[m]), losses.map((r) => r[m]));
    const a = auc(wins.map((r) => r[m]), losses.map((r) => r[m]));
    scored.push([SHORT[m], d, a]);
  }
  scored.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  for (const [n, d, a] of scored) {
    console.log(`   ${n.padEnd(8)} ${d.toFixed(2).padStart(8)} ${a.toFixed(3).padStart(6)}`);
  }

  const wr = rows.filter((r) => r.raw !== null && r.win).map((r) => r.raw!);
  const lr = rows.filter((r) => r.raw !== null && !r.win).map((r) => r.raw!);
  console.log(`\n   ${'COMPOSITE'.padEnd(8)} ${cohensD(wr, lr).toFixed(2).padStart(8)} ${auc(wr, lr).toFixed(3).padStart(6)}`);
}

void runScript(main);
