import { ordinal } from './format';
import type { GroupStandings } from './leaderboard';
import type { GroupMovement, Highlights, NotableGame } from './movement';

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

  const stories = highlightLines(movement.highlights);

  /*
   * Movement is not the only news.
   *
   * This used to bail here when nobody's position or LP had moved, which
   * silenced a board where somebody went 26/0/2 with eleven solo kills — the
   * single most postworthy thing the scoring has ever produced. Standings shift
   * slowly; individual games are the part worth interrupting people for.
   */
  if (moved.length === 0 && stories.length === 0) return null;

  // Biggest movers first — that is the bit people read.
  moved.sort(
    (a, b) =>
      Math.abs(b.lpDelta ?? 0) + Math.abs(b.positionDelta ?? 0) * 25 -
      (Math.abs(a.lpDelta ?? 0) + Math.abs(a.positionDelta ?? 0) * 25),
  );

  /*
   * Games first, standings second: a named game gets a reaction, a table of
   * numbers does not.
   */
  const movers = moved
    .map((p) => {
      const arrow = (p.positionDelta ?? 0) > 0 ? '▲' : (p.positionDelta ?? 0) < 0 ? '▼' : '';
      const shift = p.positionDelta ? `${arrow}${Math.abs(p.positionDelta)}` : '';
      const place = p.position === null ? '' : `${ordinal(p.position)}`;
      return `**${p.gameName}** ${[place, shift].filter(Boolean).join(' ')}`.trim();
    })
    .join(' · ');

  /*
   * Deliberately a standing, not an announcement. Titles are decided at month
   * end — mid-month one flips on a handful of games and flips back two days
   * later — so this says who is holding them right now and points at the board
   * rather than declaring anybody the winner.
   */
  const titles = movement.currentTitles
    .slice(0, 3)
    .map((t) => `**${t.label}** ${t.holder}`)
    .join(' · ');

  const sections = [
    stories.join('\n'),
    movers ? `Moved today — ${movers}` : '',
    titles
      ? movement.titlesFrom === 'current'
        ? `Holding the titles right now — ${titles}`
        : `${movement.titlesPeriodLabel} titles — ${titles}`
      : '',
  ].filter(Boolean);

  return envelope(
    `${movement.groupName} — what changed`,
    movement.slug,
    sections.join('\n\n'),
    'Titles are provisional until the month ends. Tap the title to see the board.',
  );
}

/** The games worth a sentence. Numbers alone are a spreadsheet, not banter. */
function highlightLines(highlights: Highlights): string[] {
  const lines: string[] = [];
  const kda = (g: NotableGame) => `${g.kills}/${g.deaths}/${g.assists} ${g.championName}`;

  if (highlights.best) {
    const g = highlights.best;
    const solo = g.soloKills >= 3 ? `, ${g.soloKills} solo kills` : '';
    const top = g.placement === 1 ? ', best in the lobby' : '';
    lines.push(`🔥 **${g.gameName}** ${kda(g)} — ${g.score}${top}${solo}`);
  }

  if (highlights.carried) {
    const g = highlights.carried;
    const how =
      g.placement === 1
        ? 'top of the lobby and still lost'
        : `${ordinal(g.placement)} in the lobby, still lost`;
    lines.push(`😤 **${g.gameName}** ${kda(g)} — ${g.score}, ${how}`);
  }

  if (highlights.worst) {
    const g = highlights.worst;
    lines.push(`💀 **${g.gameName}** ${kda(g)} — ${g.score}`);
  }

  return lines;
}

/**
 * The weekly wrap: titles, once they mean something.
 *
 * Deliberately separate from the digest. Mid-week a title flips on a handful
 * of games and flips back two days later, so announcing them daily would be
 * noise that contradicts itself. Posted once, for a week that has finished.
 */
export function weeklyPayload(
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

/**
 * The environment variable carrying a group's webhook.
 *
 * Webhook URLs stay out of the database entirely. The token in one is a bearer
 * credential — anyone holding it can post to that channel as anybody — and a
 * database is the wrong place for that when the alternative is a secret store
 * we already use for the Riot key. One secret per group, resolved by slug.
 *
 * The trade is that adding a group means adding a secret rather than filling in
 * a form. With a handful of private boards owned by one person that is not a
 * cost worth writing an encryption layer to avoid.
 */
export function webhookEnvName(slug: string): string {
  return `DISCORD_WEBHOOK_${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

/** A group's own webhook, or the shared one, or nothing. */
export function webhookFor(slug: string): string | null {
  return process.env[webhookEnvName(slug)] ?? process.env.DISCORD_WEBHOOK_URL ?? null;
}

/** Posts a payload, throwing with Discord's own message when it rejects it. */
export async function postToDiscord(url: string, payload: WebhookPayload): Promise<void> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Deliberately does not include the URL. A network error surfacing in CI
    // logs must never be the thing that leaks the credential.
    throw new Error(`Discord webhook request failed: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(`Discord webhook ${response.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Sent the moment a group connects, so the owner sees it land.
 *
 * Without this a webhook cannot be verified until the board happens to have
 * news, which on a quiet group can be days — and "did I paste the right URL?"
 * is exactly the question you want answered while you still have the settings
 * page open.
 */
export function connectedPayload(groupName: string, slug: string): WebhookPayload {
  return envelope(
    `${groupName} — connected`,
    slug,
    'This channel will get the evening digest and the monthly results. ' +
      'Quiet days post nothing, so silence here means nothing happened rather ' +
      'than something broken.',
  );
}
