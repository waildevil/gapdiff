'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getFriendsListAction } from '@/app/actions/friends';
import {
  getChatListAction,
  getConversationAction,
  getGroupMessagesAction,
  getUnreadMessageCountAction,
  sendGroupMessageAction,
  sendMessageAction,
} from '@/app/actions/messages';
import { OPEN_CHAT_EVENT, type OpenChatDetail } from '@/lib/chatEvents';
import type { FriendView } from '@/lib/friends';
import type { ConversationPreview, GroupChatPreview, MessageView } from '@/lib/messages';
import { EmojiPicker } from './EmojiPicker';
import styles from './ChatWidget.module.css';

const BADGE_POLL_MS = 15_000;
const LIST_POLL_MS = 5_000;
// The lowest this can practically go while polling — much under a second and
// each open tab is hammering the DB for no real gain. True instant delivery
// needs a push transport (websocket/SSE), which is a separate decision.
const THREAD_POLL_MS = 1_000;

type Thread = { kind: 'dm'; userId: string; name: string | null } | { kind: 'group'; groupId: number; name: string };

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** True when this message starts a new calendar day relative to the previous one. */
function isNewDay(current: Date, previous: Date | undefined): boolean {
  if (!previous) return true;
  return current.toDateString() !== previous.toDateString();
}

/**
 * A messenger-style popup, polling-based rather than a socket — see
 * `lib/messages.ts` for why. Lives in the root layout so any page can open a
 * thread with it via the `gapdiff:open-chat` DOM event. Handles both direct
 * messages and a shared room per League group.
 */
