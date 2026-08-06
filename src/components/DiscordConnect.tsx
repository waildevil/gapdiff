'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  connectDiscordChannelAction,
  disconnectDiscordAction,
  listDiscordChannelsAction,
  type ConnectChannelResult,
  type DisconnectResult,
} from '@/app/actions/groups';
import type { DiscordConnection } from '@/lib/groups';
import styles from './DiscordConnect.module.css';

interface DiscordConnectProps {
  groupId: number;
  slug: string;
  connection: DiscordConnection;
  /** The "Add to Discord" link — Discord picks the server, we get its id back. */
  installUrl: string;
  /** Set once the bot has just joined a server, from the install redirect. */
  pendingGuildId: string | null;
  /** The owner closed Discord's install screen without picking a server. */
  declined: boolean;
}

/**
 * Connects a group to a Discord channel.
 *
 * No webhook URL ever passes through this UI — the bot mints one itself once
 * a channel is picked, and what the owner sees is the server and channel
 * name, not a link. The picker is shared between two moments: right after
 * the bot joins (pendingGuildId, from the install redirect) and picking a
 * different channel on an already-connected group (changingChannel, from
 * the stored guildId) — same list, same "connect this channel" action.
 */
export function DiscordConnect({
  groupId,
  slug,
  connection,
  installUrl,
  pendingGuildId,
  declined,
}: DiscordConnectProps) {
  const router = useRouter();
  const [state, setState] = useState(connection);
  const [changingChannel, setChangingChannel] = useState(false);
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channelId, setChannelId] = useState('');
  const [error, setError] = useState<string | null>(
    declined ? "Discord closed before you picked a server — click Add to Discord and try again." : null,
  );
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [pending, startTransition] = useTransition();

  // Either a fresh install (bot just joined) or an explicit "change channel"
  // on the guild already connected — same picker either way.
  const activeGuildId = pendingGuildId ?? (changingChannel ? state.guildId : null);

  useEffect(() => {
    if (!activeGuildId) return;
    setLoadingChannels(true);
    setError(null);
    listDiscordChannelsAction(groupId, activeGuildId)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setChannels(result.channels);
        // Changing channel starts on the one already in use, not the first
        // in the list — a fresh install has no current channel to prefer.
        const current = state.channelId && result.channels.some((c) => c.id === state.channelId)
          ? state.channelId
          : result.channels[0]?.id ?? '';
        setChannelId(current);
      })
      .finally(() => setLoadingChannels(false));
    // Only re-run if the guild actually changes — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGuildId, groupId]);

  /*
   * A rejected server action inside a transition is an unhandled rejection, and
   * React turns that into the blank "a client-side exception has occurred"
   * screen with the real reason hidden in production. Catching it here means a
   * failure is something the owner can read and act on instead.
   */
  function run<T>(action: () => Promise<T>, apply: (result: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        apply(await action());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Something went wrong saving that.');
      }
    });
  }

  function connectChannel() {
    if (!channelId || !activeGuildId) return;
    run<ConnectChannelResult>(
      () => connectDiscordChannelAction(groupId, slug, activeGuildId, channelId),
      (result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setState({
          connected: true,
          guildId: activeGuildId,
          channelId,
          serverName: result.serverName,
          channelName: result.channelName,
          unreadable: false,
        });
        setChannels(null);
        setChangingChannel(false);
        router.replace(`/groups/${slug}/manage`);
      },
    );
  }

  function disconnect() {
    run<DisconnectResult>(
      () => disconnectDiscordAction(groupId, slug),
      (result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setState({
          connected: false,
          guildId: null,
          channelId: null,
          serverName: null,
          channelName: null,
          unreadable: false,
        });
      },
    );
  }

  const picker = activeGuildId ? (
    <>
      <p className={styles.note}>Pick the channel that gets the evening digest.</p>

      {loadingChannels ? (
        <p className={styles.note}>Loading channels…</p>
      ) : channels && channels.length > 0 ? (
        <div className={styles.row}>
          <select
            className={styles.select}
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            disabled={pending}
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.primary}
            onClick={connectChannel}
            disabled={pending || !channelId}
          >
            {pending ? 'Connecting…' : 'Connect this channel'}
          </button>
          {changingChannel ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setChangingChannel(false)}
              disabled={pending}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : channels ? (
        <p className={styles.note}>
          No text channels found — the bot needs at least View Channels access to one.
        </p>
      ) : null}
    </>
  ) : null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Discord</div>
        <div className="card-note">
          {state.connected ? 'connected' : 'not connected'}
        </div>
      </div>

      <div className={styles.body}>
        {state.connected && !changingChannel ? (
          <>
            <p className={styles.status}>
              <span className={styles.dot} data-bad={state.unreadable ? '' : undefined} />
              {state.serverName ? (
                <>
                  <b>{state.serverName}</b>
                  {state.channelName ? <> → #{state.channelName}</> : null}
                </>
              ) : (
                'server and channel unavailable right now'
              )}
            </p>

            {state.unreadable ? (
              <p className={styles.warn}>
                This webhook can&apos;t be decrypted — the server&apos;s encryption key
                has changed since it was saved. Reconnect to fix it.
              </p>
            ) : (
              <p className={styles.note}>
                The evening digest and the monthly results post to this channel.
                Quiet days post nothing.
              </p>
            )}

            <div className={styles.row}>
              {state.guildId ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setChangingChannel(true)}
                  disabled={pending}
                >
                  Change channel
                </button>
              ) : null}
              <button
                type="button"
                className={styles.secondary}
                onClick={disconnect}
                disabled={pending}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : activeGuildId ? (
          picker
        ) : (
          <>
            <p className={styles.note}>
              Adds a bot to your server, then asks which channel gets the evening digest
              and the monthly results. Quiet days post nothing.
            </p>

            <a className={`${styles.primary} ${styles.link}`} href={installUrl}>
              Add to Discord
            </a>
          </>
        )}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
