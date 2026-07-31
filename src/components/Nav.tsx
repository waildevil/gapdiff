'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MOCK_GROUP } from '@/lib/mock';
import styles from './Nav.module.css';

interface NavItem {
  href: string;
  glyph: string;
  label: string;
  short: string;
  section: 'group' | 'analysis';
}

const ITEMS: NavItem[] = [
  { href: '/', glyph: '▤', label: 'Standings', short: 'Rank', section: 'group' },
  { href: '/live', glyph: '◉', label: 'Live now', short: 'Live', section: 'group' },
  { href: '/awards', glyph: '★', label: 'Weekly awards', short: 'Awards', section: 'group' },
  { href: '/h2h', glyph: '⇄', label: 'Head to head', short: 'H2H', section: 'analysis' },
  { href: '/champions', glyph: '◈', label: 'Champions', short: 'Champs', section: 'analysis' },
  { href: '/duos', glyph: '⊞', label: 'Duo synergy', short: 'Duos', section: 'analysis' },
];

/** Player and match pages live under the standings tab. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/player') || pathname.startsWith('/match');
  return pathname.startsWith(href);
}

export function Rail() {
  const pathname = usePathname();
  const sections: { key: NavItem['section']; label: string }[] = [
    { key: 'group', label: 'Group' },
    { key: 'analysis', label: 'Analysis' },
  ];

  return (
    <aside className={styles.rail}>
      <div className={styles.brand}>
        <div className={styles.mark}>
          gap<span>diff</span>
        </div>
        <div className={styles.sub}>
          {MOCK_GROUP.name} · {MOCK_GROUP.platform.toUpperCase()}
        </div>
      </div>

      <nav className={styles.nav}>
        {sections.map((section) => (
          <div key={section.key} style={{ display: 'contents' }}>
            <div className={styles.navLabel}>{section.label}</div>
            {ITEMS.filter((item) => item.section === section.key).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.item}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              >
                <span className={styles.glyph}>{item.glyph}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.foot}>
        <div className={styles.sub}>
          <span className={styles.dot} />2 in game
        </div>
      </div>
    </aside>
  );
}

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabbar}>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.tab}
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
        >
          <span className={styles.glyph}>{item.glyph}</span>
          {item.short}
        </Link>
      ))}
    </nav>
  );
}
