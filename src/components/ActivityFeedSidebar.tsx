'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getActivityFeedAction } from '@/app/actions/activity';
import type { ActivityEventView, ActivityFeed, LiveGroup, ScopedAccount } from '@/lib/activity';
import { profileIcon } from '@/lib/ddragon';
import { queueName, timeAgo } from '@/lib/profile';
import { Avatar } from './Avatar';
import styles from './ActivityFeedSidebar.module.css';

const POLL_MS = 20_000;

function profileHref(account: ScopedAccount) {
  return `/player/${account.platform}/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`;
}

function PlayerAvatar({ account, version }: { account: ScopedAccount; version: string }) {
  if (account.profileIconId !== null) {
    return (
      <img
        className={styles.avatarImg}
        src={profileIcon(version, account.profileIconId)}
        alt=""
        width={28}
        height={28}
      />
    );
  }
  return <Avatar name={account.gameName} size="sm" />;
}

/** "A", "A and B", or "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function LiveRow({ group, version }: { group: LiveGroup; version: string }) {
  const together = group.players.length > 1;
  const names = joinNames(group.players.map((p) => p.gameName));
  const queue = group.queueId !== null ? queueName(group.queueId) : 'a game';

  return (
    <div className={styles.row}>
      <div className={styles.avatars}>
        {group.players.slice(0, 3).map((p) => (
          <PlayerAvatar key={p.puuid} account={p} version={version} />
        ))}
      </div>
      <div className={styles.rowBody}>
        <div className={styles.rowText}>
          {group.players.length === 1 ? (
            <Link href={profileHref(group.players[0]!)} className={styles.rowLink}>
              {names}
            </Link>
          ) : (
            names
          )}{' '}
          {together ? 'are playing together' : 'is in a game'}
        </div>
        <div className={styles.rowMeta}>
          <span className="chip good">
            <span className={styles.liveDot} />
            Live
          </span>
          {queue}
          {group.startedAt ? ` · ${timeAgo(group.startedAt)}` : null}
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, version }: { event: ActivityEventView; version: string }) {
  const queue = event.queueId !== null ? queueName(event.queueId) : 'a game';
  const verb = event.kind === 'started' ? 'started' : 'finished';

  return (
    <Link href={profileHref(event.account)} className={`${styles.row} ${styles.rowLinkable}`}>
      <PlayerAvatar account={event.account} version={version} />
      <div className={styles.rowBody}>
        <div className={styles.rowText}>
          {event.account.gameName} {verb} {queue}
        </div>
        <div className={styles.rowMeta}>{timeAgo(event.at)}</div>
      </div>
    </Link>
  );
}

export function ActivityFeedSidebar({ version }: { version: string }) {
  const [feed, setFeed] = useState<ActivityFeed | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const next = await getActivityFeedAction();
      if (!cancelled) setFeed(next);
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isEmpty = feed !== null && feed.liveNow.length === 0 && feed.recentEvents.length === 0;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Live activity</div>
        <div className="card-note">friends &amp; groups</div>
      </div>

      {feed === null ? (
        <div className={styles.empty}>Loading…</div>
      ) : isEmpty ? (
        <div className={styles.empty}>
          Nothing to show yet. Add friends or join a group to see who&apos;s playing.
        </div>
      ) : (
        <div className={styles.list}>
          {feed.liveNow.map((group) => (
            <LiveRow key={group.gameId} group={group} version={version} />
          ))}
          {feed.recentEvents.map((event) => (
            <EventRow key={event.id} event={event} version={version} />
          ))}
        </div>
      )}
    </div>
  );
}
