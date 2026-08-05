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
  /**
   * The group's Discord webhook, encrypted with SECRET_KEY.
   *
   * Never stored in the clear: the token in a webhook URL lets anybody post to
   * that channel as anybody, so a database dump should yield ciphertext rather
   * than a working credential. Replaces an earlier plaintext column of the same
   * purpose that was declared but never used.
   */
  discordWebhook: text('discord_webhook'),
  /** Masked form, e.g. "…/webhooks/123/••••", so the UI never decrypts to render. */
  discordWebhookHint: text('discord_webhook_hint'),
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
 * Every Riot ID we have ever seen in a match, whether tracked or not.
 *
 * Riot has no search endpoint — ACCOUNT-V1 needs an exact name *and* tag — so
 * "type anvil, see the matching players" can only be answered from an index we
 * build ourselves. We already store all ten participants of every match, so
 * this is thousands of real players for free.
 *
 * Separate from `accounts`, which means "an account we actively track" and
 * carries claims, rank history and sync state. Mixing five thousand strangers
 * into that table would blur what it means.
 */
export const knownPlayers = pgTable(
  'known_players',
  {
    puuid: varchar('puuid', { length: 78 }).primaryKey(),
    gameName: text('game_name').notNull(),
    tagLine: varchar('tag_line', { length: 8 }).notNull(),
    platform: varchar('platform', { length: 8 }).notNull(),
    /** How often we've seen them. Doubles as a relevance ranking. */
    gamesSeen: integer('games_seen').notNull().default(1),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('known_players_name_idx').on(table.gameName),
    index('known_players_seen_idx').on(table.gamesSeen),
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
  /**
   * Set when a fresh claim needs to show up on the leaderboard before the
   * nightly backfill would otherwise reach it. The priority-sync workflow
   * drains this on a short cycle with a cheap recent-only window, then clears
   * it; the full season backfill still happens later on the normal path.
   */
  priorityRequestedAt: timestamp('priority_requested_at', { withTimezone: true }),
});

/**
 * A friendly race: pick your own Riot account, challenge 1-3 people to a
 * ranked-LP climb, they accept or decline.
 *
 * Not scoped to one `group_id` — a challenge can cross groups, since the whole
 * point is searching for anyone tracked anywhere in the app, not just your own
 * board. `code` is the public, unguessable id a duel is viewable by, same as an
 * invite, because bragging rights only work if you can send the result to
 * someone who isn't a group member.
 */
export const duels = pgTable(
  'duels',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 32 }).notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull().defaultNow(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Set the first time anybody views this duel after `endAt` has passed.
     * Before that, "current rank" is read live; after, it's frozen to whatever
     * each racer's end-snapshot says — otherwise an "ended" duel would keep
     * drifting every time someone opened the link months later.
     */
    settledAt: timestamp('settled_at', { withTimezone: true }),
    /** Null when there was no clear winner — a tie, or nobody else accepted. */
    winnerPuuid: varchar('winner_puuid', { length: 78 }).references(() => accounts.puuid, {
      onDelete: 'set null',
    }),
  },
  (table) => [index('duels_created_by_idx').on(table.createdBy)],
);

/**
 * One racer's starting line, ranked-solo only — that's the ladder people mean
 * by "climbing". Null rank fields mean unranked at the start, so the climb is
 * measured from zero rather than blocking the racer from entering.
 *
 * `invitedUserId` is the verified owner of `puuid` — whoever must accept or
 * decline before this racer's numbers are shown. The creator's own row is
 * inserted pre-accepted, since challenging yourself needs no consent.
 *
 * The `end*` columns are that racer's frozen finish line, filled in once at
 * settlement — see `duels.settledAt`.
 */
export const duelParticipants = pgTable(
  'duel_participants',
  {
    duelId: integer('duel_id')
      .notNull()
      .references(() => duels.id, { onDelete: 'cascade' }),
    puuid: varchar('puuid', { length: 78 })
      .notNull()
      .references(() => accounts.puuid, { onDelete: 'cascade' }),
    invitedUserId: text('invited_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'pending' | 'accepted' | 'declined' */
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    startTier: varchar('start_tier', { length: 16 }),
    startDivision: varchar('start_division', { length: 4 }),
    startLeaguePoints: integer('start_league_points'),
    endTier: varchar('end_tier', { length: 16 }),
    endDivision: varchar('end_division', { length: 4 }),
    endLeaguePoints: integer('end_league_points'),
  },
  (table) => [
    primaryKey({ columns: [table.duelId, table.puuid] }),
    index('duel_participants_invited_idx').on(table.invitedUserId),
  ],
);

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

export const duelsRelations = relations(duels, ({ many }) => ({
  participants: many(duelParticipants),
}));

/**
 * A friend request, directional until accepted. `requesterId` sent it;
 * `addresseeId` has to say yes. Kept as one row rather than two symmetric
 * ones so "who asked whom" survives after acceptance — useful context, and
 * free once the row already exists.
 */
export const friendships = pgTable(
  'friendships',
  {
    id: serial('id').primaryKey(),
    requesterId: text('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'pending' | 'accepted' | 'declined' */
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('friendships_pair_idx').on(table.requesterId, table.addresseeId),
    index('friendships_addressee_idx').on(table.addresseeId),
  ],
);

/**
 * One person cutting another off — from friend requests, duel challenges,
 * and messages, all at once. Deliberately effective in both directions (see
 * `isBlocked` in lib/friends.ts): the point is spam stops, not who gets to
 * feel like they won the block.
 */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] })],
);

/**
 * A message, either a direct one (`recipientId` set) or posted to a group's
 * shared chat (`groupId` set) — exactly one of the two, enforced in
 * `lib/messages.ts` rather than as a DB constraint. Friends-only for DMs,
 * membership-only for group chat; both checked at write time rather than
 * schema-level, because a blocked-and-later-unblocked pair (or someone who
 * left a group) should still be able to see history that predates it.
 */
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: text('recipient_id').references(() => users.id, { onDelete: 'cascade' }),
    groupId: integer('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** DMs only — group chat unread is tracked per-user in `group_chat_reads` instead. */
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    index('messages_sender_idx').on(table.senderId, table.createdAt),
    index('messages_recipient_idx').on(table.recipientId, table.createdAt),
    index('messages_group_idx').on(table.groupId, table.createdAt),
  ],
);

/** How far into a group's chat each member has read — a group message has no single recipient. */
export const groupChatReads = pgTable(
  'group_chat_reads',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(users, { fields: [friendships.requesterId], references: [users.id] }),
  addressee: one(users, { fields: [friendships.addresseeId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  recipient: one(users, { fields: [messages.recipientId], references: [users.id] }),
  group: one(groups, { fields: [messages.groupId], references: [groups.id] }),
}));

export const duelParticipantsRelations = relations(duelParticipants, ({ one }) => ({
  duel: one(duels, { fields: [duelParticipants.duelId], references: [duels.id] }),
  account: one(accounts, { fields: [duelParticipants.puuid], references: [accounts.puuid] }),
}));
