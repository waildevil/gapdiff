'use client';

import Link from 'next/link';
import { useState } from 'react';
import { championIcon, itemIcon, spellIcon } from '@/lib/ddragon';
import {
  formatDuration,
  matchTimeTooltip,
  queueName,
  timeAgo,
  type LobbyPlayer,
  type ProfileMatch,
  type TeamSummary,
} from '@/lib/profile';
import { ordinal, perfBackground, perfColor, ROLE_LABEL } from '@/lib/format';
import type { Platform } from '@/lib/riot/routing';
import styles from './MatchCard.module.css';

interface MatchCardProps {
  match: ProfileMatch;
  version: string;
  platform: Platform;
}

export function MatchCard({ match, version, platform }: MatchCardProps) {
  const [open, setOpen] = useState(false);

  const blue = match.lobby.filter((p) => p.teamId === 100);
  const red = match.lobby.filter((p) => p.teamId === 200);
  const blueTeam = match.teams.find((t) => t.teamId === 100);
  const redTeam = match.teams.find((t) => t.teamId === 200);

  const resultLabel = match.remake ? 'Remake' : match.win ? 'Win' : 'Loss';
  const resultClass = match.remake
    ? styles.resultRemake
    : match.win
      ? styles.resultWin
      : styles.resultLoss;
  const flagClass = match.remake
    ? styles.flagRemake
    : match.win
      ? styles.flagWin
      : styles.flagLoss;

  return (
    <div className={`${styles.card} ${open ? styles.expanded : ''}`}>
      <button
        className={styles.summary}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${match.championName}, ${resultLabel}. ${open ? 'Hide' : 'Show'} full scoreboard`}
      >
        <div className={`${styles.flag} ${flagClass}`} />

        <div className={styles.champBlock}>
          <div style={{ position: 'relative' }}>
            <img
              className={styles.champ}
              src={championIcon(version, match.championName)}
              alt={match.championName}
              width={42}
              height={42}
              loading="lazy"
            />
            <span className={styles.champLevel}>{match.championLevel}</span>
          </div>
          <div className={`${styles.spells} ${styles.hideSmall}`}>
            <SpellIcon version={version} id={match.spell1} className={styles.spell} />
            <SpellIcon version={version} id={match.spell2} className={styles.spell} />
          </div>
        </div>

        <div className={styles.nameCell}>
          <div className={styles.champName}>{match.championName}</div>
          <div className={styles.sub}>
            {queueName(match.queueId)} ·{' '}
            <span title={matchTimeTooltip(match.playedAt, match.durationSeconds)}>
              {timeAgo(match.playedAt)}
            </span>
          </div>
          <MatchBadges match={match} />
        </div>

        <div className={styles.kda}>
          {match.kills}/{match.deaths}/{match.assists}
          <div className={styles.sub}>
            {match.kda.toFixed(2)} KDA · {Math.round(match.killParticipation * 100)}%
          </div>
        </div>

        <div className={`${styles.cell} ${styles.hideSmall}`}>
          {match.cs} CS
          <div className={styles.sub}>{match.csPerMin.toFixed(1)}/min</div>
        </div>

        <div className={styles.cell}>
          <span className={resultClass}>
            <span className={styles.result}>{resultLabel}</span>
          </span>
          <div className={styles.sub}>{formatDuration(match.durationSeconds)}</div>
        </div>

        <div className={`${styles.itemRow} ${styles.hideSmall}`}>
          {match.items.map((id, index) => (
            <ItemIcon key={index} version={version} id={id} className={styles.item} emptyClassName={styles.itemEmpty} />
          ))}
          <ItemIcon version={version} id={match.trinket} className={styles.item} emptyClassName={styles.itemEmpty} />
        </div>

        <ScoreBadge score={match.performanceScore} className={styles.score} />

        <div className={styles.chevron}>▼</div>
      </button>

      {open ? (
        <div className={styles.detail}>
          <div className={styles.board}>
            <TeamBlock
              players={blue}
              team={blueTeam}
              label="Blue team"
              match={match}
              version={version}
              platform={platform}
            />
            <div className={styles.divider} />
            <TeamBlock
              players={red}
              team={redTeam}
              label="Red team"
              match={match}
              version={version}
              platform={platform}
            />
            <div className={styles.footer}>
              <span>{match.matchId}</span>
              <span>
                {match.performanceScore === null
                  ? 'Not scored — this queue has no lane roles'
                  : 'Score compares each player against the other nine in this lobby'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const MULTIKILL_LABEL: Record<number, string> = {
  2: 'Double kill',
  3: 'Triple kill',
  4: 'Quadra kill',
  5: 'Penta kill',
};

/**
 * The things worth noticing about a game at a glance.
 *
 * All of it falls out of scores already computed for the scoreboard, so the
 * strip costs nothing extra — and unlike a public site's version, the placement
 * opens into the same breakdown that produced it.
 */
function MatchBadges({ match }: { match: ProfileMatch }) {
  const multikill = MULTIKILL_LABEL[match.largestMultiKill];
  const lane = match.laneShare === null ? null : Math.round(match.laneShare * 100);

  // Remakes score nothing, so a badge strip on one would be inventing signal.
  if (match.remake) return null;

  const nothingToShow =
    match.placement === null && !multikill && lane === null && !match.mvp && !match.ace;
  if (nothingToShow) return null;

  return (
    <div className={styles.badges}>
      {match.mvp ? <span className={`${styles.badge} ${styles.badgeMvp}`}>MVP</span> : null}
      {match.ace ? <span className={`${styles.badge} ${styles.badgeAce}`}>ACE</span> : null}

      {match.placement !== null ? (
        <span
          className={`${styles.badge} ${match.placement <= 3 ? styles.badgeTop : ''}`}
          title={`${ordinal(match.placement)} of ${match.placementOf} players scored in this lobby`}
        >
          {ordinal(match.placement)}/{match.placementOf}
        </span>
      ) : null}

      {multikill ? (
        <span className={`${styles.badge} ${styles.badgeKill}`}>{multikill}</span>
      ) : null}

      {lane !== null ? (
        <span
          className={`${styles.badge} ${lane >= 55 ? styles.badgeTop : lane <= 45 ? styles.badgeDown : ''}`}
          title="Share of the lane's CS in the first 10 minutes, against your direct role opponent"
        >
          Laning {lane}:{100 - lane}
        </span>
      ) : null}
    </div>
  );
}

function TeamBlock({
  players,
  team,
  label,
  match,
  version,
  platform,
}: {
  players: LobbyPlayer[];
  team: TeamSummary | undefined;
  label: string;
  match: ProfileMatch;
  version: string;
  platform: Platform;
}) {
  const won = team?.win ?? false;

  return (
    <div>
      <div className={`${styles.teamHead} ${won ? styles.teamHeadWin : styles.teamHeadLoss}`}>
        <span>
          {won ? 'Victory' : 'Defeat'} · {label}
          {team ? (
            <span className={styles.objectives}>
              <span>{team.kills} kills</span>
              <span>{(team.gold / 1000).toFixed(1)}k gold</span>
              <span>{team.towers} towers</span>
              <span>{team.dragons} drakes</span>
              <span>{team.barons} baron</span>
            </span>
          ) : null}
        </span>
        <span>Score</span>
        <span>KDA</span>
        <span>Damage</span>
        <span>Wards</span>
        <span>CS</span>
        <span>Items</span>
      </div>

      {players.map((player) => (
        <div
          key={player.puuid}
          className={`${styles.playerRow} ${player.isSearchedPlayer ? styles.searched : ''}`}
        >
          <div className={styles.who}>
            <img
              className={styles.whoChamp}
              src={championIcon(version, player.championName)}
              alt={player.championName}
              width={30}
              height={30}
              loading="lazy"
            />
            <div className={styles.whoSpells}>
              <SpellIcon version={version} id={player.spell1} className={styles.whoSpell} />
              <SpellIcon version={version} id={player.spell2} className={styles.whoSpell} />
            </div>
            <div className={styles.whoName}>
              {player.gameName === 'Unknown' ? (
                <div className={styles.whoNameText} style={{ color: 'var(--faint)' }}>
                  {player.championName}
                </div>
              ) : (
                <Link
                  className={styles.whoNameText}
                  href={`/player/${platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`}
                  style={{ display: 'block' }}
                >
                  {player.gameName}
                </Link>
              )}
              <div className={styles.sub}>
                {player.role ? ROLE_LABEL[player.role] ?? player.role : `Lv ${player.championLevel}`}
              </div>
            </div>
          </div>

          <ScoreBadge score={player.performanceScore} className={styles.score} />

          <div className={styles.kda}>
            {player.kills}/{player.deaths}/{player.assists}
            <div className={styles.sub}>{Math.round(player.killParticipation * 100)}% KP</div>
          </div>

          <div className={styles.damageWrap}>
            <div className={styles.damageNums}>
              {player.damageDealt.toLocaleString()} · {player.damageTaken.toLocaleString()}
            </div>
            <div className={styles.damageTrack}>
              <div
                className={styles.damageDealt}
                style={{ width: `${(player.damageDealt / match.maxDamageDealt) * 100}%` }}
              />
            </div>
            <div className={styles.damageTrack}>
              <div
                className={styles.damageTaken}
                style={{ width: `${(player.damageTaken / match.maxDamageTaken) * 100}%` }}
              />
            </div>
          </div>

          <div className={styles.cell}>
            {player.wardsPlaced}
            <div className={styles.sub}>{player.controlWards} ctrl</div>
          </div>

          <div className={styles.cell}>
            {player.cs}
            <div className={styles.sub}>{player.csPerMin.toFixed(1)}/m</div>
          </div>

          <div className={styles.boardItems}>
            {player.items.map((id, index) => (
              <ItemIcon
                key={index}
                version={version}
                id={id}
                className={styles.boardItem}
                emptyClassName={styles.boardItemEmpty}
              />
            ))}
            <ItemIcon
              version={version}
              id={player.trinket}
              className={styles.boardItem}
              emptyClassName={styles.boardItemEmpty}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// CSS module lookups are `string | undefined` under noUncheckedIndexedAccess,
// and React accepts undefined for className, so these props mirror that.
function ScoreBadge({
  score,
  className,
}: {
  score: number | null;
  className: string | undefined;
}) {
  if (score === null) {
    return (
      <div className={className} style={{ color: 'var(--faint)' }}>
        —
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{ color: perfColor(score), background: perfBackground(score) }}
    >
      {score.toFixed(0)}
    </div>
  );
}

function SpellIcon({
  version,
  id,
  className,
}: {
  version: string;
  id: number;
  className: string | undefined;
}) {
  const url = spellIcon(version, id);
  if (!url) return <span className={className} />;
  return <img className={className} src={url} alt="" width={19} height={19} loading="lazy" />;
}

function ItemIcon({
  version,
  id,
  className,
  emptyClassName,
}: {
  version: string;
  id: number;
  className: string | undefined;
  emptyClassName: string | undefined;
}) {
  // Item id 0 means the slot was empty at the end of the game.
  if (!id) return <span className={emptyClassName} />;
  return (
    <img className={className} src={itemIcon(version, id)} alt="" width={22} height={22} loading="lazy" />
  );
}