export function ChatWidget({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChatPreview[]>([]);
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Other pages (the friends list) ask to open a specific DM thread.
  useEffect(() => {
    if (!signedIn) return;
    function onOpenChat(event: Event) {
      const detail = (event as CustomEvent<OpenChatDetail>).detail;
      setThread({ kind: 'dm', userId: detail.userId, name: detail.name });
      setOpen(true);
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
  }, [signedIn]);

  // Conversation + group-chat list, while the panel is open and showing it.
  useEffect(() => {
    if (!open || thread) return;
    let cancelled = false;
    setListLoading(true);
    async function poll(isFirst: boolean) {
      const { conversations: convos, groupChats: groups } = await getChatListAction();
      if (cancelled) return;
      setConversations(convos);
      setGroupChats(groups);
      if (isFirst) setListLoading(false);
    }
    poll(true);
    const interval = setInterval(() => poll(false), LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, thread]);

  // The friends list, so search can reach somebody before any message has
  // been sent — doesn't need the 5s poll above, it barely changes.
  useEffect(() => {
    if (!open || thread) return;
    let cancelled = false;
    getFriendsListAction().then((rows) => {
      if (!cancelled) setFriends(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, thread]);

  // The open thread itself.
  useEffect(() => {
    if (!open || !thread) return;
    let cancelled = false;
    setThreadLoading(true);
    setMessages([]);
    async function poll(isFirst: boolean) {
      const rows =
        thread!.kind === 'dm'
          ? await getConversationAction(thread!.userId)
          : await getGroupMessagesAction(thread!.groupId);
      if (cancelled) return;
      setMessages(rows);
      if (isFirst) setThreadLoading(false);
    }
    poll(true);
    const interval = setInterval(() => poll(false), THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, thread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  // Search reaches three pools: groups, people already talked to, and friends
  // who haven't been messaged yet. Without a query the list is just what it
  // always was — conversations and group chats — so typing is what surfaces
  // a friend you haven't started a thread with.
  const query = search.trim().toLowerCase();
  const includes = (text: string | null | undefined) =>
    Boolean(text && text.toLowerCase().includes(query));

  const visibleGroupChats = query ? groupChats.filter((g) => includes(g.groupName)) : groupChats;
  const visibleConversations = query
    ? conversations.filter((c) => includes(c.name))
    : conversations;

  const conversationIds = useMemo(() => new Set(conversations.map((c) => c.userId)), [conversations]);
  const visibleFriends = query
    ? friends.filter(
        (f) =>
          !conversationIds.has(f.userId) &&
          (includes(f.name) || includes(f.gameName) || includes(f.tagLine)),
      )
    : [];

  const hasResults =
    visibleGroupChats.length > 0 || visibleConversations.length > 0 || visibleFriends.length > 0;

  if (!signedIn) return null;

  async function send() {
    const body = draft.trim();
    if (!body || !thread) return;
    setSending(true);
    setDraft('');
    setPickerOpen(false);

    // Optimistic: shows up on my own screen instantly rather than waiting for
    // the next poll — the other side still waits up to THREAD_POLL_MS for theirs.
    const optimistic: MessageView = {
      id: -Date.now(),
      senderId: 'me',
      senderName: null,
      body,
      createdAt: new Date(),
      mine: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const result =
      thread.kind === 'dm'
        ? await sendMessageAction(thread.userId, body)
        : await sendGroupMessageAction(thread.groupId, body);

    setSending(false);
    if (result.ok) {
      const rows =
        thread.kind === 'dm'
          ? await getConversationAction(thread.userId)
          : await getGroupMessagesAction(thread.groupId);
      setMessages(rows);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
    }
  }

  function insertEmoji(emoji: string) {
    setDraft((prev) => prev + emoji);
    inputRef.current?.focus();
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
                <span className={styles.headerName}>
                  {thread.kind === 'group' ? `# ${thread.name}` : (thread.name ?? 'Chat')}
                </span>
                <button className={styles.close} onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>

              <div className={styles.thread}>
                {threadLoading ? (
                  <div className={styles.empty}>Loading…</div>
                ) : messages.length === 0 ? (
                  <div className={styles.empty}>No messages yet — say hi.</div>
                ) : (
                  messages.map((m, i) => {
                    const previous = messages[i - 1];
                    const showDate = isNewDay(m.createdAt, previous?.createdAt);
                    return (
                      <div key={m.id}>
                        {showDate ? (
                          <div className={styles.dateSeparator}>
                            <span>{formatDateLabel(m.createdAt)}</span>
                          </div>
                        ) : null}
                        <div className={`${styles.bubbleRow} ${m.mine ? styles.mine : ''}`}>
                          <span className={styles.bubbleGroup}>
                            {thread.kind === 'group' && !m.mine ? (
                              <span className={styles.senderName}>{m.senderName}</span>
                            ) : null}
                            <span className={styles.bubble}>{m.body}</span>
                            <span className={styles.time}>{formatTime(m.createdAt)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })
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
                <div className={styles.emojiWrap}>
                  <button
                    type="button"
                    className={styles.emojiToggle}
                    onClick={() => setPickerOpen((v) => !v)}
                    aria-label="Emoji"
                  >
                    🙂
                  </button>
                  {pickerOpen ? (
                    <EmojiPicker onPick={insertEmoji} onClose={() => setPickerOpen(false)} />
                  ) : null}
                </div>
                <input
                  ref={inputRef}
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

              <div className={styles.searchWrap}>
                <input
                  className={styles.searchInput}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people or groups…"
                  autoComplete="off"
                />
              </div>

              <div className={styles.list}>
                {listLoading ? (
                  <div className={styles.empty}>Loading…</div>
                ) : !hasResults ? (
                  <div className={styles.empty}>
                    {query ? (
                      `No matches for “${search.trim()}”.`
                    ) : (
                      <>
                        No conversations yet — message a friend from your{' '}
                        <a href="/friends">friends list</a>.
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {visibleGroupChats.map((g) => (
                      <button
                        key={`group-${g.groupId}`}
                        className={styles.conversation}
                        onClick={() => setThread({ kind: 'group', groupId: g.groupId, name: g.groupName })}
                      >
                        <span className={styles.convoName}># {g.groupName}</span>
                        <span className={styles.convoPreview}>
                          {g.lastMessage ?? 'No messages yet'}
                        </span>
                        {g.unread > 0 ? (
                          <span className={styles.convoBadge}>{g.unread}</span>
                        ) : null}
                      </button>
                    ))}
                    {visibleConversations.map((c) => (
                      <button
                        key={`dm-${c.userId}`}
                        className={styles.conversation}
                        onClick={() => setThread({ kind: 'dm', userId: c.userId, name: c.name })}
                      >
                        <span className={styles.convoName}>{c.name ?? 'Unnamed'}</span>
                        <span className={styles.convoPreview}>{c.lastMessage}</span>
                        {c.unread > 0 ? (
                          <span className={styles.convoBadge}>{c.unread}</span>
                        ) : null}
                      </button>
                    ))}
                    {visibleFriends.map((f) => (
                      <button
                        key={`friend-${f.userId}`}
                        className={styles.conversation}
                        onClick={() => setThread({ kind: 'dm', userId: f.userId, name: f.name })}
                      >
                        <span className={styles.convoName}>
                          {f.name ?? (f.gameName ? `${f.gameName}#${f.tagLine}` : 'Unnamed')}
                        </span>
                        <span className={styles.convoPreview}>Friend · start a conversation</span>
                      </button>
                    ))}
                  </>
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
