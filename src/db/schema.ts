import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Everything is keyed on `group_id` from day one. The friend group is group 1.
 *
 * Going public later means groups become optional and profile pages read these
 * same tables standalone — no migration required. That is the whole reason the
 * indirection exists this early.
 */

// --- identity (Auth.js) ---------------------------------------------------

/**
 * Auth.js owns these four tables. They carry an `auth_` prefix because its
 * `accounts` table means "OAuth provider link", while ours means "Riot account"
 * — two very different things that would otherwise collide on one name.
 */
export const users = pgTable('auth_users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgTable(
  'auth_accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const authSessions = pgTable('auth_sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const authVerificationTokens = pgTable(
  'auth_verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

// --- groups ---------------------------------------------------------------

export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: text('name').notNull(),
  /** Private groups are only reachable with an invite. */
  isPrivate: boolean('is_private').notNull().default(true),
  /** Null for groups seeded from config before authentication existed. */
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  discordWebhookUrl: text('discord_webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** People who have joined a group. Distinct from the accounts it tracks. */
export const groupMemberships = pgTable(
  'group_memberships',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

/**
 * A person asserting they own a Riot account, and whether they proved it.
 *
 * Deliberately global rather than per-group: verifying once should be enough,
 * whichever group you join next. One person may claim several accounts, because
 * smurfs are normal.
 */
export const accountClaims = pgTable(
  'account_claims',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    puuid: varchar('puuid', { length: 78 })
      .notNull()
      .references(() => accounts.puuid, { onDelete: 'cascade' }),
    /** Null means self-declared but unproven. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** How it was proven, e.g. 'profile-icon'. */
    verifiedVia: varchar('verified_via', { length: 24 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.puuid] })],
);

/**
 * A pending "set your profile icon to this" challenge.
 *
 * The icon asked for must differ from the one currently set, otherwise the
 * challenge could be passed by doing nothing. Single use, and short-lived so a
 * screenshot of it is worthless.
 */
export const iconChallenges = pgTable(
  'icon_challenges',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    puuid: varchar('puuid', { length: 78 }).notNull(),
    requestedIconId: integer('requested_icon_id').notNull(),
    previousIconId: integer('previous_icon_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('icon_challenges_user_idx').on(table.userId, table.puuid)],
);

/** Shareable join links. Revocable, expiring, and usage-capped. */
export const invites = pgTable(
  'invites',
  {
    code: varchar('code', { length: 32 }).primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Null means unlimited. */
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invites_group_idx').on(table.groupId)],
);

/** One row per Riot account we track. PUUID is the universal key. */
export const accounts = pgTable(
  'accounts',
  {
    puuid: varchar('puuid', { length: 78 }).primaryKey(),
    gameName: text('game_name').notNull(),
    tagLine: varchar('tag_line', { length: 8 }).notNull(),
    platform: varchar('platform', { length: 8 }).notNull(),
    summonerId: text('summoner_id'),
    profileIconId: integer('profile_icon_id'),
    summonerLevel: integer('summoner_level'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('accounts_riot_id_idx').on(table.gameName, table.tagLine, table.platform),
  ],
);

/**
 * The Riot accounts a group shows on its leaderboard.
 *
 * Separate from `group_memberships` on purpose: a person can track several
 * accounts, and an account can be tracked without anyone having claimed it —
 * which is how someone who no longer plays, or won't sign in, stays on the board.
 */
export const trackedAccounts = pgTable(
  'tracked_accounts',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    puuid: varchar('puuid', { length: 78 })
      .notNull()
      .references(() => accounts.puuid, { onDelete: 'cascade' }),
    /** Manual override; when set it wins over the earned title. */
    nickname: text('nickname'),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.puuid] })],
);

/**
 * Raw match payload plus the columns worth querying. Keeping the raw JSON means
 * derived stats can be recomputed after a formula change without re-fetching
 * anything — re-fetching is the expensive thing, disk is not.
 */
export const matches = pgTable(
  'matches',
  {
    matchId: varchar('match_id', { length: 32 }).primaryKey(),
    platform: varchar('platform', { length: 8 }).notNull(),
    queueId: integer('queue_id').notNull(),
    gameMode: varchar('game_mode', { length: 32 }).notNull(),
    gameVersion: varchar('game_version', { length: 32 }).notNull(),
    gameCreation: timestamp('game_creation', { withTimezone: true }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    /** False for remakes and early surrenders, which carry no signal. */
    scorable: boolean('scorable').notNull().default(true),
    raw: jsonb('raw').notNull(),
    timeline: jsonb('timeline'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('matches_game_creation_idx').on(table.gameCreation)],
);

/** The denormalised per-player row that every stats query actually reads. */
export const matchParticipants = pgTable(
  'match_participants',
  {
    matchId: varchar('match_id', { length: 32 })
      .notNull()
      .references(() => matches.matchId, { onDelete: 'cascade' }),
    puuid: varchar('puuid', { length: 78 }).notNull(),
    participantId: integer('participant_id').notNull(),
    teamId: integer('team_id').notNull(),
    win: boolean('win').notNull(),

    championId: integer('champion_id').notNull(),
    championName: varchar('champion_name', { length: 32 }).notNull(),
    role: varchar('role', { length: 16 }).notNull(),

    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    assists: integer('assists').notNull(),

    killParticipation: real('kill_participation').notNull(),
    deathShare: real('death_share').notNull(),
    damageShare: real('damage_share').notNull(),
    goldShare: real('gold_share').notNull(),
    damageTakenShare: real('damage_taken_share').notNull(),
    objectiveDamageShare: real('objective_damage_share').notNull(),
    csPerMin: real('cs_per_min').notNull(),
    visionPerMin: real('vision_per_min').notNull(),

    visionScore: integer('vision_score').notNull(),
    wardsPlaced: integer('wards_placed').notNull(),
    controlWards: integer('control_wards').notNull(),
    soloKills: integer('solo_kills').notNull().default(0),

    /** 0-100 performance score for this game. */
    performanceScore: doublePrecision('performance_score'),
    /** Pre-squash composite, kept for debugging and lane-delta display. */
    performanceRaw: doublePrecision('performance_raw'),
    /** Same composite for the direct lane opponent, when there was one. */
    opponentRaw: doublePrecision('opponent_raw'),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.puuid] }),
    index('participants_puuid_idx').on(table.puuid),
    index('participants_champion_idx').on(table.championId),
  ],
);

