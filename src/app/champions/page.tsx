import { and, desc, eq } from 'drizzle-orm';
import { ChampionMetaPreview, type ChampionMetaRow } from '@/components/ChampionMetaPreview';
import { db } from '@/db';
import { championMetaRollups, championMetaTierRollups, metaSampleMatches } from '@/db/schema';
import { latestVersion } from '@/lib/ddragon';
import styles from '@/components/ChampionMetaPreview.module.css';

export const metadata = {
  title: 'Champion meta | gapdiff',
  description: 'Champion meta for Ranked Solo/Duo, built from GapDiff match samples.',
};

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'] as const;

export default async function ChampionsPage({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const version = await latestVersion();
  const requestedTier = (await searchParams).tier?.toUpperCase();
  const tier = TIERS.includes(requestedTier as typeof TIERS[number]) ? requestedTier as typeof TIERS[number] : null;
  const newest = await db.select({ patch: metaSampleMatches.patch }).from(metaSampleMatches).orderBy(desc(metaSampleMatches.gameCreation)).limit(1);
  const patch = newest[0]?.patch;
  const rollups = patch
    ? tier
      ? await db.select().from(championMetaTierRollups).where(and(eq(championMetaTierRollups.patch, patch), eq(championMetaTierRollups.tier, tier)))
      : await db.select().from(championMetaRollups).where(eq(championMetaRollups.patch, patch))
    : [];
  const grouped = new Map<string, { name: string; role: ChampionMetaRow['role']; games: number; wins: number; roleGames: number; bans: number; sampledMatches: number; kdaTotal: number }>();
  const roleNames: Record<string, ChampionMetaRow['role']> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Middle', BOTTOM: 'Bottom', UTILITY: 'Support' };
  for (const row of rollups) {
    const role = roleNames[row.role];
    if (!role) continue;
    const key = `${row.championId}:${role}`;
    const group = grouped.get(key) ?? { name: row.championName, role, games: 0, wins: 0, roleGames: 0, bans: 0, sampledMatches: 0, kdaTotal: 0 };
    group.games += row.games;
    group.wins += row.wins;
    group.roleGames += row.roleGames;
    group.bans += row.bans;
    group.sampledMatches += row.sampledMatches;
    group.kdaTotal += row.averageKda * row.games;
    grouped.set(key, group);
  }
  const rows: ChampionMetaRow[] = [...grouped.values()].map((row) => {
    const rawWinRate = row.games ? 100 * row.wins / row.games : 0;
    const winRate = 100 * (row.wins + 50) / (row.games + 100);
    const established = row.games >= 100;
    const tier: ChampionMetaRow['tier'] = winRate >= 53 ? 'S+' : winRate >= 51.5 ? 'S' : winRate >= 49.5 ? 'A' : 'B';
    return { name: row.name, role: row.role, tier, winRate, rawWinRate, pickRate: 100 * row.games / Math.max(row.roleGames, 1), banRate: 100 * row.bans / Math.max(row.sampledMatches, 1), games: row.games.toLocaleString('en-US'), kda: row.kdaTotal / Math.max(row.games, 1), strongInto: [], established };
  });
  const matches = patch ? Math.max(0, ...rollups.map((row) => row.sampledMatches)) : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Champion meta</div>
        <h1>Champion stats, without borrowed rankings</h1>
        <p className="page-sub">Ranked Solo/Duo match samples from GapDiff&apos;s own collector. Rankings only appear after 100 games per champion and role.</p>
        <form action="/champions" className={styles.rankFilter}>
          <label>Rank tier
            <select name="tier" defaultValue={tier ?? ''}>
              <option value="">All ranks</option>
              {TIERS.map((item) => <option key={item} value={item}>{item[0]}{item.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <button type="submit">Apply</button>
        </form>
      </header>
      {rows.length ? (
        <>
          <ChampionMetaPreview version={version} rows={rows} scope={{ region: 'EUW', queue: 'Ranked Solo/Duo', patch: patch ?? 'Unknown', sample: `${matches.toLocaleString('en-US')}+ matches` }} preview={false} />
          <p className="note"><b>Current-rank sample.</b> {tier ? `This view uses games collected from accounts currently in ${tier[0]}${tier.slice(1).toLowerCase()}.` : 'This view combines all currently sampled rank tiers.'} Win rate is adjusted toward 50% over 100 prior games; raw win rate remains visible.</p>
        </>
      ) : <p className="note">No public ranked-match sample has been collected yet. Champion rankings will appear after the collector runs.</p>}
    </div>
  );
}
