'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { rankEmblem } from '@/lib/ddragon';
import styles from './page.module.css';

type RankOption = { key: string; label: string; emblem: string | null };
type RoleOption = { key: string; label: string };

export function AutoFilters({ rank, role, ranks, roles }: { rank: string; role: string; ranks: readonly RankOption[]; roles: RoleOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  function update(key: 'tier' | 'role', value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === 'tier' && value === 'all') next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return <div className={`${styles.filters} ${pending ? styles.filtersPending : ''}`} aria-busy={pending}>
    <ChoiceDropdown label="Rank" value={rank} options={ranks.map((option) => ({ ...option, icon: option.emblem ? rankEmblem(option.emblem) : null }))} disabled={pending} onChange={(value) => update('tier', value)} />
    <ChoiceDropdown label="Role" value={role} options={roles.map((option) => ({ ...option, icon: null }))} disabled={pending} onChange={(value) => update('role', value)} />
    <span className={styles.filterStatus} role="status">{pending ? 'Updating…' : 'Updates automatically'}</span>
  </div>;
}

function ChoiceDropdown({ label, value, options, disabled, onChange }: { label: string; value: string; options: Array<{ key: string; label: string; icon: string | null }>; disabled: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.key === value) ?? options[0];
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);

  return <div className={styles.dropdownField} ref={root}>
    <span>{label}</span>
    <button className={styles.dropdownTrigger} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {active?.icon ? <img src={active.icon} alt="" /> : <i className={styles.dropdownPlaceholder} aria-hidden="true" />}
      <b>{active?.label}</b><span className={styles.chevron} aria-hidden="true" />
    </button>
    {open ? <div className={styles.dropdownMenu} role="listbox" aria-label={label}>{options.map((option) => <button key={option.key} type="button" role="option" aria-selected={option.key === value} onClick={() => { setOpen(false); onChange(option.key); }}>
      {option.icon ? <img src={option.icon} alt="" /> : <i className={styles.dropdownPlaceholder} aria-hidden="true" />}
      <span>{option.label}</span>{option.key === value ? <b aria-hidden="true">✓</b> : null}
    </button>)}</div> : null}
  </div>;
}
