'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { rankEmblem } from '@/lib/ddragon';
import styles from './page.module.css';

type RankOption = { key: string; label: string; emblem: string | null };
type RoleOption = { key: string; label: string };

export function AutoFilters({ rank, role, ranks, roles }: { rank: string; role: string; ranks: readonly RankOption[]; roles: RoleOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const selectedRank = ranks.find((option) => option.key === rank);

  function update(key: 'tier' | 'role', value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === 'tier' && value === 'all') next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return <div className={`${styles.filters} ${pending ? styles.filtersPending : ''}`} aria-busy={pending}>
    <label>Rank<div className={styles.selectWrap}>{selectedRank?.emblem ? <img className={styles.filterEmblem} src={rankEmblem(selectedRank.emblem)} alt="" /> : <span className={styles.allRanksIcon}>∞</span>}<select name="tier" value={rank} onChange={(event) => update('tier', event.target.value)} disabled={pending}>{ranks.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div></label>
    <label>Role<select name="role" value={role} onChange={(event) => update('role', event.target.value)} disabled={pending}>{roles.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
    <span className={styles.filterStatus} role="status">{pending ? 'Updating…' : 'Updates automatically'}</span>
  </div>;
}
