import Link from 'next/link';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { championMetaRollups, championMetaTierRollups, metaChampionLoadouts, metaMatchCohorts, metaSampleMatches } from '@/db/schema';
import { db } from '@/db';
import { championIcon, itemIcon, latestVersion, rankEmblem, runeIcon, spellIcon } from '@/lib/ddragon';
import { findRankFilter, RANK_FILTERS } from '@/lib/championMetaRanks';
import styles from './page.module.css';

const roleLabels: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Middle', BOTTOM: 'Bottom', UTILITY: 'Support' };
const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
type Loadout = typeof metaChampionLoadouts.$inferSelect;

export default async function ChampionDetailPage({ params, searchParams }: { params: Promise<{ champion: string }>; searchParams: Promise<{ role?: string; tier?: string }> }) {
  const champion = decodeURIComponent((await params).champion);
  const filters = await searchParams;
  const rankFilter = findRankFilter(filters.tier);
  const newest = await db.select({ patch: metaSampleMatches.patch }).from(metaSampleMatches).orderBy(desc(metaSampleMatches.gameCreation)).limit(1);
  const patch = newest[0]?.patch;
  if (!patch) notFound();
  // Keep this deliberately sequential: Neon Free has a small connection budget
  // and the shared layout is querying at the same time as this report.
  const version = await latestVersion();
  const rows = await db.select().from(championMetaRollups).where(and(eq(championMetaRollups.patch, patch), eq(championMetaRollups.championName, champion)));
  const tierRows = await db.select().from(championMetaTierRollups).where(and(eq(championMetaTierRollups.patch, patch), eq(championMetaTierRollups.championName, champion)));
  const sampleResult = await db.select({ matches: count() }).from(metaSampleMatches).where(eq(metaSampleMatches.patch, patch));
  const candidateLoadouts = await db.select().from(metaChampionLoadouts).innerJoin(metaSampleMatches, eq(metaChampionLoadouts.matchId, metaSampleMatches.matchId)).where(and(eq(metaSampleMatches.patch, patch), eq(metaChampionLoadouts.championName, champion)));
  if (!rows.length) notFound();
  let loadouts: Loadout[] = candidateLoadouts.map((row) => row.meta_champion_loadouts);
  if (rankFilter.tiers) {
    const cohorts = await db.select({ matchId: metaMatchCohorts.matchId }).from(metaMatchCohorts).innerJoin(metaSampleMatches, eq(metaMatchCohorts.matchId, metaSampleMatches.matchId)).where(and(eq(metaSampleMatches.patch, patch), inArray(metaMatchCohorts.tier, [...rankFilter.tiers])));
    const allowed = new Set(cohorts.map((row) => row.matchId));
    loadouts = loadouts.filter((row) => allowed.has(row.matchId));
  }
  const rolesForChampion = rows.filter((row) => roles.includes(row.role)).sort((a, b) => b.games - a.games);
  const selectedRole = roles.includes(filters.role ?? '') ? filters.role! : rolesForChampion[0]?.role ?? 'TOP';
  const selected = loadouts.filter((row) => row.role === selectedRole);
  const selectedTiers = new Set<string>(rankFilter.tiers ?? []);
  const summaryRows = rankFilter.tiers ? tierRows.filter((row) => selectedTiers.has(row.tier) && row.role === selectedRole) : rows.filter((row) => row.role === selectedRole);
  const games = summaryRows.reduce((total, row) => total + row.games, 0);
  const wins = summaryRows.reduce((total, row) => total + row.wins, 0);
  const roleGames = summaryRows.reduce((total, row) => total + row.roleGames, 0);
  const kda = summaryRows.reduce((total, row) => total + row.averageKda * row.games, 0) / Math.max(games, 1);
  const adjustedWinRate = 100 * (wins + 50) / (games + 100);
  const rawWinRate = 100 * wins / Math.max(games, 1);
  const tier = adjustedWinRate >= 53 ? 'S+' : adjustedWinRate >= 51.5 ? 'S' : adjustedWinRate >= 49.5 ? 'A' : 'B';
  const builds = corePairs(selected).slice(0, 3);
  const runes = grouped(selected.filter((row) => row.primaryRuneId), (row) => `${row.primaryRuneId}-${row.secondaryRuneStyleId ?? 0}`).slice(0, 3);
  const spells = grouped(selected, (row) => [row.spell1Id, row.spell2Id].sort((a, b) => a - b).join('-')).slice(0, 3);
  const skills = grouped(selected.filter((row) => row.skillOrder.length >= 6), (row) => row.skillOrder.slice(0, 9).join('-')).slice(0, 3);
  const matchups = grouped(selected.filter((row) => row.opponentChampionName), (row) => row.opponentChampionName!).filter((row) => row.count >= 8).map((row) => ({ ...row, winRate: 100 * row.wins / row.count })).sort((a, b) => a.winRate - b.winRate || b.count - a.count);
  return <div className={`page ${styles.pageScope}`}>
    <Link className={styles.back} href="/champions">Back to champion meta</Link>
    <header className={styles.hero}><img src={championIcon(version, champion)} alt="" /><div><h1>{champion} {roleLabels[selectedRole]} build</h1><span>Patch {patch} · Ranked Solo/Duo · EUW sample</span></div><div className={styles.tier}>{tier}<small>tier</small></div></header>
    <form className={styles.filters}><label>Rank<div className={styles.selectWrap}>{rankFilter.emblem ? <img className={styles.filterEmblem} src={rankEmblem(rankFilter.emblem)} alt="" /> : null}<select name="tier" defaultValue={rankFilter.key}>{RANK_FILTERS.map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}</select></div></label><label>Role<select name="role" defaultValue={selectedRole}>{rolesForChampion.map((row) => <option key={row.role} value={row.role}>{roleLabels[row.role] ?? row.role}</option>)}</select></label><button type="submit">Update report</button></form>
    <section className={styles.metrics}><Metric label="Adjusted win rate" value={`${adjustedWinRate.toFixed(1)}%`} detail={`raw ${rawWinRate.toFixed(1)}%`} /><Metric label="Games sampled" value={games.toLocaleString('en-US')} detail={`${selected.length.toLocaleString('en-US')} loadouts`} /><Metric label="Pick rate" value={`${(100 * games / Math.max(roleGames, 1)).toFixed(1)}%`} detail={`${roleLabels[selectedRole]} only`} /><Metric label="Average KDA" value={kda.toFixed(2)} detail="kills + assists / deaths" /><Metric label="Patch sample" value={(sampleResult[0]?.matches ?? 0).toLocaleString('en-US')} detail="ranked matches" /></section>
    <section className={styles.grid}><Panel title="Most common builds" detail="Common core-item pairs" empty={!builds.length}>{builds.map(({ key, ...build }) => <BuildRow key={key} version={version} ids={itemNumbers(key)} {...build} total={selected.length} />)}</Panel><Panel title="Rune pages" detail="Primary keystone + secondary tree" empty={!runes.length}>{runes.map(({ key, ...rune }) => <RuneRow key={key} version={version} ids={numbers(key)} {...rune} total={selected.length} />)}</Panel><Panel title="Summoner spells" detail="Most used pairings" empty={!spells.length}>{spells.map(({ key, ...spell }) => <SpellRow key={key} version={version} ids={numbers(key)} {...spell} total={selected.length} />)}</Panel><Panel title="Skill order" detail="First nine points, from match timelines" empty={!skills.length}>{skills.map(({ key, ...skill }) => <SkillRow key={key} order={numbers(key)} {...skill} total={selected.length} />)}</Panel></section>
    <section className={styles.matchups}><Matchup title="Weak against" rows={matchups.slice(0, 5)} version={version} /><Matchup title="Strong against" rows={[...matchups].reverse().slice(0, 5)} version={version} /></section>
    <p className={styles.note}>Build, rune, spell, and matchup panels use only observed matches. Skill orders fill as new match timelines are collected; they are never guessed.</p>
  </div>;
}

