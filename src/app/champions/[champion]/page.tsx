import Link from 'next/link';
import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { championMetaRollups, championMetaTierRollups, metaChampionLoadouts, metaMatchCohorts, metaSampleMatches } from '@/db/schema';
import { db } from '@/db';
import { championAbilityIcons, championIcon, itemIcon, latestVersion, runeCatalog, spellIcon, statRuneIcon, type RuneCatalogTree } from '@/lib/ddragon';
import { findRankFilter, RANK_FILTERS } from '@/lib/championMetaRanks';
import { AutoFilters } from './AutoFilters';
import styles from './page.module.css';

const roleLabels: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Middle', BOTTOM: 'Bottom', UTILITY: 'Support' };
const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const roleSlugs: Record<string, string> = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'support' };
const roleFromSlug: Record<string, string> = { top: 'TOP', jungle: 'JUNGLE', middle: 'MIDDLE', bottom: 'BOTTOM', support: 'UTILITY', utility: 'UTILITY' };
const roleSlug = (role: string) => roleSlugs[role] ?? role.toLowerCase();
type Loadout = typeof metaChampionLoadouts.$inferSelect;

export default async function ChampionDetailPage({ params, searchParams }: { params: Promise<{ champion: string }>; searchParams: Promise<{ role?: string; tier?: string }> }) {
  const requestedChampion = decodeURIComponent((await params).champion);
  const filters = await searchParams;
  if (requestedChampion !== requestedChampion.toLowerCase()) {
    const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
    redirect(`/champions/${requestedChampion.toLowerCase()}${query.size ? `?${query}` : ''}`);
  }
  const requestedRole = filters.role?.toLowerCase();
  const canonicalRole = requestedRole ? roleFromSlug[requestedRole] : undefined;
  if (filters.role && canonicalRole && filters.role !== roleSlug(canonicalRole)) {
    const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
    query.set('role', roleSlug(canonicalRole));
    redirect(`/champions/${requestedChampion}?${query}`);
  }
  const rankFilter = findRankFilter(filters.tier);
  const newest = await db.select({ patch: metaSampleMatches.patch }).from(metaSampleMatches).orderBy(desc(metaSampleMatches.gameCreation)).limit(1);
  const patch = newest[0]?.patch;
  if (!patch) notFound();
  // Keep this deliberately sequential: Neon Free has a small connection budget
  // and the shared layout is querying at the same time as this report.
  const version = await latestVersion();
  const rows = await db.select().from(championMetaRollups).where(and(eq(championMetaRollups.patch, patch), ilike(championMetaRollups.championName, requestedChampion)));
  if (!rows.length) notFound();
  const champion = rows[0]!.championName;
  const [runeTrees, abilityIcons] = await Promise.all([runeCatalog(version), championAbilityIcons(version, champion)]);
  const tierRows = await db.select().from(championMetaTierRollups).where(and(eq(championMetaTierRollups.patch, patch), eq(championMetaTierRollups.championName, champion)));
  const sampleResult = await db.select({ matches: count() }).from(metaSampleMatches).where(eq(metaSampleMatches.patch, patch));
  const candidateLoadouts = await db.select().from(metaChampionLoadouts).innerJoin(metaSampleMatches, eq(metaChampionLoadouts.matchId, metaSampleMatches.matchId)).where(and(eq(metaSampleMatches.patch, patch), eq(metaChampionLoadouts.championName, champion)));
  let loadouts: Loadout[] = candidateLoadouts.map((row) => row.meta_champion_loadouts);
  if (rankFilter.tiers) {
    const cohorts = await db.select({ matchId: metaMatchCohorts.matchId }).from(metaMatchCohorts).innerJoin(metaSampleMatches, eq(metaMatchCohorts.matchId, metaSampleMatches.matchId)).where(and(eq(metaSampleMatches.patch, patch), inArray(metaMatchCohorts.tier, [...rankFilter.tiers])));
    const allowed = new Set(cohorts.map((row) => row.matchId));
    loadouts = loadouts.filter((row) => allowed.has(row.matchId));
  }
  const rolesForChampion = rows.filter((row) => roles.includes(row.role)).sort((a, b) => b.games - a.games);
  const selectedRole = canonicalRole && roles.includes(canonicalRole) ? canonicalRole : rolesForChampion[0]?.role ?? 'TOP';
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
  const builds = completedBuilds(selected).slice(0, 3);
  const runes = grouped(selected.filter((row) => row.primaryRuneId), (row) => JSON.stringify({ runes: row.runeIds, stats: row.statRuneIds, tree: row.secondaryRuneStyleId })).slice(0, 3);
  const runeUsage = usageRates(selected.flatMap((row) => row.runeIds));
  const shardUsage = usageRates(selected.flatMap((row) => row.statRuneIds));
  const spells = grouped(selected, (row) => [row.spell1Id, row.spell2Id].sort((a, b) => a - b).join('-')).slice(0, 3);
  const skills = grouped(selected.filter((row) => row.skillOrder.length >= 6), (row) => row.skillOrder.slice(0, 9).join('-')).slice(0, 3);
  const matchups = grouped(selected.filter((row) => row.opponentChampionName), (row) => row.opponentChampionName!).filter((row) => row.count >= 8).map((row) => ({ ...row, winRate: 100 * row.wins / row.count })).sort((a, b) => a.winRate - b.winRate || b.count - a.count);
  return <div className={`page ${styles.pageScope}`}>
    <Link className={styles.back} href="/champions">Back to champion meta</Link>
    <header className={styles.hero}><img src={championIcon(version, champion)} alt="" /><div><h1>{champion} {roleLabels[selectedRole]} build</h1><span>Patch {patch} · Ranked Solo/Duo · EUW sample</span></div><div className={styles.tier}>{tier}<small>tier</small></div></header>
    <AutoFilters rank={rankFilter.key} role={roleSlug(selectedRole)} ranks={RANK_FILTERS} roles={rolesForChampion.map((row) => ({ key: roleSlug(row.role), label: roleLabels[row.role] ?? row.role }))} />
    <section className={styles.metrics}><Metric label="Adjusted win rate" value={`${adjustedWinRate.toFixed(1)}%`} detail={`raw ${rawWinRate.toFixed(1)}%`} /><Metric label="Games sampled" value={games.toLocaleString('en-US')} detail={`${selected.length.toLocaleString('en-US')} loadouts`} /><Metric label="Pick rate" value={`${(100 * games / Math.max(roleGames, 1)).toFixed(1)}%`} detail={`${roleLabels[selectedRole]} only`} /><Metric label="Average KDA" value={kda.toFixed(2)} detail="kills + assists / deaths" /><Metric label="Patch sample" value={(sampleResult[0]?.matches ?? 0).toLocaleString('en-US')} detail="ranked matches" /></section>
    <div className={styles.reportLayout}>
      <div className={styles.buildColumn}>
        <Panel title={`${champion} runes`} detail="Most played rune setup" empty={!runes.length}>{runes[0] ? <RuneMatrix catalog={runeTrees} {...runePage(runes[0].key)} runeUsage={runeUsage} shardUsage={shardUsage} count={runes[0].count} wins={runes[0].wins} total={selected.length} /> : null}</Panel>
        <Panel title="Summoner spells" detail="Most used pairings" empty={!spells.length}>{spells.map(({ key, ...spell }) => <SpellRow key={key} version={version} ids={numbers(key)} {...spell} total={selected.length} />)}</Panel>
        <Panel title="Skill order" detail="First nine points, from match timelines" empty={!skills.length}>{skills.map(({ key, ...skill }) => <SkillRow key={key} icons={abilityIcons} order={numbers(key)} {...skill} total={selected.length} />)}</Panel>
        <Panel title="Most common builds" detail="Boots + three completed items" empty={!builds.length}>{builds.map(({ key, ...build }) => <BuildRow key={key} version={version} ids={itemNumbers(key)} {...build} total={selected.length} />)}</Panel>
      </div>
      <aside className={styles.matchupRail} aria-label={`${champion} matchup overview`}>
        <section className={styles.matchupPanel}>
          <header><h2>{champion} counters</h2><span>Direct lane matchups</span></header>
          <Matchup title="Weak against" rows={matchups.slice(0, 5)} version={version} />
          <Matchup title="Strong against" rows={[...matchups].reverse().slice(0, 5)} version={version} />
        </section>
      </aside>
    </div>
    <p className={styles.note}>Build, rune, spell, and matchup panels use only observed matches. Skill orders fill as new match timelines are collected; they are never guessed.</p>
  </div>;
}

