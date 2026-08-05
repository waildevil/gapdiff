import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BlockedList } from '@/components/BlockedList';
import { FriendInbox } from '@/components/FriendInbox';
import { FriendRequestsSent } from '@/components/FriendRequestsSent';
import { FriendSearch } from '@/components/FriendSearch';
import { FriendsList } from '@/components/FriendsList';
import { LiveRefresh } from '@/components/LiveRefresh';
import {
  listBlocked,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '@/lib/friends';
import styles from './friends.module.css';

export const dynamic = 'force-dynamic';

// How often to check for something someone else did — a request landing, one
// of yours getting accepted — without you having to reload.
const REFRESH_MS = 4_000;

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/friends');

  const [requests, sent, friends, blocked] = await Promise.all([
    listIncomingFriendRequests(session.user.id),
    listOutgoingFriendRequests(session.user.id),
    listFriends(session.user.id),
    listBlocked(session.user.id),
  ]);

  return (
    <div className={styles.wrap}>
      <LiveRefresh intervalMs={REFRESH_MS} />

      <div className="page-head">
        <div className="eyebrow">Friends</div>
        <h1>People you play with</h1>
        <p className="page-sub">
          Friends can message you. Blocking someone also stops them from challenging
          you to a duel. Add someone from your groups, or search by Riot ID.
        </p>
      </div>

      <FriendInbox requests={requests} />

      <div className="section-gap">
        <FriendSearch />
      </div>

      <FriendRequestsSent requests={sent} />

      <FriendsList friends={friends} />

      <BlockedList blocked={blocked} />
    </div>
  );
}
