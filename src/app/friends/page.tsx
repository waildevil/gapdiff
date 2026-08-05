import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BlockedList } from '@/components/BlockedList';
import { FriendInbox } from '@/components/FriendInbox';
import { FriendSearch } from '@/components/FriendSearch';
import { FriendsList } from '@/components/FriendsList';
import { listBlocked, listFriends, listIncomingFriendRequests } from '@/lib/friends';
import styles from './friends.module.css';

export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/friends');

  const [requests, friends, blocked] = await Promise.all([
    listIncomingFriendRequests(session.user.id),
    listFriends(session.user.id),
    listBlocked(session.user.id),
  ]);

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">Friends</div>
        <h1>People you play with</h1>
        <p className="page-sub">
          Friends can message you. Blocking someone also stops them from challenging
          you to a duel. Add someone from your groups, or search by name.
        </p>
      </div>

      <FriendInbox requests={requests} />

      <div className="section-gap">
        <FriendSearch />
      </div>

      <FriendsList friends={friends} />

      <BlockedList blocked={blocked} />
    </div>
  );
}
