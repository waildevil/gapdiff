'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signInWithDiscord, signOutAction } from '@/app/actions/auth';
import styles from './AccountButton.module.css';

export interface SessionUser {
  id: string;
  name: string | null;
  image: string | null;
}

/**
 * Sign-in lives in the header rather than behind a route, because every page
 * here is readable signed-out — you only need an account to own a group.
 */
export function AccountButton({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <form action={() => signInWithDiscord()} className={styles.wrap}>
        <button className={styles.signIn} type="submit">
          <DiscordMark />
          <span>Sign in</span>
        </button>
      </form>
    );
  }

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        className={styles.user}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={styles.name}>{user.name ?? 'Account'}</span>
        {user.image ? (
          <img className={styles.avatar} src={user.image} alt="" width={26} height={26} />
        ) : (
          <span className={styles.avatar} />
        )}
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          <Link className={styles.item} href="/groups" onClick={() => setOpen(false)}>
            My groups
          </Link>
          <Link className={styles.item} href="/accounts" onClick={() => setOpen(false)}>
            My Riot accounts
          </Link>
          <Link className={styles.item} href="/duels" onClick={() => setOpen(false)}>
            Start a duel
          </Link>
          <div className={styles.divider} />
          <form action={() => signOutAction()}>
            <button className={`${styles.item} ${styles.danger}`} type="submit">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function DiscordMark() {
  return (
    <svg className={styles.discordMark} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.62A19.79 19.79 0 0 0 15.43 3.1a13.9 13.9 0 0 0-.63 1.29 18.4 18.4 0 0 0-5.6 0A13.9 13.9 0 0 0 8.56 3.1 19.74 19.74 0 0 0 3.67 4.62C.57 9.24-.27 13.74.15 18.18a19.9 19.9 0 0 0 6.06 3.07c.49-.67.92-1.38 1.3-2.12a13 13 0 0 1-2.05-.99c.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.09 0c.16.14.33.27.5.4-.65.39-1.34.72-2.05.99.37.74.81 1.45 1.3 2.12a19.86 19.86 0 0 0 6.06-3.07c.5-5.15-.84-9.6-3.54-13.56ZM8.02 15.45c-1.18 0-2.16-1.08-2.16-2.41 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.09 2.16 2.42 0 1.33-.95 2.41-2.16 2.41Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.94-2.42 2.15-2.42 1.22 0 2.19 1.09 2.17 2.42 0 1.33-.95 2.41-2.17 2.41Z" />
    </svg>
  );
}
