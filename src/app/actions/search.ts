'use server';

import { suggestPlayers, type PlayerSuggestion } from '@/lib/playerIndex';

/**
 * Autocomplete for the search box. Reads our own index, because Riot has no
 * endpoint that takes a partial name.
 */
export async function searchPlayers(query: string): Promise<PlayerSuggestion[]> {
  try {
    return await suggestPlayers(query);
  } catch {
    // A failing suggestion must never block typing a full Riot ID by hand.
    return [];
  }
}
