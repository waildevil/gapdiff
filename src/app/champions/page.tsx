import { desc, eq } from 'drizzle-orm';
import { ChampionMetaPreview, type ChampionMetaRow } from '@/components/ChampionMetaPreview';
import { db } from '@/db';
import { championMetaRollups, metaSampleMatches } from '@/db/schema';
import { latestVersion } from '@/lib/ddragon';

export const metadata = {
  title: 'Champion meta | gapdiff',
  description: 'Champion meta for Ranked Solo/Duo, built from GapDiff match samples.',
};

export default async function ChampionsPage() {
  const version = await latestVersion();
  const newest = await db.select({ patch: metaSampleMatches.patch }).from(metaSampleMatches).orderBy(desc(metaSampleMatches.gameCreation)).limit(1);
  const patch = newest[0]?.patch;
  const rollups = patch ? await db.select().from(championMetaRollups).where(eq(championMetaRollups.patch, patch)) : [];
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
      </header>
      {rows.length ? (
        <>
          <ChampionMetaPreview version={version} rows={rows} scope={{ region: 'Collected regions', queue: 'Ranked Solo/Duo', patch: patch ?? 'Unknown', sample: `${matches.toLocaleString('en-US')}+ matches` }} preview={false} />
          <p className="note"><b>Sampled data, not a full census.</b> Win rate is adjusted toward 50% over 100 prior games; raw win rate remains visible. Rank and region filters need a larger, labelled sample. Matchups are not calculated yet.</p>
        </>
      ) : <p className="note">No public ranked-match sample has been collected yet. Champion rankings will appear after the collector runs.</p>}
    </div>
  );
}
