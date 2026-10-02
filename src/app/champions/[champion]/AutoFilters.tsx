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
    <RoleTabs value={role} options={roles} disabled={pending} onChange={(value) => update('role', value)} />
    <span className={styles.filterStatus} role="status">{pending ? 'Updating…' : 'Updates automatically'}</span>
  </div>;
}

function RoleTabs({ value, options, disabled, onChange }: { value: string; options: RoleOption[]; disabled: boolean; onChange: (value: string) => void }) {
  return <div className={styles.roleField}><span>Role</span><div className={styles.roleTabs} role="radiogroup" aria-label="Role">{options.map((option) => <button key={option.key} type="button" role="radio" aria-checked={option.key === value} aria-label={option.label} title={option.label} disabled={disabled} onClick={() => onChange(option.key)}><RoleIcon role={option.key} /></button>)}</div></div>;
}

function RoleIcon({ role }: { role: string }) {
  const marks: Record<string, React.ReactNode> = {
    top: <><path d="M5 18V5h13"/><path d="m8 15 7-7"/></>,
    jungle: <><path d="M12 19c0-6 2-10 6-14-1 6-2 11-6 14Z"/><path d="M11 19C9 13 7 9 4 7c1 6 3 10 7 12Z"/><path d="M12 19v-8"/></>,
    middle: <><path d="M5 19 19 5"/><path d="M5 14v5h5M14 5h5v5"/></>,
    bottom: <><path d="M19 6v13H6"/><path d="m16 9-7 7"/></>,
    support: <><path d="M12 5v14M5 9h14"/><path d="m7 9 2 4h6l2-4M9 19h6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{marks[role] ?? marks.middle}</svg>;
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