function grouped(rows: Loadout[], keyFor: (row: Loadout) => string) { const map = new Map<string, { key: string; count: number; wins: number }>(); for (const row of rows) { const key = keyFor(row); const current = map.get(key) ?? { key, count: 0, wins: 0 }; current.count++; if (row.win) current.wins++; map.set(key, current); } return [...map.values()].sort((a, b) => b.count - a.count); }
function corePairs(rows: Loadout[]) { const totals = new Map<string, { key: string; count: number; wins: number }>(); for (const row of rows) { const ids = [...new Set((row.itemIds ?? []).filter((id) => id > 0 && id !== 3340))].sort((a, b) => a - b); ids.forEach((first, index) => ids.slice(index + 1).forEach((second) => { const key = `${first}-${second}`; const current = totals.get(key) ?? { key, count: 0, wins: 0 }; current.count++; if (row.win) current.wins++; totals.set(key, current); })); } return [...totals.values()].filter((row) => row.count >= 3).sort((a, b) => b.count - a.count || b.wins / b.count - a.wins / a.count); }
function numbers(value: string) { return value.split('-').map(Number).filter(Number.isFinite); }
function itemNumbers(value: string) { try { return (JSON.parse(value) as unknown[]).map(Number).filter((id) => Number.isFinite(id) && id > 0 && id !== 3340).slice(0, 3); } catch { return []; } }
function summary(count: number, wins: number, total: number) { return `${(100 * count / Math.max(total, 1)).toFixed(1)}% pick · ${(100 * wins / Math.max(count, 1)).toFixed(1)}% WR`; }
function Panel({ title, detail, empty, children }: { title: string; detail: string; empty: boolean; children: React.ReactNode }) { return <section className={styles.panel}><header><h2>{title}</h2><span>{detail}</span></header>{empty ? <p className={styles.empty}>More fresh samples are needed for this section.</p> : <div className={styles.rows}>{children}</div>}</section>; }
function BuildRow({ version, ids, count, wins, total }: { version: string; ids: number[]; count: number; wins: number; total: number }) { return <div className={styles.dataRow}><Icons urls={ids.map((id) => itemIcon(version, id))} /><b>{summary(count, wins, total)}</b><span>{count} games</span></div>; }
function RuneRow({ version, ids, count, wins, total }: { version: string; ids: number[]; count: number; wins: number; total: number }) { return <div className={styles.dataRow}><Icons urls={ids.map(runeIcon)} /><b>{summary(count, wins, total)}</b><span>{count} games</span></div>; }
function SpellRow({ version, ids, count, wins, total }: { version: string; ids: number[]; count: number; wins: number; total: number }) { return <div className={styles.dataRow}><Icons urls={ids.map((id) => spellIcon(version, id)).filter((url): url is string => Boolean(url))} /><b>{summary(count, wins, total)}</b><span>{count} games</span></div>; }
function SkillRow({ order, count, wins, total }: { order: number[]; count: number; wins: number; total: number }) { return <div className={styles.dataRow}><div className={styles.skills}>{order.map((slot, index) => <span key={index}>{['Q', 'W', 'E', 'R'][slot - 1]}</span>)}</div><b>{summary(count, wins, total)}</b><span>{count} games</span></div>; }
function Icons({ urls }: { urls: string[] }) { return <div className={styles.icons}>{urls.map((url) => <img key={url} src={url} alt="" />)}</div>; }
function Matchup({ title, rows, version }: { title: string; rows: Array<{ key: string; count: number; wins: number; winRate: number }>; version: string }) { return <div><h2>{title}</h2><p>{title === 'Weak against' ? 'Lowest' : 'Highest'} lane win rates; at least 8 direct matchups.</p>{rows.length ? <div className={styles.matchupRows}>{rows.map((row) => <div key={row.key}><img src={championIcon(version, row.key)} alt="" /><b>{row.key}</b><span>{row.count} games</span><strong>{row.winRate.toFixed(1)}% WR</strong></div>)}</div> : <p className={styles.empty}>Not enough direct lane data yet.</p>}</div>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
