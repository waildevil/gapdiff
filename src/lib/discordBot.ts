/**
 * The gapdiff Discord bot — same Application as the login provider, its Bot
 * user. Used only for the "Add to Discord" install flow: listing a guild's
 * channels once the bot has joined, and minting a webhook for whichever one
 * the owner picks. Everything after that still goes through the plain
 * webhook POST in discord.ts — the bot never sends messages itself.
 */

const API = 'https://discord.com/api/v10';

export class DiscordBotError extends Error {}

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new DiscordBotError('DISCORD_BOT_TOKEN is not configured.');
  return token;
}

async function botRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new DiscordBotError(`Discord API ${response.status} on ${path}: ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export interface DiscordChannel {
  id: string;
  name: string;
}

/** GUILD_TEXT and GUILD_ANNOUNCEMENT — the channel types a webhook can post into. */
const POSTABLE_TYPES = new Set([0, 5]);

/** Requires the bot to already be a member of the guild — true right after install. */
export async function listGuildTextChannels(guildId: string): Promise<DiscordChannel[]> {
  const channels = await botRequest<{ id: string; name: string; type: number; position: number }[]>(
    `/guilds/${guildId}/channels`,
  );

  return channels
    .filter((c) => POSTABLE_TYPES.has(c.type))
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, name: c.name }));
}

/** For display only — "connected to **Server** → #channel" instead of a webhook link. */
export async function getGuildName(guildId: string): Promise<string> {
  const guild = await botRequest<{ name: string }>(`/guilds/${guildId}`);
  return guild.name;
}

/**
 * Same as getGuildName, for one channel. Deliberately goes through the guild
 * channel list rather than `GET /channels/{id}` directly — that endpoint 403s
 * on a channel with permission overwrites that hide it from the bot's own
 * role, even though the list endpoint (which is how the picker itself is
 * built) still shows it fine, and the webhook posts into it regardless since
 * a webhook's own token is a separate authorization from the bot's.
 */
export async function getChannelName(guildId: string, channelId: string): Promise<string | null> {
  const channels = await listGuildTextChannels(guildId);
  return channels.find((c) => c.id === channelId)?.name ?? null;
}

/**
 * Creates a fresh incoming webhook for a channel, same shape a human gets
 * from Discord's own UI — so it slots straight into setGroupWebhook()
 * unchanged, validation, test-post and encryption included.
 */
export async function createChannelWebhook(channelId: string): Promise<string> {
  const webhook = await botRequest<{ id: string; token: string }>(`/channels/${channelId}/webhooks`, {
    method: 'POST',
    body: JSON.stringify({ name: 'gapdiff' }),
  });
  return `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
}

/**
 * The "Add to Discord" link. Discord's own screen handles picking the
 * server; `response_type=code` + `redirect_uri` is only there so Discord
 * appends `guild_id` to the redirect — "Requires OAuth2 Code Grant" is off
 * for this app, so the bot has already joined by the time the redirect
 * happens and the `code` itself is never exchanged for anything.
 */
export function discordInstallUrl(slug: string, redirectUri: string): string {
  const clientId = process.env.AUTH_DISCORD_ID;
  if (!clientId) throw new DiscordBotError('AUTH_DISCORD_ID is not configured.');

  const params = new URLSearchParams({
    client_id: clientId,
    permissions: process.env.DISCORD_BOT_PERMISSIONS ?? '0',
    scope: 'bot',
    redirect_uri: redirectUri,
    response_type: 'code',
    state: slug,
  });

  return `https://discord.com/oauth2/authorize?${params}`;
}
