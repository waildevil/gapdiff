import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { authAccounts, authSessions, authVerificationTokens, users } from '@/db/schema';

/**
 * Discord sign-in.
 *
 * Discord rather than Riot Sign On deliberately: RSO needs a separate approval
 * from Riot, and it answers a question we don't need answered here. Signing in
 * establishes *who owns a group*; proving you own a Riot account is a separate
 * step handled by the profile-icon challenge.
 *
 * Sessions live in the database rather than a JWT, so revoking access is a
 * delete rather than waiting for a token to expire.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // `db` is typed as the driver-agnostic PgDatabase so callers don't care which
  // backend is underneath; the adapter wants a concrete driver type. The two are
  // structurally identical for everything the adapter touches.
  adapter: DrizzleAdapter(db as unknown as PostgresJsDatabase<typeof schema>, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [Discord],
  session: { strategy: 'database' },
  callbacks: {
    session({ session, user }) {
      // The adapter's default session omits the id, and everything downstream
      // keys off it.
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
});
