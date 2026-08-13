'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AccountButton, type SessionUser } from './AccountButton';
import { Logo } from './Logo';
import { SearchForm } from './SearchForm';
import { ThemeToggle } from './ThemeToggle';
import styles from './Nav.module.css';

export interface RailGroup {
  slug: string;
  name: string;
}

interface NavItem {
  href: string;
  glyph: string;
  label: string;
  short: string;
  section: 'group' | 'account';
  badge?: number;
}

interface RailProps {
  user: SessionUser | null;
  pendingDuels: number;
  pendingFriendRequests: number;
  /** Every group the user belongs to. Empty hides the Group section. */
  groups: RailGroup[];
}

function buildItems({ pendingDuels, pendingFriendRequests, groups }: RailProps, activeSlug: string | null): NavItem[] {
  const groupItems: NavItem[] = activeSlug
    ? [
        { href: `/group/${activeSlug}#standings`, glyph: '▤', label: 'Standings', short: 'Rank', section: 'group' },
        { href: `/group/${activeSlug}#awards`, glyph: '★', label: 'Weekly awards', short: 'Awards', section: 'group' },
        { href: `/group/${activeSlug}#duos`, glyph: '⊞', label: 'Duo synergy', short: 'Duos', section: 'group' },
      ]
    : [];

  return [
    ...groupItems,
    { href: '/friends', glyph: '⚑', label: 'Friends', short: 'Friends', section: 'account', badge: pendingFriendRequests },
    { href: '/duels', glyph: '⇄', label: 'My duels', short: 'Duels', section: 'account', badge: pendingDuels },
    { href: '/accounts', glyph: '◈', label: 'My Riot accounts', short: 'Accounts', section: 'account' },
    { href: '/groups', glyph: '⊙', label: 'My groups', short: 'Groups', section: 'account' },
  ];
}

/** Player and match pages read as part of the group they're scored against. */
function isActive(pathname: string, hash: string, href: string): boolean {
  const [hrefPath, hrefHash] = href.split('#');
  if (!pathname.startsWith(hrefPath!)) return false;
  // Several group items share the same pathname and differ only by hash.
  if (!hrefHash) return true;
  return hash === `#${hrefHash}`;
}

/**
 * Whichever group's page you're actually looking at, or the first one you're
 * in otherwise — there's no "default group" in the data model, only however
 * many you belong to.
 */
function useActiveGroup(groups: RailGroup[]): RailGroup | null {
  const pathname = usePathname();
  const onGroupPage = pathname.match(/^\/group\/([^/]+)/)?.[1];
  if (onGroupPage) return groups.find((g) => g.slug === onGroupPage) ?? groups[0] ?? null;
  return groups[0] ?? null;
}

function GroupSwitcher({ groups, active }: { groups: RailGroup[]; active: RailGroup | null }) {
  const router = useRouter();

  return (
    <div className={styles.groupSwitch}>
      {groups.length > 1 ? (
        <select
          className={styles.groupSelect}
          value={active?.slug ?? ''}
          onChange={(event) => router.push(`/group/${event.target.value}#standings`)}
          aria-label="Switch group"
        >
          {groups.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
      ) : (
        <span className={styles.navLabel} style={{ padding: 0 }}>
          {active ? active.name : 'Group'}
        </span>
      )}
      <Link href="/groups" className={styles.groupAdd} title="Add or manage a group" aria-label="Add or manage a group">
        +
      </Link>
    </div>
  );
}

export function Rail(props: RailProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');
  const active = useActiveGroup(props.groups);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [pathname]);

  const items = buildItems(props, active?.slug ?? null);
  const showSearch = pathname !== '/';
  const sections: { key: NavItem['section']; label: string }[] = [
    { key: 'group', label: 'Group' },
    { key: 'account', label: 'Account' },
  ];

  return (
    <aside className={styles.rail}>
      <Link href="/" className={styles.brand}>
        <Logo />
        <span className={styles.brandText}>
          <span className={styles.mark}>
            gap<span>diff</span>
          </span>
          <span className={styles.sub}>League stats</span>
        </span>
      </Link>

      {showSearch ? (
        <div className={styles.search}>
          <SearchForm size="rail" />
        </div>
      ) : null}

      <nav className={styles.nav}>
        {sections.map((section) => {
          const sectionItems = items.filter((item) => item.section === section.key);
          if (section.key === 'group' && props.groups.length === 0 && !props.user) return null;

          return (
            <div key={section.key} style={{ display: 'contents' }}>
              {section.key === 'group' && props.user ? (
                <GroupSwitcher groups={props.groups} active={active} />
              ) : (
                <div className={styles.navLabel}>{section.label}</div>
              )}
              {sectionItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.item}
                  aria-current={isActive(pathname, hash, item.href) ? 'page' : undefined}
                >
                  <span className={styles.glyph}>{item.glyph}</span>
                  {item.label}
                  {item.badge ? <span className={styles.badge}>{item.badge > 9 ? '9+' : item.badge}</span> : null}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <div className={styles.foot}>
        <ThemeToggle />
        <AccountButton
          user={props.user}
          pendingDuels={props.pendingDuels}
          pendingFriendRequests={props.pendingFriendRequests}
          openUpward
        />
      </div>
    </aside>
  );
}

export function TabBar(props: RailProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');
  const active = useActiveGroup(props.groups);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [pathname]);

  const items = buildItems(props, active?.slug ?? null);

  return (
    <nav className={styles.tabbar}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.tab}
          aria-current={isActive(pathname, hash, item.href) ? 'page' : undefined}
        >
          <span className={styles.glyph}>{item.glyph}</span>
          {item.short}
          {item.badge ? <span className={styles.badge}>{item.badge > 9 ? '9+' : item.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
