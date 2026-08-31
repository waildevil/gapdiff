import { RiotApiError } from './client';

export interface RiotProblem {
  title: string;
  body: string;
  hint?: string;
}

/**
 * Converts Riot's transport errors into safe, useful copy for people using the
 * site. Raw API response bodies often contain implementation detail and are
 * never suitable for a visitor-facing message.
 */
export function riotProblem(error: unknown): RiotProblem | null {
  if (!(error instanceof RiotApiError)) return null;

  if (error.status === 401 || error.status === 403) {
    return {
      title: 'Player data is unavailable',
      body: 'We couldn\'t refresh player data right now.',
      hint: 'Please try again later.',
    };
  }

  if (error.status === 429) {
    return {
      title: 'Riot is busy',
      body: 'We\'ve reached Riot\'s temporary request limit.',
      hint: 'Wait a minute, then try again.',
    };
  }

  if (error.status === 0 || error.status >= 500) {
    return {
      title: 'Riot is temporarily unavailable',
      body: 'Player data could not be refreshed right now.',
      hint: 'Try again in a moment.',
    };
  }

  return null;
}
