'use client';

import { usePathname } from 'next/navigation';
import { SearchForm } from './SearchForm';
import styles from './TopBar.module.css';

/** Search, pinned above whatever page you're on. Home has its own hero
 *  search already, so this stays out of the way there. */
export function TopBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <div className={styles.bar}>
      <SearchForm size="compact" />
    </div>
  );
}
