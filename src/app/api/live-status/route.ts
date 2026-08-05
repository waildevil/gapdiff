import { NextResponse } from 'next/server';
import { getLiveStatuses, type LivePlayerRef } from '@/lib/liveGame';
import { isPlatform } from '@/lib/riot/routing';

// A private friend group never has this many rows on one page; the cap is
// only there so a malformed body can't turn into an unbounded fan-out of
// Riot calls.
const MAX_PLAYERS = 50;

function parsePlayers(body: unknown): LivePlayerRef[] {
  if (typeof body !== 'object' || body === null || !('players' in body)) return [];
  const raw = (body as { players: unknown }).players;
  if (!Array.isArray(raw)) return [];

  const players: LivePlayerRef[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { platform, puuid } = entry as { platform?: unknown; puuid?: unknown };
    if (typeof platform === 'string' && isPlatform(platform) && typeof puuid === 'string' && puuid) {
      players.push({ platform, puuid });
    }
    if (players.length >= MAX_PLAYERS) break;
  }
  return players;
}

/** Spectator status for a batch of players — public the same way profile pages are: it's Riot's own public data, just relayed. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const players = parsePlayers(body);
  if (players.length === 0) return NextResponse.json({});

  const statuses = await getLiveStatuses(players);
  return NextResponse.json(Object.fromEntries(statuses));
}
