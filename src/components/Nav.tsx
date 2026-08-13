'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AccountButton, type SessionUser } from './AccountButton';
import { Logo } from './Logo';
import { SearchForm } from './SearchForm';
import { ThemeToggle } from './ThemeToggle';
import styles from './Nav.module.css';

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
  /** The user's own group, first one joined. Null hides the Group section entirely. */
  group: { slug: string; name: string } | null;
}

function buildItems({ pendingDuels, pendingFriendRequests, group }: RailProps): NavItem[] {
  const groupItems: NavItem[] = group
    ? [
        { href: `/group/${group.slug}#standings`, glyph: '▤', label: 'Standings', short: 'Rank', section: 'group' },
        { href: `/group/${group.slug}#awards`, glyph: '★', label: 'Weekly awards', short: 'Awards', section: 'group' },
        { href: `/group/${group.slug}#duos`, glyph: '⊞', label: 'Duo synergy', short: 'Duos', section: 'group' },
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

export function Rail(props: RailProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [pathname]);

  const items = buildItems(props);
  const showSearch = pathname !== '/';
  const sections: { key: NavItem['section']; label: string }[] = [
    { key: 'group', label: props.group ? props.group.name : 'Group' },
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
          if (sectionItems.length === 0) return null;
          return (
            <div key={section.key} style={{ display: 'contents' }}>
              <div className={styles.navLabel}>{section.label}</div>
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

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [pathname]);

  const items = buildItems(props);

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
