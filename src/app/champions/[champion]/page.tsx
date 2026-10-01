import Link from 'next/link';
import { and, count, desc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { championMetaRollups, championMetaTierRollups, metaSampleMatches } from '@/db/schema';
import { db } from '@/db';
import { championIcon, latestVersion } from '@/lib/ddragon';
import styles from './page.module.css';

const roleLabels: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Middle', BOTTOM: 'Bottom', UTILITY: 'Support' };
const rankOrder = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'];

export default async function ChampionDetailPage({ params }: { params: Promise<{ champion: string }> }) {
  const champion = decodeURIComponent((await params).champion);
  const newest = await db.select({ patch: metaSampleMatches.patch }).from(metaSampleMatches).orderBy(desc(metaSampleMatches.gameCreation)).limit(1);
  const patch = newest[0]?.patch;
  if (!patch) notFound();

  const [version, rows, tierRows, sampleResult] = await Promise.all([
    latestVersion(),
    db.select().from(championMetaRollups).where(and(eq(championMetaRollups.patch, patch), eq(championMetaRollups.championName, champion))),
    db.select().from(championMetaTierRollups).where(and(eq(championMetaTierRollups.patch, patch), eq(championMetaTierRollups.championName, champion))),
    db.select({ matches: count() }).from(metaSampleMatches).where(eq(metaSampleMatches.patch, patch)),
  ]);
  if (!rows.length) notFound();

  const games = rows.reduce((total, row) => total + row.games, 0);
  const wins = rows.reduce((total, row) => total + row.wins, 0);
  const roleGames = rows.reduce((total, row) => total + row.roleGames, 0);
  const kda = rows.reduce((total, row) => total + row.averageKda * row.games, 0) / Math.max(games, 1);
  const bans = Math.max(...rows.map((row) => row.bans));
  const sampledMatches = sampleResult[0]?.matches ?? 0;
  const adjustedWinRate = 100 * (wins + 50) / (games + 100);
  const rawWinRate = 100 * wins / Math.max(games, 1);
  const tier = adjustedWinRate >= 53 ? 'S+' : adjustedWinRate >= 51.5 ? 'S' : adjustedWinRate >= 49.5 ? 'A' : 'B';

  const rankRows = rankOrder.map((rank) => {
    const rowsForRank = tierRows.filter((row) => row.tier === rank);
    const rankGames = rowsForRank.reduce((total, row) => total + row.games, 0);
    const rankWins = rowsForRank.reduce((total, row) => total + row.wins, 0);
    return { rank, games: rankGames, winRate: rankGames ? 100 * rankWins / rankGames : 0 };
  }).filter((row) => row.games > 0);

  return (
    <div className="page">
      <Link className={styles.back} href="/champions">← Back to champion meta</Link>
      <header className={styles.hero}>
        <img src={championIcon(version, champion)} alt="" />
        <div>
          <p>Champion report · Patch {patch}</p>
          <h1>{champion}</h1>
          <span>Ranked Solo/Duo · EUW sample</span>
        </div>
        <div className={styles.tier}>{tier}<small>tier</small></div>
      </header>

      <section className={styles.metrics} aria-label={`${champion} overall statistics`}>
        <Metric label="Adjusted win rate" value={`${adjustedWinRate.toFixed(1)}%`} detail={`raw ${rawWinRate.toFixed(1)}%`} />
        <Metric label="Games sampled" value={games.toLocaleString('en-US')} detail={`${sampledMatches.toLocaleString('en-US')} patch matches`} />
        <Metric label="Pick rate" value={`${(100 * games / Math.max(roleGames, 1)).toFixed(1)}%`} detail="across played roles" />
        <Metric label="Ban rate" value={`${(100 * bans / Math.max(sampledMatches, 1)).toFixed(1)}%`} detail="of sampled matches" />
        <Metric label="Average KDA" value={kda.toFixed(2)} detail="kills + assists / deaths" />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><p>Role performance</p><h2>Where {champion} is being played</h2></div><span>{games.toLocaleString('en-US')} games total</span></div>
        <div className={styles.roleRows}>
          {rows.sort((a, b) => b.games - a.games).map((row) => (
            <div className={styles.roleRow} key={row.role}>
              <b>{roleLabels[row.role] ?? row.role}</b>
              <span>{row.games.toLocaleString('en-US')} games</span>
              <span>{(100 * (row.wins + 50) / (row.games + 100)).toFixed(1)}% <i>adjusted WR</i></span>
              <span>{(100 * row.games / Math.max(row.roleGames, 1)).toFixed(1)}% <i>pick rate</i></span>
              <span>{row.averageKda.toFixed(2)} <i>KDA</i></span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><p>Rank cohort</p><h2>Results by sampled player rank</h2></div><span>Current rank at collection</span></div>
        {rankRows.length ? <div className={styles.rankRows}>{rankRows.map((row) => <div key={row.rank}><b>{row.rank}</b><span>{row.games.toLocaleString('en-US')} games</span><strong>{row.winRate.toFixed(1)}%</strong></div>)}</div> : <p className={styles.empty}>Rank-specific samples are still building for {champion}.</p>}
      </section>

      <p className={styles.note}>Adjusted win rate is smoothed toward 50% over 100 prior games, so small samples do not claim a false top tier.</p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
