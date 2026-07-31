'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountButton, type SessionUser } from './AccountButton';
import { SearchForm } from './SearchForm';
import { ThemeToggle } from './ThemeToggle';
import styles from './Header.module.css';

export function Header({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  // The home page has its own full-size search; a second one would be noise.
  const showSearch = pathname !== '/';

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark}>
            gap<span>diff</span>
          </span>
          <span className={styles.tagline}>League stats</span>
        </Link>

        {showSearch ? (
          <div className={styles.search}>
            <SearchForm size="compact" />
          </div>
        ) : null}

        <div className={`${styles.actions} ${showSearch ? '' : styles.pushRight}`}>
          <ThemeToggle />
          <AccountButton user={user} />
        </div>
      </div>
    </header>
  );
}
