'use client';

import { useState, useTransition } from 'react';
import {
  connectDiscordAction,
  disconnectDiscordAction,
  type WebhookResult,
} from '@/app/actions/groups';
import type { DiscordConnection } from '@/lib/groups';
import styles from './DiscordConnect.module.css';

interface DiscordConnectProps {
  groupId: number;
  slug: string;
  connection: DiscordConnection;
}

/**
 * Connects a group to a Discord channel.
 *
 * Write-only by design: the stored URL is never sent back to the browser, only
 * the masked hint. A webhook token cannot be "looked up again" here — if the
 * owner needs it, they make a new one in Discord, which costs nothing.
 */
export function DiscordConnect({ groupId, slug, connection }: DiscordConnectProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState(connection);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * A rejected server action inside a transition is an unhandled rejection, and
   * React turns that into the blank "a client-side exception has occurred"
   * screen with the real reason hidden in production. Catching it here means a
   * failure is something the owner can read and act on instead.
   */
  function run(action: () => Promise<WebhookResult>, apply: (result: WebhookResult) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result?.ok) {
          setError(result?.error ?? 'The server did not answer. Try again.');
          return;
        }
        apply(result);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Something went wrong saving that.');
      }
    });
  }

  function save() {
    run(
      () => connectDiscordAction(groupId, slug, url),
      (result) => {
        setUrl('');
        setState({ connected: true, hint: result.ok ? result.hint : null, unreadable: false });
      },
    );
  }

  function disconnect() {
    run(
      () => disconnectDiscordAction(groupId, slug),
      () => setState({ connected: false, hint: null, unreadable: false }),
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Discord</div>
        <div className="card-note">
          {state.connected ? 'connected' : 'not connected'}
        </div>
      </div>

      <div className={styles.body}>
        {state.connected ? (
          <>
            <div className={styles.status}>
              <span className={styles.dot} data-bad={state.unreadable ? '' : undefined} />
              <code className={styles.hint}>{state.hint ?? 'webhook stored'}</code>
            </div>

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

            <button
              type="button"
              className={styles.secondary}
              onClick={disconnect}
              disabled={pending}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className={styles.note}>
              In Discord: <b>Server Settings → Integrations → Webhooks → New Webhook</b>,
              pick a channel, then copy the URL and paste it here.
            </p>

            <div className={styles.row}>
              <input
                className={styles.input}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                spellCheck={false}
                autoComplete="off"
                disabled={pending}
              />
              <button
                type="button"
                className={styles.primary}
                onClick={save}
                disabled={pending || url.trim().length === 0}
              >
                {pending ? 'Saving…' : 'Connect'}
              </button>
            </div>

            <p className={styles.note}>
              Stored encrypted, and never shown again once saved. Anyone holding
              this URL can post to that channel, so treat it like a password —
              if it leaks, delete the webhook in Discord and make a new one.
            </p>
          </>
        )}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
