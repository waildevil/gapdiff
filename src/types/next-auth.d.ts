import type { DefaultSession } from 'next-auth';

/**
 * Auth.js omits the user id from the default session shape, but the callback in
 * src/auth.ts puts it back and everything downstream keys off it.
 */
declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}
