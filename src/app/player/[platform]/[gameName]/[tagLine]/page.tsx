import Link from 'next/link';
import { latestVersion, profileIcon, rankEmblem } from '@/lib/ddragon';
import { getProfile, ProfileNotFound } from '@/lib/profile';
import { isPlatform, PLATFORM_LABELS, type Platform } from '@/lib/riot/routing';
import { formatRank } from '@/lib/rating/rating';
import { tierColor, winRate } from '@/lib/format';
import { RiotApiError, getRiotClient } from '@/lib/riot/client';
import { ChampionSidebar } from '@/components/ChampionSidebar';
import { getChampionHistory } from '@/lib/championHistory';
import { MatchSection } from '@/components/MatchSection';
import { RecentlyPlayedWith } from '@/components/RecentlyPlayedWith';
import styles from './profile.module.css';

interface PageProps {
  params: Promise<{ platform: string; gameName: string; tagLine: string }>;
}

// Riot data changes every game; a short window keeps repeat views fast without
// showing stale rank.
export const revalidate = 60;

export default async function PlayerPage({ params }: PageProps) {
  const { platform: platformParam, gameName: rawName, tagLine: rawTag } = await params;

  const gameName = decodeURIComponent(rawName);
  const tagLine = decodeURIComponent(rawTag);

  if (!isPlatform(platformParam)) {
    return (
      <Message title="Unknown region">
        <p className={styles.messageBody}>
          &ldquo;{platformParam}&rdquo; isn&apos;t a region I recognise. Pick one from the
          dropdown and search again.
        </p>
      </Message>
    );
  }

  const platform = platformParam as Platform;
  const profileHref = `/player/${platform}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  try {
    const [profile, version] = await Promise.all([
      getProfile(platform, gameName, tagLine),
      latestVersion(),
    ]);

    // Empty for anybody the ingester doesn't track, which the sidebar handles
    // by falling back to the ten live matches.
    const [championHistory, activeGame] = await Promise.all([
      getChampionHistory(profile.puuid).catch(() => ({ rows: [], since: null })),
      getRiotClient().getActiveGame(platform, profile.puuid).catch(() => null),
    ]);

    return (
      <div className={styles.wrap}>
        <div className={styles.sidebar}>
          <ChampionSidebar
            history={championHistory.rows}
            since={championHistory.since?.toISOString() ?? null}
            profileHref={profileHref}
            matches={profile.matches}
            version={version}
          />

          {/* Tallied over the first page only, so it stays put while the tabs
              in the main column swap the match list. */}
          <RecentlyPlayedWith
            teammates={profile.teammates}
            platform={platform}
            games={profile.recent.games}
            version={version}
          />
        </div>

        <div className={styles.main}>
          <div className="card">
            <div className={styles.identity}>
            <img
              className={styles.icon}
              src={profileIcon(version, profile.profileIconId)}
              alt=""
              width={72}
              height={72}
            />

            <div className={styles.names}>
              <h1 className={styles.name}>
                {profile.gameName}
                <span>#{profile.tagLine}</span>
              </h1>
              <div className={styles.meta}>
                Level {profile.summonerLevel} · {PLATFORM_LABELS[platform]}
              </div>
            </div>

            {activeGame ? (
              <Link href={`${profileHref}/live`} className={`chip good ${styles.liveBadge}`}>
                <span className={styles.liveDot} />
                Live now · spectate
              </Link>
            ) : null}

            <div className={styles.ranks}>
              <RankCard label="Ranked Solo" entry={profile.solo} />
              <RankCard label="Ranked Flex" entry={profile.flex} />
            </div>
          </div>
        </div>

        {/* Owns the queue tabs, so the summary tiles reflect the active tab. */}
        <MatchSection
          initialMatches={profile.matches}
          initialHasMore={profile.hasMore}
          initialNextStart={profile.nextStart}
          puuid={profile.puuid}
          platform={platform}
          version={version}
        />

        <div className="note">
          <b>How the score works.</b> Each metric — kill participation, damage share, CS
          per minute, vision, deaths — is compared against the other nine players in that
          exact match, weighted by role, then squashed to 0–100. Beating your direct lane
          opponent counts extra. Remakes score nothing. Click any game to see the full
          scoreboard with every player scored the same way.
        </div>
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return (
        <Message title="No such player">
          <p className={styles.messageBody}>
            Riot has no account called <strong>{gameName}#{tagLine}</strong> on{' '}
            {PLATFORM_LABELS[platform]}.
          </p>
          <div className={styles.messageHint}>
            Check the tag after the # — it&apos;s often not your region. Someone on EUW can
            have the tag #1234 or #DEVIL. And make sure the region dropdown matches the
            server they actually play on.
          </div>
        </Message>
      );
    }

    if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) {
      return (
        <Message title="Riot key expired">
          <p className={styles.messageBody}>
            The API key was rejected. Development keys last 24 hours.
          </p>
          <div className={styles.messageHint}>
            Regenerate at developer.riotgames.com, then update RIOT_API_KEY in gapdiff/.env
            and restart the dev server.
          </div>
        </Message>
      );
    }

    if (error instanceof RiotApiError && error.status === 429) {
      return (
        <Message title="Rate limited">
          <p className={styles.messageBody}>
            Riot is throttling us. Development keys allow 20 requests per second and 100
            every two minutes, and a profile costs about a dozen. Wait a moment and retry.
          </p>
        </Message>
      );
    }

    throw error;
  }
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.message}>
      <h1 className={styles.messageTitle}>{title}</h1>
      {children}
      <p style={{ marginTop: 24 }}>
        <Link href="/" style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12 }}>
          â† Back to search
        </Link>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  foot,
  color,
}: {
  label: string;
  value: string;
  foot: string;
  color?: string;
}) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}

function RankCard({
  label,
  entry,
}: {
  label: string;
  entry: { tier: string; rank: string; leaguePoints: number; wins: number; losses: number } | null;
}) {
  const tier = entry?.tier ?? 'UNRANKED';

  return (
    <div className={styles.rank}>
      {/* Community Dragon carries a crest for every tier including unranked,
          so the card keeps its shape whether or not the queue is placed. */}
      <img
        className={styles.rankEmblem}
        src={rankEmblem(tier)}
        alt=""
        width={44}
        height={44}
      />

      <div className={styles.rankText}>
        <div className={styles.rankQueue}>{label}</div>
        <div className={styles.rankTier} style={{ color: tierColor(tier) }}>
          {entry ? formatRank(entry.tier, entry.rank, entry.leaguePoints) : 'Unranked'}
        </div>
        {entry ? (
          <div className={styles.rankRecord}>
            {entry.wins}W {entry.losses}L · {winRate(entry.wins, entry.losses)}%
          </div>
        ) : null}
      </div>
    </div>
  );
}
