import Link from 'next/link';
import { championIcon, championIdToName, latestVersion, profileIcon, spellIcon } from '@/lib/ddragon';
import { getLiveGameView, type LiveGameParticipantView } from '@/lib/liveGame';
import { ROLE_LABEL, winRate } from '@/lib/format';
import { queueName } from '@/lib/profile';
import { RiotApiError, getRiotClient } from '@/lib/riot/client';
import { isPlatform, PLATFORM_LABELS, regionForPlatform, type Platform } from '@/lib/riot/routing';
import { LiveRefresh } from '@/components/LiveRefresh';
import { LiveTimer } from '@/components/LiveTimer';
import { RankBadge } from '@/components/RankBadge';
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

/** Riot has cycled the Arena queue id across patches; the mode name hasn't moved. */
const GAME_MODE_LABEL: Record<string, string> = { CHERRY: 'Arena' };

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

  const modeLabel = GAME_MODE_LABEL[game.gameMode] ?? queueName(game.queueId);

  const teamSections = game.isTeamless
    ? [{ teamId: 0, label: `${game.participants.length} players`, participants: game.participants }]
    : [100, 200]
        .filter((teamId) => game.participants.some((p) => p.teamId === teamId))
        .map((teamId) => ({
          teamId,
          label: TEAM_LABEL[teamId] ?? `Team ${teamId}`,
          participants: game.participants.filter((p) => p.teamId === teamId),
        }));

  return (
    <div className={styles.wrap}>
      <LiveRefresh intervalMs={15000} />

      <div className="page-head">
        <div className="eyebrow">
          {PLATFORM_LABELS[platform]} · {modeLabel}
        </div>
        <h1>{gameName}&apos;s live game</h1>
        <p className="page-sub">
          <LiveTimer initialSeconds={game.gameLength} /> elapsed · updates every 15s
        </p>
      </div>

      {game.bannedChampionIds.length > 0 ? (
        <div className={styles.bansCard}>
          <div className={styles.bansLabel}>Bans</div>
          <div className={styles.bansRow}>
            {game.bannedChampionIds.map((championId, i) => (
              <BanIcon key={i} src={champIcon(championId)} />
            ))}
          </div>
        </div>
      ) : null}

      {teamSections.map((section) => (
        <div className={styles.teamSection} key={section.teamId}>
          <div className={styles.teamHead}>
            {section.teamId !== 0 ? (
              <span
                className={styles.teamDot}
                style={{ background: section.teamId === 100 ? 'var(--accent)' : 'var(--bad)' }}
              />
            ) : null}
            {section.label}
          </div>
          <div className={styles.grid}>
            {section.participants.map((participant) => (
              <ParticipantCard
                key={participant.puuid}
                participant={participant}
                platform={platform}
                version={version}
                iconSrc={champIcon(participant.championId)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParticipantCard({
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
    <div className={styles.card}>
      <div className={styles.champWrap}>
        {iconSrc ? (
          <img className={styles.champIcon} src={iconSrc} alt="" width={56} height={56} />
        ) : (
          <span className={styles.champIcon} />
        )}
        <img
          className={styles.profileBadge}
          src={profileIcon(version, participant.profileIconId)}
          alt=""
          width={22}
          height={22}
        />
      </div>

      <div className={styles.spells}>
        <SpellImg version={version} id={participant.spell1Id} />
        <SpellImg version={version} id={participant.spell2Id} />
      </div>

      <div className={styles.cardBody}>
        {participant.bot ? (
          <span className={styles.name}>Bot</span>
        ) : participant.gameName ? (
          <Link
            className={styles.name}
            href={`/player/${platform}/${encodeURIComponent(participant.gameName)}/${encodeURIComponent(participant.tagLine ?? '')}`}
          >
            {participant.gameName}
            {participant.tagLine ? <span className={styles.tag}>#{participant.tagLine}</span> : null}
          </Link>
        ) : (
          <span className={styles.name}>Unknown summoner</span>
        )}

        <RankBadge
          rank={rank ? { tier: rank.tier, division: rank.rank, leaguePoints: rank.leaguePoints } : null}
        />
        {rank && rank.wins + rank.losses > 0 ? (
          <span className={styles.record}>
            {winRate(rank.wins, rank.losses)}% WR · {rank.wins + rank.losses}G
          </span>
        ) : null}
        {participant.roleHistory.length > 0 ? (
          <div className={styles.roles} title="From matches gapdiff has already scored — only covers players who've crossed paths with the group before">
            {participant.roleHistory.slice(0, 2).map((r) => (
              <span key={r.role} className={styles.roleChip}>
                {ROLE_LABEL[r.role] ?? r.role} {r.games}G · {winRate(r.wins, r.games - r.wins)}%
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SpellImg({ version, id }: { version: string; id: number }) {
  const url = spellIcon(version, id);
  if (!url) return <span className={styles.spellIcon} />;
  return <img className={styles.spellIcon} src={url} alt="" width={20} height={20} />;
}

function BanIcon({ src }: { src: string | undefined }) {
  if (!src) return <span className={styles.banIcon} />;
  return <img className={styles.banIcon} src={src} alt="" width={30} height={30} />;
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={profileStyles.message}>
      <h1 className={profileStyles.messageTitle}>{title}</h1>
      {children}
    </div>
  );
}
