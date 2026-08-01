import Link from 'next/link';
import { latestVersion } from '@/lib/ddragon';
import { getChampionHistory, getChampionMatchups } from '@/lib/championHistory';
import { getProfile, ProfileNotFound } from '@/lib/profile';
import { isPlatform, PLATFORM_LABELS, type Platform } from '@/lib/riot/routing';
import { ChampionTable } from '@/components/ChampionTable';
import styles from './champions.module.css';

interface PageProps {
  params: Promise<{ platform: string; gameName: string; tagLine: string }>;
}

export const revalidate = 60;

/**
 * The full champion pool, split out from the profile sidebar.
 *
 * Everything here comes from stored history, so an account the ingester does
 * not track has nothing to show — the page says so rather than rendering an
 * empty table.
 */
export default async function ChampionsPage({ params }: PageProps) {
  const { platform: platformParam, gameName: rawName, tagLine: rawTag } = await params;

  const gameName = decodeURIComponent(rawName);
  const tagLine = decodeURIComponent(rawTag);

  if (!isPlatform(platformParam)) return <Missing gameName={gameName} tagLine={tagLine} />;

  const platform = platformParam as Platform;
  const profileHref = `/player/${platform}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  let puuid: string;
  try {
    const profile = await getProfile(platform, gameName, tagLine);
    puuid = profile.puuid;
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return <Missing gameName={gameName} tagLine={tagLine} />;
    }
    throw error;
  }

  const [history, matchups, version] = await Promise.all([
    getChampionHistory(puuid).catch(() => ({ rows: [], since: null })),
    getChampionMatchups(puuid).catch(() => []),
    latestVersion(),
  ]);

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">
          <Link href={profileHref} className={styles.back}>
            ← {gameName}#{tagLine}
          </Link>
          {' · '}
          {PLATFORM_LABELS[platform]}
        </div>
        <h1>Champion pool</h1>
        <p className="page-sub">
          Every champion played this season, and who was standing in the other
          half of the lane. Matchups use the same role pairing the Gap Score uses
          for its lane bonus, so the two never disagree about who the opponent
          was.
        </p>
      </div>

      {history.rows.length === 0 ? (
        <div className="card">
          <div className={styles.empty}>
            <b>Nothing stored for this account.</b>
            <p>
              Champion history comes from ingested matches, and only accounts on
              a group board get ingested. The profile page still shows the last
              ten games live from Riot.
            </p>
            <Link href={profileHref} className={styles.link}>
              Back to profile →
            </Link>
          </div>
        </div>
      ) : (
        <ChampionTable history={history.rows} matchups={matchups} version={version} />
      )}
    </div>
  );
}

function Missing({ gameName, tagLine }: { gameName: string; tagLine: string }) {
  return (
    <div className={styles.wrap}>
      <div className="card">
        <div className={styles.empty}>
          <b>No such player.</b>
          <p>
            Riot has no account called {gameName}#{tagLine} on that region.
          </p>
          <Link href="/" className={styles.link}>
            Back to search →
          </Link>
        </div>
      </div>
    </div>
  );
}
