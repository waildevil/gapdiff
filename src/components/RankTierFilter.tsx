'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RANK_FILTERS, findRankFilter } from '@/lib/championMetaRanks';
import { rankEmblem } from '@/lib/ddragon';
import styles from './ChampionMetaPreview.module.css';

export function RankTierFilter({ selected }: { selected?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = findRankFilter(selected);

  const choose = (key: string) => {
    setOpen(false);
    router.push(key === 'all' ? '/champions' : `/champions?tier=${key}`);
  };

  return (
    <div className={styles.rankFilter}>
      <span>Rank tier</span>
      <button type="button" className={styles.rankTrigger} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="listbox">
        {active.emblem ? <img src={rankEmblem(active.emblem)} alt="" /> : null}
        {active.label}<b aria-hidden="true">⌄</b>
      </button>
      {open ? (
        <div className={styles.rankMenu} role="listbox" aria-label="Rank tier">
          {RANK_FILTERS.map((filter) => (
            <button key={filter.key} type="button" role="option" aria-selected={filter.key === active.key} onClick={() => choose(filter.key)}>
              {filter.emblem ? <img src={rankEmblem(filter.emblem)} alt="" /> : <i aria-hidden="true" />}
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
