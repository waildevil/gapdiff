import { and, desc, eq, inArray } from 'drizzle-orm';
import { ChampionMetaPreview, type ChampionMetaRow } from '@/components/ChampionMetaPreview';
import { RankTierFilter } from '@/components/RankTierFilter';
import { db } from '@/db';
import { championMetaRollups, championMetaTierRollups, metaMatchCohorts, metaSampleMatches } from '@/db/schema';
import { findRankFilter } from '@/lib/championMetaRanks';
import { latestVersion } from '@/lib/ddragon';
import styles from '@/components/ChampionMetaPreview.module.css';

export const metadata = {
  title: 'Champion meta | gapdiff',
  description: 'Champion meta for Ranked Solo/Duo, built from GapDiff match samples.',
};

/** A smaller sample is shown nowhere: it is too easy for one odd game to lie. */
const MINIMUM_DISPLAY_GAMES = 20;

export default async function ChampionsPage({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const version = await latestVersion();
  const rankFilter = findRankFilter((await searchParams).tier);
  const newest = await db.select({ patch: metaSampleMatches.patch }).from(metaSampleMatches).orderBy(desc(metaSampleMatches.gameCreation)).limit(1);
  const patch = newest[0]?.patch;
  const rollups = patch
    ? rankFilter.tiers
      ? await db.select().from(championMetaTierRollups).where(and(eq(championMetaTierRollups.patch, patch), inArray(championMetaTierRollups.tier, [...rankFilter.tiers])))
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
  const rows: ChampionMetaRow[] = [...grouped.values()].filter((row) => row.games >= MINIMUM_DISPLAY_GAMES).map((row) => {
    const rawWinRate = row.games ? 100 * row.wins / row.games : 0;
    const winRate = 100 * (row.wins + 50) / (row.games + 100);
    const established = row.games >= 100;
    const tier: ChampionMetaRow['tier'] = winRate >= 53 ? 'S+' : winRate >= 51.5 ? 'S' : winRate >= 49.5 ? 'A' : 'B';
    return { name: row.name, role: row.role, tier, winRate, rawWinRate, pickRate: 100 * row.games / Math.max(row.roleGames, 1), banRate: 100 * row.bans / Math.max(row.sampledMatches, 1), games: row.games.toLocaleString('en-US'), kda: row.kdaTotal / Math.max(row.games, 1), strongInto: [], established };
  });
  const cohortMatches = patch && rankFilter.tiers
    ? await db.select({ matchId: metaMatchCohorts.matchId }).from(metaMatchCohorts).innerJoin(metaSampleMatches, eq(metaSampleMatches.matchId, metaMatchCohorts.matchId)).where(and(eq(metaSampleMatches.patch, patch), inArray(metaMatchCohorts.tier, [...rankFilter.tiers])))
    : [];
  const matches = rankFilter.tiers ? new Set(cohortMatches.map((row) => row.matchId)).size : patch ? Math.max(0, ...rollups.map((row) => row.sampledMatches)) : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Champion meta</div>
        <h1>Champion stats, without borrowed rankings</h1>
        <p className="page-sub">Ranked Solo/Duo match samples from GapDiff&apos;s own collector. Champions need 20 games in a lane to appear, and 100 games to be ranked.</p>
        <RankTierFilter selected={rankFilter.key} />
      </header>
      {rows.length ? (
        <>
          <ChampionMetaPreview version={version} rows={rows} scope={{ region: 'EUW', queue: 'Ranked Solo/Duo', patch: patch ?? 'Unknown', sample: `${matches.toLocaleString('en-US')}+ matches` }} preview={false} />
          <p className="note"><b>Current-rank sample.</b> {rankFilter.tiers ? `This view uses games collected from accounts currently in ${rankFilter.label}.` : 'This view combines all currently sampled rank tiers.'} Win rate is adjusted toward 50% over 100 prior games; raw win rate remains visible.</p>
        </>
      ) : rollups.length ? <p className="note">This rank filter has data, but no champion has reached the 20-game display minimum yet.</p> : <p className="note">No public ranked-match sample has been collected yet. Champion rankings will appear after the collector runs.</p>}
    </div>
  );
}
