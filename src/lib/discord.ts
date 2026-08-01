import type { GroupStandings } from './leaderboard';
import type { GroupMovement } from './movement';

/**
 * Rendering group news as Discord messages.
 *
 * The group lives in Discord; the leaderboard lives on a website nobody
 * remembers to open. This is the bridge — but only for things that actually
 * changed. A daily repost of unchanged standings gets a channel muted inside a
 * week, so every payload here is allowed to be null and the caller stays quiet.
 */

const SITE = 'https://gapdiff.vercel.app';

/** Amber, matching the site's accent. */
const COLOUR = 0xf0a020;

export interface WebhookPayload {
  username: string;
  embeds: {
    title: string;
    url?: string;
    color: number;
    description: string;
    footer?: { text: string };
  }[];
  /** Names come from Riot and are attacker-controlled; never let one ping. */
  allowed_mentions: { parse: [] };
}

function envelope(title: string, slug: string, description: string, footer?: string): WebhookPayload {
  return {
    username: 'gapdiff',
    embeds: [
      {
        title,
        url: `${SITE}/group/${slug}`,
        color: COLOUR,
        description,
        ...(footer ? { footer: { text: footer } } : {}),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * The daily digest: who moved.
 *
 * Returns null when nothing happened, which is the common case on a quiet day
 * and the whole reason this is worth having.
 */
export function digestPayload(movement: GroupMovement): WebhookPayload | null {
  /*
   * Only people who actually played on this board.
   *
   * LP is a property of the account, not the group, so somebody on three
   * boards would otherwise have the same "+18 LP" announced three times into
   * the same channel. Requiring games in the period keeps each message about
   * the group it names, and a board where nobody played stays silent.
   */
  const moved = movement.players.filter(
    (p) => p.games > 0 && ((p.positionDelta ?? 0) !== 0 || (p.lpDelta ?? 0) !== 0),
  );
  if (moved.length === 0) return null;

  // Biggest movers first — that is the bit people read.
  moved.sort(
    (a, b) =>
      Math.abs(b.lpDelta ?? 0) + Math.abs(b.positionDelta ?? 0) * 25 -
      (Math.abs(a.lpDelta ?? 0) + Math.abs(a.positionDelta ?? 0) * 25),
  );

  const lines = moved.map((p) => {
    const arrow = (p.positionDelta ?? 0) > 0 ? '▲' : (p.positionDelta ?? 0) < 0 ? '▼' : ' ';
    const place = p.position === null ? ' —' : `${p.position}`.padStart(2);
    const shift = p.positionDelta ? ` (${signed(p.positionDelta)})` : '';
    const lp = p.lpDelta === null ? '' : `  ${signed(p.lpDelta)} LP`;
    const games = p.games ? `  ${p.games}g` : '';
    return `${arrow} ${place}. ${p.gameName.padEnd(16)}${lp}${shift}${games}`;
  });

  // A code fence is the only way Discord keeps columns lined up.
  return envelope(
    `${movement.groupName} — what changed`,
    movement.slug,
    '```\n' + lines.join('\n') + '\n```',
    'LP is ranked solo. Positions reset each month.',
  );
}

/**
 * The monthly wrap: titles, once they mean something.
 *
 * Deliberately separate from the digest. Mid-month a title flips on a handful
 * of games and flips back two days later, so announcing them daily would be
 * noise that contradicts itself. Posted once, for a month that has finished.
 */
export function monthlyPayload(
  standings: GroupStandings,
  periodLabel: string,
): WebhookPayload | null {
  const rated = standings.entries.filter((e) => e.rating.rated);
  if (rated.length === 0) return null;

  const table = rated
    .map(
      (e, i) =>
        `${String(i + 1).padStart(2)}. ${(e.player.nickname ?? e.player.gameName).padEnd(16)} ` +
        `${e.rating.gapScore.toFixed(1).padStart(5)}  ${e.rating.wins}W ${e.rating.losses}L`,
    )
    .join('\n');

  const titles: string[] = [];
  for (const board of standings.boards) {
    for (const row of board.rows) {
      if (!row.holdsTitle) continue;
      titles.push(
        row.takenFrom
          ? `**${board.label}** — ${row.gameName} *(taken from ${row.takenFrom})*`
          : `**${board.label}** — ${row.gameName}`,
      );
    }
  }

  const description =
    (titles.length ? titles.join('\n') + '\n\n' : '') +
    '```\n' + table + '\n```';

  return envelope(
    `${standings.group.name} — ${periodLabel} final`,
    standings.group.slug,
    description,
    `${standings.totalGames} games scored`,
  );
}

/** Posts a payload, throwing with Discord's own message when it rejects it. */
export async function postToDiscord(url: string, payload: WebhookPayload): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(`Discord webhook ${response.status}: ${body.slice(0, 200)}`);
  }
}
