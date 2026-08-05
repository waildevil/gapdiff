import Link from 'next/link';
import { championIcon, championIdToName, latestVersion, profileIcon, spellIcon } from '@/lib/ddragon';
import { getLiveGameView, type LiveGameParticipantView } from '@/lib/liveGame';
import { queueName } from '@/lib/profile';
import { formatRank } from '@/lib/rating/rating';
import { getRiotClient, RiotApiError } from '@/lib/riot/client';
import { isPlatform, PLATFORM_LABELS, regionForPlatform, type Platform } from '@/lib/riot/routing';
import { LiveRefresh } from '@/components/LiveRefresh';
import { LiveTimer } from '@/components/LiveTimer';
import profileStyles from '../profile.module.css';
import styles from './live.module.css';

interface PageProps {
  params: Promise<{ platform: string; gameName: string; tagLine: string }>;
}

// A live game's roster is nearly free to re-fetch and the whole point is
// that it's current, so this skips ISR entirely rather than serving a stale
// "in a game" state after the game has ended.
export const dynamic = 'force-dynamic';

const TEAM_LABEL: Record<number, string> = { 100: 'Blue Team', 200: 'Red Team' };

export default async function LiveGamePage({ params }: PageProps) {
  const { platform: platformParam, gameName: rawName, tagLine: rawTag } = await params;
  const gameName = decodeURIComponent(rawName);
  const tagLine = decodeURIComponent(rawTag);

  if (!isPlatform(platformParam)) {
    return (
      <Message title="Unknown region">
        <p className={profileStyles.messageBody}>
          &ldquo;{platformParam}&rdquo; isn&apos;t a region I recognise.
        </p>
      </Message>
    );
  }

  const platform = platformParam as Platform;
  const profileHref = `/player/${platform}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const riot = getRiotClient();

  let puuid: string;
  try {
    const account = await riot.getAccountByRiotId(regionForPlatform(platform), gameName, tagLine);
    puuid = account.puuid;
  } catch (error) {
    if (error instanceof RiotApiError && error.isNotFound) {
      return (
        <Message title="No such player">
          <p className={profileStyles.messageBody}>
            Riot has no account called <strong>{gameName}#{tagLine}</strong> on{' '}
            {PLATFORM_LABELS[platform]}.
          </p>
        </Message>
      );
    }
    throw error;
  }

  const [game, version] = await Promise.all([
    getLiveGameView(platform, puuid).catch((error) => {
      if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) throw error;
      return null;
    }),
    latestVersion(),
  ]);

  if (!game) {
    return (
      <Message title="Not in a game right now">
        <p className={profileStyles.messageBody}>
          {gameName}#{tagLine} isn&apos;t in an active game — or just finished one and the
          spectator feed hasn&apos;t caught up yet.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link href={profileHref} className={styles.backLink}>
            ← Back to profile
          </Link>
        </p>
      </Message>
    );
  }

  const champById = await championIdToName(version);
  const champIcon = (championId: number) => {
    const name = champById.get(championId);
    return name ? championIcon(version, name) : undefined;
  };

  return (
    <div className={styles.wrap}>
      <LiveRefresh intervalMs={15000} />

      <div className="page-head">
        <div className="eyebrow">
          {PLATFORM_LABELS[platform]} · {queueName(game.queueId)}
        </div>
        <h1>{gameName}&apos;s live game</h1>
        <p className="page-sub">
          <LiveTimer initialSeconds={game.gameLength} /> elapsed · updates every 15s
        </p>
      </div>

      <div className={styles.teams}>
        {game.teams.map((team) => (
          <div className="card" key={team.teamId}>
            <div className="card-head">
              <div className="card-title">{TEAM_LABEL[team.teamId] ?? `Team ${team.teamId}`}</div>
              {team.bannedChampionIds.length > 0 ? (
                <div className={styles.bans}>
                  {team.bannedChampionIds.map((championId, i) => (
                    <BanIcon key={i} src={champIcon(championId)} />
                  ))}
                </div>
              ) : null}
            </div>

            {team.participants.map((participant) => (
              <ParticipantRow
                key={participant.puuid}
                participant={participant}
                platform={platform}
                version={version}
                iconSrc={champIcon(participant.championId)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ParticipantRow({
  participant,
  platform,
  version,
  iconSrc,
}: {
  participant: LiveGameParticipantView;
  platform: Platform;
  version: string;
  iconSrc: string | undefined;
}) {
  const rank = participant.soloRank;

  return (
    <div className={styles.row}>
      {iconSrc ? (
        <img className={styles.champIcon} src={iconSrc} alt="" width={40} height={40} />
      ) : (
        <span className={styles.champIcon} />
      )}

      <div className={styles.spells}>
        <SpellImg version={version} id={participant.spell1Id} />
        <SpellImg version={version} id={participant.spell2Id} />
      </div>

      <img
        className={styles.profileIcon}
        src={profileIcon(version, participant.profileIconId)}
        alt=""
        width={24}
        height={24}
      />

      <div className={styles.identity}>
        {participant.bot ? (
          <span className={styles.name}>Bot</span>
        ) : participant.gameName && participant.tagLine ? (
          <Link
            className={styles.name}
            href={`/player/${platform}/${encodeURIComponent(participant.gameName)}/${encodeURIComponent(participant.tagLine)}`}
          >
            {participant.gameName}
            <span className={styles.tag}>#{participant.tagLine}</span>
          </Link>
        ) : (
          <span className={styles.name}>Unknown summoner</span>
        )}
      </div>

      <div className={styles.rank}>
        {rank ? formatRank(rank.tier, rank.rank, rank.leaguePoints) : 'Unranked'}
      </div>
    </div>
  );
}

function SpellImg({ version, id }: { version: string; id: number }) {
  const url = spellIcon(version, id);
  if (!url) return <span className={styles.spellIcon} />;
  return <img className={styles.spellIcon} src={url} alt="" width={18} height={18} />;
}

function BanIcon({ src }: { src: string | undefined }) {
  if (!src) return <span className={styles.banIcon} />;
  return <img className={styles.banIcon} src={src} alt="" width={22} height={22} />;
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={profileStyles.message}>
      <h1 className={profileStyles.messageTitle}>{title}</h1>
      {children}
    </div>
  );
}
