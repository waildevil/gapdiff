import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { checkGroupAccess } from '@/lib/access';
import {
  GapMarker,
  StandingsHeader,
  StandingsRow,
  UnrankedDivider,
  UnratedDivider,
} from '@/components/StandingsRow';
import { Pairings } from '@/components/Pairings';
import { MyBoardAccounts } from '@/components/MyBoardAccounts';
import { PeriodPicker } from '@/components/PeriodPicker';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { Titles } from '@/components/Titles';
import { latestVersion } from '@/lib/ddragon';
import { getRelationshipStatuses } from '@/lib/friends';
import { listMyAccountsForGroup } from '@/lib/groups';
import { getGroupStandings } from '@/lib/leaderboard';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}

// Standings only change when the ingester runs, so a short cache is plenty.
export const revalidate = 60;

export default async function GroupPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { month: monthParam } = await searchParams;

  const session = await auth();
  const access = await checkGroupAccess(slug, session?.user?.id);

  if (!access.allowed) {
    if (access.reason === 'not-found') notFound();
    return <PrivateGroup name={access.groupName} slug={slug} signedIn={access.signedIn} />;
  }

  const requested = Number.parseInt(monthParam ?? '', 10);
  const [standings, version, myAccounts] = await Promise.all([
    getGroupStandings(slug, Number.isFinite(requested) ? requested : undefined),
    latestVersion(),
    session?.user?.id
      ? listMyAccountsForGroup(access.group.id, session.user.id)
      : Promise.resolve([]),
  ]);

  if (!standings) notFound();

  const { group, entries, totalGames, period, boards, pairings } = standings;
  const scored = entries.filter((entry) => entry.rating.games > 0);

  const ownerIds = entries
    .map((entry) => entry.player.ownerId)
    .filter((id): id is string => id !== null);
  const relationships = session?.user?.id
    ? await getRelationshipStatuses(session.user.id, ownerIds)
    : new Map();

  return (
    <div className="page" style={{ margin: '0 auto' }}>
      <div className="page-head">
        <div className="eyebrow">{group.name}</div>
        <h1>The gap, as of right now</h1>
        <p className="page-sub">
          Gap Score weights ranked LP, in-game performance against the lobby you played in,
          and consistency. Every number is clickable.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No members yet"
          body="Add Riot IDs to config/group.json and run the seed script."
          command="npm run seed"
        />
      ) : scored.length === 0 ? (
        <EmptyState
          title="No games ingested yet"
          body="The group exists but no match history has been pulled in."
          command="npm run ingest"
        />
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Standings</div>
              <div className="card-note">
                {entries.length} {entries.length === 1 ? 'player' : 'players'} ·{' '}
                {totalGames} games scored
              </div>
            </div>

            <PeriodPicker
              slug={group.slug}
              index={period.index}
              latestIndex={period.latestIndex}
              label={period.label}
              start={period.start}
              end={period.end}
              games={period.games}
              isCurrent={period.isCurrent}
            />

            <StandingsHeader />

            <div>
              {entries.map((entry, index) => {
                const above = index > 0 ? entries[index - 1] : undefined;

                // Dividers, not gap markers, wherever the scores stop being
                // built the same way — a difference across those lines isn't
                // a real gap.
                const entersUnrated =
                  above !== undefined && above.rating.rated && !entry.rating.rated;
                const entersUnranked =
                  above !== undefined &&
                  entry.rating.rated &&
                  above.rating.rankScore !== null &&
                  entry.rating.rankScore === null;

                return (
                  <div key={entry.player.puuid}>
                    {entersUnrated ? (
                      <UnratedDivider />
                    ) : entersUnranked ? (
                      <UnrankedDivider />
                    ) : above && entry.rating.rated ? (
                      <GapMarker delta={entry.gapToNext} />
                    ) : null}
                    <StandingsRow
                      entry={entry}
                      version={version}
                      relationship={
                        entry.player.ownerId ? relationships.get(entry.player.ownerId) : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {access.isMember ? (
            <MyBoardAccounts
              groupId={access.group.id}
              slug={group.slug}
              accounts={myAccounts}
            />
          ) : null}

          <div className="section-gap grid grid-2">
            <div>
              <div className="page-head" style={{ marginTop: 24, marginBottom: 14 }}>
                <div className="eyebrow">{period.label} · click a title for the full ranking</div>
                <h2 style={{ fontSize: 19, margin: 0, letterSpacing: '-0.02em' }}>
                  Who leads what
                </h2>
              </div>
              <Titles boards={boards} />
            </div>

            <div>
              <div className="page-head" style={{ marginTop: 24, marginBottom: 14 }}>
                <div className="eyebrow">Who queues with whom</div>
                <h2 style={{ fontSize: 19, margin: 0, letterSpacing: '-0.02em' }}>
                  Duos
                </h2>
              </div>
              <Pairings
                pairs={pairings}
                players={entries.map((entry) => entry.player)}
                periodLabel={period.label}
              />
            </div>
          </div>

          <div className="section-gap">
            <div className="page-head" style={{ marginTop: 24, marginBottom: 14 }}>
              <div className="eyebrow">How the Gap Score is built</div>
              <h2 style={{ fontSize: 19, margin: 0, letterSpacing: '-0.02em' }}>
                Three pillars, weighted
              </h2>
            </div>
            <ScoreBreakdown />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Private groups are unlisted *and* unreadable. An invite is the only way in,
 * which is the point of a closed group.
 */
function PrivateGroup({
  name,
  slug,
  signedIn,
}: {
  name: string;
  slug: string;
  signedIn: boolean;
}) {
  const linkStyle = {
    color: 'var(--accent)',
    fontFamily: 'var(--mono)',
    fontSize: 12,
  } as const;

  return (
    <div style={{ maxWidth: 520, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <div className="card" style={{ padding: '40px 28px' }}>
        <div className="eyebrow">Private group</div>
        <h1 style={{ fontSize: 22, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          {name} is members only
        </h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
          {signedIn
            ? 'You need an invite from the group owner to see these standings.'
            : 'Sign in — if you are a member of this group, the standings will open up.'}
        </p>
        {signedIn ? (
          <Link href="/groups" style={linkStyle}>
            Your groups →
          </Link>
        ) : (
          <Link href={`/signin?callbackUrl=/group/${slug}`} style={linkStyle}>
            Sign in →
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  command,
}: {
  title: string;
  body: string;
  command: string;
}) {
  return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{title}</h2>
      <p style={{ color: 'var(--muted)', margin: '0 0 18px' }}>{body}</p>
      <code
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-sm)',
          padding: '7px 12px',
          color: 'var(--accent)',
        }}
      >
        {command}
      </code>
      <p style={{ marginTop: 24 }}>
        <Link href="/" style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12 }}>
          ← Back to search
        </Link>
      </p>
    </div>
  );
}
