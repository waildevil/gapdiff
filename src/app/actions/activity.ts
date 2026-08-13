'use server';

import { auth } from '@/auth';
import { refreshAndListActivity, type ActivityFeed } from '@/lib/activity';

const EMPTY_FEED: ActivityFeed = { liveNow: [], recentEvents: [] };

export async function getActivityFeedAction(): Promise<ActivityFeed> {
  const session = await auth();
  if (!session?.user?.id) return EMPTY_FEED;
  return refreshAndListActivity(session.user.id).catch(() => EMPTY_FEED);
}