/** Rank over time, so the leaderboard can show climbs rather than just position. */
export const rankSnapshots = pgTable(
  'rank_snapshots',
  {
    id: serial('id').primaryKey(),
    puuid: varchar('puuid', { length: 78 })
      .notNull()
      .references(() => accounts.puuid, { onDelete: 'cascade' }),
    queueType: varchar('queue_type', { length: 24 }).notNull(),
    tier: varchar('tier', { length: 16 }).notNull(),
    division: varchar('division', { length: 4 }).notNull(),
    leaguePoints: integer('league_points').notNull(),
    /** Precomputed ladder position: tier * 400 + division * 100 + LP. */
    rankPoints: integer('rank_points').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('rank_snapshots_puuid_idx').on(table.puuid, table.capturedAt)],
);

/** Ingestion bookkeeping, so the worker knows where it left off per account. */
export const syncState = pgTable('sync_state', {
  puuid: varchar('puuid', { length: 78 })
    .primaryKey()
    .references(() => accounts.puuid, { onDelete: 'cascade' }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  /** How far back the backfill has reached; null until it starts. */
  backfilledThrough: timestamp('backfilled_through', { withTimezone: true }),
  backfillComplete: boolean('backfill_complete').notNull().default(false),
  lastError: text('last_error'),
});

export const groupsRelations = relations(groups, ({ many, one }) => ({
  tracked: many(trackedAccounts),
  memberships: many(groupMemberships),
  invites: many(invites),
  owner: one(users, { fields: [groups.ownerId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMemberships),
  claims: many(accountClaims),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, { fields: [groupMemberships.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMemberships.userId], references: [users.id] }),
}));

export const accountClaimsRelations = relations(accountClaims, ({ one }) => ({
  user: one(users, { fields: [accountClaims.userId], references: [users.id] }),
  account: one(accounts, { fields: [accountClaims.puuid], references: [accounts.puuid] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  group: one(groups, { fields: [invites.groupId], references: [groups.id] }),
}));

export const accountsRelations = relations(accounts, ({ many, one }) => ({
  trackedIn: many(trackedAccounts),
  claims: many(accountClaims),
  rankSnapshots: many(rankSnapshots),
  sync: one(syncState, { fields: [accounts.puuid], references: [syncState.puuid] }),
}));

export const trackedAccountsRelations = relations(trackedAccounts, ({ one }) => ({
  group: one(groups, { fields: [trackedAccounts.groupId], references: [groups.id] }),
  account: one(accounts, { fields: [trackedAccounts.puuid], references: [accounts.puuid] }),
}));

export const matchesRelations = relations(matches, ({ many }) => ({
  participants: many(matchParticipants),
}));

export const matchParticipantsRelations = relations(matchParticipants, ({ one }) => ({
  match: one(matches, {
    fields: [matchParticipants.matchId],
    references: [matches.matchId],
  }),
}));