function grouped(rows: Loadout[], keyFor: (row: Loadout) => string) { const map = new Map<string, { key: string; count: number; wins: number }>(); for (const row of rows) { const key = keyFor(row); const current = map.get(key) ?? { key, count: 0, wins: 0 }; current.count++; if (row.win) current.wins++; map.set(key, current); } return [...map.values()].sort((a, b) => b.count - a.count); }
function usageRates(ids: number[]) { const counts = new Map<number, number>(); ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)); return counts; }
const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158, 3169, 3170, 3171, 3172, 3173, 3174, 3175, 3176]);
function completedBuilds(rows: Loadout[]) { const totals = new Map<string, { key: string; count: number; wins: number }>(); for (const row of rows) { const ids = [...new Set((row.itemIds ?? []).filter((id) => id > 0 && id !== 3340))]; const boot = ids.find((id) => BOOT_IDS.has(id)); const core = ids.filter((id) => !BOOT_IDS.has(id)).slice(0, 3); if (!boot || core.length < 3) continue; const key = [boot, ...core].join('-'); const current = totals.get(key) ?? { key, count: 0, wins: 0 }; current.count++; if (row.win) current.wins++; totals.set(key, current); } return [...totals.values()].sort((a, b) => b.count - a.count || b.wins / b.count - a.wins / a.count); }
function numbers(value: string) { return value.split('-').map(Number).filter(Number.isFinite); }
function itemNumbers(value: string) { if (value.includes('-')) return value.split('-').map(Number).filter((id) => Number.isFinite(id) && id > 0 && id !== 3340); try { return (JSON.parse(value) as unknown[]).map(Number).filter((id) => Number.isFinite(id) && id > 0 && id !== 3340).slice(0, 3); } catch { return []; } }
function runePage(value: string) { try { const parsed = JSON.parse(value) as { runes?: number[]; stats?: number[]; tree?: number }; return { runeIds: parsed.runes ?? [], treeId: parsed.tree ?? 0, statIds: parsed.stats ?? [] }; } catch { return { runeIds: [], treeId: 0, statIds: [] }; } }
function summary(count: number, wins: number, total: number) { return `${(100 * count / Math.max(total, 1)).toFixed(1)}% pick · ${(100 * wins / Math.max(count, 1)).toFixed(1)}% WR`; }
function Panel({ title, detail, empty, children }: { title: string; detail: string; empty: boolean; children: React.ReactNode }) { return <section className={styles.panel}><header><h2>{title}</h2><span>{detail}</span></header>{empty ? <p className={styles.empty}>More fresh samples are needed for this section.</p> : <div className={styles.rows}>{children}</div>}</section>; }
function BuildRow({ version, ids, count, wins, total }: { version: string; ids: number[]; count: number; wins: number; total: number }) { return <div className={styles.dataRow}><Icons urls={ids.map((id) => itemIcon(version, id))} /><b>{summary(count, wins, total)}</b><span>{count} games</span></div>; }
function RuneMatrix({ catalog, runeIds, treeId, statIds, runeUsage, shardUsage, count, wins, total }: { catalog: RuneCatalogTree[]; runeIds: number[]; treeId: number; statIds: number[]; runeUsage: Map<number, number>; shardUsage: Map<number, number>; count: number; wins: number; total: number }) { const primary = catalog.find((tree) => tree.slots.some((slot) => slot.some((rune) => rune.id === runeIds[0]))); const secondary = catalog.find((tree) => tree.id === treeId); return <div className={styles.runeMatrix}><div className={styles.runeMatrixHead}><div><b>{(100 * count / Math.max(total, 1)).toFixed(1)}%</b><span>pick rate · {count} games</span></div><div><b className={(100 * wins / Math.max(count, 1)) >= 50 ? styles.positive : styles.negative}>{(100 * wins / Math.max(count, 1)).toFixed(1)}%</b><span>win rate</span></div></div><div className={styles.runeColumns}>{primary ? <RunePath tree={primary} selected={new Set(runeIds.slice(0, 4))} usage={runeUsage} total={total} /> : null}{secondary ? <RunePath tree={secondary} selected={new Set(runeIds.slice(4, 6))} usage={runeUsage} total={total} secondary /> : null}<ShardPath selected={statIds} usage={shardUsage} total={total} /></div></div>; }
function RunePath({ tree, selected, usage, total, secondary = false }: { tree: RuneCatalogTree; selected: Set<number>; usage: Map<number, number>; total: number; secondary?: boolean }) { return <section className={`${styles.runePath} ${secondary ? styles.secondaryPath : ''}`}><header><img src={tree.icon} alt="" /><b>{tree.name}</b></header>{tree.slots.map((slot, index) => <div className={styles.runeSlot} key={index}>{slot.map((rune) => <RuneChoice key={rune.id} id={rune.id} name={rune.name} icon={rune.icon} selected={selected.has(rune.id)} rate={100 * (usage.get(rune.id) ?? 0) / Math.max(total, 1)} />)}</div>)}</section>; }
function RuneChoice({ name, icon, selected, rate }: { id: number; name: string; icon: string; selected: boolean; rate: number }) { return <div className={`${styles.runeChoice} ${selected ? styles.runeSelected : ''}`} title={name}><img src={icon} alt={name} /><span>{rate.toFixed(0)}%</span></div>; }
const SHARD_ROWS = [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]];
function ShardPath({ selected, usage, total }: { selected: number[]; usage: Map<number, number>; total: number }) { return <section className={`${styles.runePath} ${styles.shardPath}`}><header><b>Shards</b></header>{SHARD_ROWS.map((row, index) => <div className={styles.runeSlot} key={index}>{row.map((id) => <RuneChoice key={`${id}-${index}`} id={id} name="Stat shard" icon={statRuneIcon(id)} selected={selected[index] === id} rate={100 * (usage.get(id) ?? 0) / Math.max(total, 1)} />)}</div>)}</section>; }
function SpellRow({ version, ids, count, wins, total }: { version: string; ids: number[]; count: number; wins: number; total: number }) { return <div className={styles.dataRow}><Icons urls={ids.map((id) => spellIcon(version, id)).filter((url): url is string => Boolean(url))} /><b>{summary(count, wins, total)}</b><span>{count} games</span></div>; }
function SkillRow({ icons, order, count, wins, total }: { icons: Record<'Q' | 'W' | 'E' | 'R', string>; order: number[]; count: number; wins: number; total: number }) { return <div className={styles.skillRow}><div className={styles.abilityIcons}>{(['Q', 'W', 'E', 'R'] as const).map((key) => <div key={key}>{icons[key] ? <img src={icons[key]} alt={`${key} ability`} /> : null}<b>{key}</b></div>)}</div><div className={styles.skillTimeline}>{order.map((slot, index) => { const key = ['Q', 'W', 'E', 'R'][slot - 1] ?? '?'; return <span key={index} className={styles[`skill${key}`]}><small>{index + 1}</small><b>{key}</b></span>; })}</div><div className={styles.skillStats}><b>{summary(count, wins, total)}</b><span>{count} games</span></div></div>; }
function Icons({ urls }: { urls: string[] }) { return <div className={styles.icons}>{urls.map((url) => <img key={url} src={url} alt="" />)}</div>; }
function Matchup({ title, rows, version }: { title: string; rows: Array<{ key: string; count: number; wins: number; winRate: number }>; version: string }) { const weak = title === 'Weak against'; return <div className={styles.matchupGroup}><h3>{title}</h3><p>{weak ? 'Hardest' : 'Best'} observed lanes · 8+ games</p>{rows.length ? <div className={styles.matchupRows}>{rows.map((row) => <div key={row.key}><img src={championIcon(version, row.key)} alt="" /><span className={styles.matchupName}><b>{row.key}</b><small>{row.count} games</small></span><strong className={weak ? styles.negative : styles.positive}>{row.winRate.toFixed(1)}%</strong></div>)}</div> : <p className={styles.empty}>Not enough direct lane data yet.</p>}</div>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
