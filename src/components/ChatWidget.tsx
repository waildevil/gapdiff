'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getConversationAction,
  getConversationsAction,
  getUnreadMessageCountAction,
  sendMessageAction,
} from '@/app/actions/messages';
import { OPEN_CHAT_EVENT, type OpenChatDetail } from '@/lib/chatEvents';
import type { ConversationPreview, MessageView } from '@/lib/messages';
import styles from './ChatWidget.module.css';

const BADGE_POLL_MS = 20_000;
const LIST_POLL_MS = 15_000;
const THREAD_POLL_MS = 4_000;

interface Thread {
  userId: string;
  name: string | null;
}

/**
 * A messenger-style popup, polling-based rather than a socket — see
 * `lib/messages.ts` for why. Lives in the root layout so any page can open a
 * thread with it via the `gapdiff:open-chat` DOM event.
 */
export function ChatWidget({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The badge stays live even with the widget closed.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    async function poll() {
      const count = await getUnreadMessageCountAction();
      if (!cancelled) setUnread(count);
    }
    poll();
    const interval = setInterval(poll, BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [signedIn]);

  // Other pages (the friends list) ask to open a specific thread.
  useEffect(() => {
    if (!signedIn) return;
    function onOpenChat(event: Event) {
      const detail = (event as CustomEvent<OpenChatDetail>).detail;
      setThread({ userId: detail.userId, name: detail.name });
      setOpen(true);
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
  }, [signedIn]);

  // Conversation list, while the panel is open and showing it.
  useEffect(() => {
    if (!open || thread) return;
    let cancelled = false;
    async function poll() {
      const rows = await getConversationsAction();
      if (!cancelled) setConversations(rows);
    }
    poll();
    const interval = setInterval(poll, LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, thread]);

  // The open thread itself.
  useEffect(() => {
    if (!open || !thread) return;
    let cancelled = false;
    async function poll() {
      const rows = await getConversationAction(thread!.userId);
      if (!cancelled) setMessages(rows);
    }
    poll();
    const interval = setInterval(poll, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, thread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  if (!signedIn) return null;

  async function send() {
    const body = draft.trim();
    if (!body || !thread) return;
    setSending(true);
    setDraft('');
    const result = await sendMessageAction(thread.userId, body);
    setSending(false);
    if (result.ok) {
      setMessages(await getConversationAction(thread.userId));
    } else {
      setDraft(body);
    }
  }

  return (
    <div className={styles.wrap}>
      {open ? (
        <div className={styles.panel}>
          {thread ? (
            <>
              <div className={styles.header}>
                <button className={styles.back} onClick={() => setThread(null)}>
                  ←
                </button>
                <span className={styles.headerName}>{thread.name ?? 'Chat'}</span>
                <button className={styles.close} onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>

              <div className={styles.thread}>
                {messages.length === 0 ? (
                  <div className={styles.empty}>No messages yet — say hi.</div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`${styles.bubbleRow} ${m.mine ? styles.mine : ''}`}
                    >
                      <span className={styles.bubble}>{m.body}</span>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <form
                className={styles.composer}
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  className={styles.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message…"
                  autoComplete="off"
                  disabled={sending}
                />
                <button className={styles.send} type="submit" disabled={sending || !draft.trim()}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <>
              <div className={styles.header}>
                <span className={styles.headerName}>Messages</span>
                <button className={styles.close} onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>

              <div className={styles.list}>
                {conversations.length === 0 ? (
                  <div className={styles.empty}>
                    No conversations yet — message a friend from your{' '}
                    <a href="/friends">friends list</a>.
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.userId}
                      className={styles.conversation}
                      onClick={() => setThread({ userId: c.userId, name: c.name })}
                    >
                      <span className={styles.convoName}>{c.name ?? 'Unnamed'}</span>
                      <span className={styles.convoPreview}>{c.lastMessage}</span>
                      {c.unread > 0 ? (
                        <span className={styles.convoBadge}>{c.unread}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      <button className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-label="Messages">
        💬
        {unread > 0 ? <span className={styles.bubbleBadge}>{unread > 9 ? '9+' : unread}</span> : null}
      </button>
    </div>
  );
}
