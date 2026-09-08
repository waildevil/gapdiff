'use client';

import { useMemo, useState } from 'react';
import { championIcon } from '@/lib/ddragon';
import styles from './ChampionMetaPreview.module.css';

type Role = 'All' | 'Top' | 'Jungle' | 'Middle' | 'Bottom' | 'Support';

export type ChampionMetaRow = {
  name: string;
  role: Exclude<Role, 'All'>;
  tier: 'S+' | 'S' | 'A' | 'B';
  winRate: number;
  pickRate: number;
  banRate: number;
  games: string;
  kda: number;
  strongInto: string[];
};

const ROLES: Role[] = ['All', 'Top', 'Jungle', 'Middle', 'Bottom', 'Support'];

// Intentionally illustrative: the collector will replace this shape with
// championMetaRollups once it has an actual ranked-match sample.
const CHAMPIONS: ChampionMetaRow[] = [
  { name: 'Aatrox', role: 'Top', tier: 'S+', winRate: 52.8, pickRate: 8.4, banRate: 15.1, games: '24,821', kda: 2.31, strongInto: ['Garen', 'Darius', 'Ornn'] },
  { name: 'Warwick', role: 'Jungle', tier: 'S+', winRate: 53.6, pickRate: 6.8, banRate: 9.2, games: '20,146', kda: 2.76, strongInto: ['Vi', 'KhaZix', 'LeeSin'] },
  { name: 'Ahri', role: 'Middle', tier: 'S', winRate: 51.9, pickRate: 10.6, banRate: 4.9, games: '31,940', kda: 3.07, strongInto: ['Azir', 'Syndra', 'LeBlanc'] },
  { name: 'Jinx', role: 'Bottom', tier: 'S', winRate: 52.3, pickRate: 12.8, banRate: 7.3, games: '38,521', kda: 2.63, strongInto: ['Samira', 'KaiSa', 'Xayah'] },
  { name: 'Nami', role: 'Support', tier: 'S', winRate: 52.1, pickRate: 8.2, banRate: 2.1, games: '25,734', kda: 3.41, strongInto: ['Rakan', 'Braum', 'Leona'] },
  { name: 'Camille', role: 'Top', tier: 'A', winRate: 51.2, pickRate: 4.6, banRate: 8.4, games: '13,902', kda: 2.18, strongInto: ['Jax', 'Fiora', 'Sett'] },
  { name: 'Viego', role: 'Jungle', tier: 'A', winRate: 50.8, pickRate: 9.4, banRate: 7.1, games: '28,755', kda: 2.55, strongInto: ['Graves', 'Nocturne', 'Kindred'] },
  { name: 'Orianna', role: 'Middle', tier: 'A', winRate: 50.9, pickRate: 6.1, banRate: 1.8, games: '18,304', kda: 2.89, strongInto: ['Akali', 'Sylas', 'Katarina'] },
  { name: 'Ezreal', role: 'Bottom', tier: 'A', winRate: 50.6, pickRate: 13.1, banRate: 4.3, games: '39,102', kda: 2.34, strongInto: ['Caitlyn', 'Ashe', 'Varus'] },
  { name: 'Thresh', role: 'Support', tier: 'A', winRate: 50.4, pickRate: 9.9, banRate: 5.6, games: '29,870', kda: 2.84, strongInto: ['Nautilus', 'Blitzcrank', 'Pyke'] },
  { name: 'Garen', role: 'Top', tier: 'B', winRate: 50.2, pickRate: 5.3, banRate: 3.6, games: '15,773', kda: 2.02, strongInto: ['Irelia', 'Yone', 'Riven'] },
  { name: 'Diana', role: 'Jungle', tier: 'B', winRate: 49.8, pickRate: 5.9, banRate: 2.8, games: '17,882', kda: 2.48, strongInto: ['Hecarim', 'Evelynn', 'Lillia'] },
];

export function ChampionMetaPreview({
  version,
  rows = CHAMPIONS,
  scope = { region: 'EUW', queue: 'Ranked Solo/Duo', patch: '15.1 preview', sample: 'Illustrative' },
  heading = 'Find the strongest pick for your lane',
  preview = true,
}: {
  version: string;
  rows?: ChampionMetaRow[];
  scope?: { region: string; queue: string; patch: string; sample: string };
  heading?: string;
  preview?: boolean;
}) {
  const [role, setRole] = useState<Role>('All');
  const [query, setQuery] = useState('');

  const champions = useMemo(
    () => rows.filter((champion) =>
      (role === 'All' || champion.role === role) &&
      champion.name.toLowerCase().includes(query.trim().toLowerCase()),
    ),
    [query, role, rows],
  );

  return (
    <>
      <section className={styles.controls} aria-label="Champion meta filters">
        <div className={styles.roleTabs}>
          {ROLES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={role === item}
              onClick={() => setRole(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <span className="sr-only">Search champions</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a champion"
          />
        </label>
      </section>

      <section className={styles.snapshot} aria-label="Sample scope">
        <div><span>Region</span><b>{scope.region}</b></div>
        <div><span>Queue</span><b>{scope.queue}</b></div>
        <div><span>Patch</span><b>{scope.patch}</b></div>
        <div><span>Sample</span><b>{scope.sample}</b></div>
      </section>

      <section className={styles.board}>
        <div className={styles.boardHead}>
          <div>
            <p className={styles.kicker}>Champion ranking</p>
            <h2>{heading}</h2>
          </div>
          <p className={styles.count}>{champions.length} champions shown</p>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Champion</th>
                <th>Tier</th>
                <th>Role</th>
                <th>Win rate</th>
                <th>Pick rate</th>
                <th>Ban rate</th>
                <th>KDA</th>
                <th>Strong into</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((champion, index) => (
                <tr key={`${champion.name}-${champion.role}`}>
                  <td className={styles.rank}>{index + 1}</td>
                  <td>
                    <div className={styles.champion}>
                      <img src={championIcon(version, champion.name)} alt="" />
                      <div><b>{champion.name}</b><span>{champion.games} games</span></div>
                    </div>
                  </td>
                  <td><span className={`${styles.tier} ${styles[`tier${champion.tier.replace('+', 'Plus')}`]}`}>{champion.tier}</span></td>
                  <td><span className={styles.role}>{champion.role}</span></td>
                  <td className={champion.winRate >= 52 ? styles.good : undefined}>{champion.winRate.toFixed(1)}%</td>
                  <td>{champion.pickRate.toFixed(1)}%</td>
                  <td>{champion.banRate.toFixed(1)}%</td>
                  <td>{champion.kda.toFixed(2)}</td>
                  <td>{champion.strongInto.length ? <div className={styles.matchups}>{champion.strongInto.map((name) => <img key={name} src={championIcon(version, name)} alt={name} title={name} />)}</div> : <span className={styles.pending}>Coming next</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {champions.length === 0 ? <p className={styles.empty}>No champion matches that search.</p> : null}
        </div>
      </section>

      {preview ? <p className="note"><b>Preview only.</b> These figures are mock data to approve the experience. The production page will use GapDiff&apos;s own ranked-match collector and show the sample size and refresh time beside every real result.</p> : null}
    </>
  );
}
