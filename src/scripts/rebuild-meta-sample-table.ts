import 'dotenv/config';
import postgres from 'postgres';

const foreignKeys = [
  { table: 'meta_match_cohorts', name: 'meta_match_cohorts_match_id_meta_sample_matches_match_id_fk' },
  { table: 'meta_champion_observations', name: 'meta_champion_observations_match_id_meta_sample_matches_match_i' },
  { table: 'meta_champion_bans', name: 'meta_champion_bans_match_id_meta_sample_matches_match_id_fk' },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to rebuild hosted storage.');
  const client = postgres(url, { max: 1 });
  try {
    const before = await client<{ bytes: string }[]>`SELECT pg_total_relation_size('meta_sample_matches') AS bytes`;
    await client.begin(async (tx) => {
      const existing = await tx<{ table: string }[]>`
        SELECT table_name AS table
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'meta_sample_matches_compact'
      `;
      if (existing.length) throw new Error('meta_sample_matches_compact already exists; inspect it before retrying.');

      const expectedKeys = new Set<string>(foreignKeys.map((key) => key.name));
      const actualKeys = await tx<{ conname: string }[]>`
        SELECT conname
        FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'meta_sample_matches'::regclass
      `;
      if (actualKeys.length !== foreignKeys.length || actualKeys.some((key) => !expectedKeys.has(key.conname))) {
        throw new Error(`Unexpected foreign keys on meta_sample_matches: ${actualKeys.map((key) => key.conname).join(', ')}`);
      }

      const source = await tx<{ records: number }[]>`SELECT count(*)::int AS records FROM meta_sample_matches`;
      await tx.unsafe(`
        CREATE TABLE meta_sample_matches_compact (
          match_id varchar(32) PRIMARY KEY,
          platform varchar(8) NOT NULL,
          region varchar(12) NOT NULL,
          queue_id integer NOT NULL,
          patch varchar(32) NOT NULL,
          game_creation timestamptz NOT NULL,
          collected_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await tx.unsafe(`
        CREATE INDEX meta_sample_matches_compact_filter_idx
        ON meta_sample_matches_compact (region, queue_id, patch, game_creation)
      `);
      await tx.unsafe(`
        INSERT INTO meta_sample_matches_compact
          (match_id, platform, region, queue_id, patch, game_creation, collected_at)
        SELECT match_id, platform, region, queue_id, patch, game_creation, collected_at
        FROM meta_sample_matches
      `);
      const copied = await tx<{ records: number }[]>`SELECT count(*)::int AS records FROM meta_sample_matches_compact`;
      if (copied[0]?.records !== source[0]?.records) {
        throw new Error(`Copy mismatch: source ${source[0]?.records ?? 0}, replacement ${copied[0]?.records ?? 0}.`);
      }

      for (const key of foreignKeys) await tx.unsafe(`ALTER TABLE ${key.table} DROP CONSTRAINT ${key.name}`);
      await tx.unsafe('DROP TABLE meta_sample_matches');
      await tx.unsafe('ALTER TABLE meta_sample_matches_compact RENAME TO meta_sample_matches');
      await tx.unsafe('ALTER INDEX meta_sample_matches_compact_pkey RENAME TO meta_sample_matches_pkey');
      await tx.unsafe('ALTER INDEX meta_sample_matches_compact_filter_idx RENAME TO meta_matches_filter_idx');
      await tx.unsafe(`
        ALTER TABLE meta_match_cohorts
        ADD CONSTRAINT meta_match_cohorts_match_id_meta_sample_matches_match_id_fk
        FOREIGN KEY (match_id) REFERENCES meta_sample_matches(match_id) ON DELETE CASCADE
      `);
      await tx.unsafe(`
        ALTER TABLE meta_champion_observations
        ADD CONSTRAINT meta_champion_observations_match_id_meta_sample_matches_match_i
        FOREIGN KEY (match_id) REFERENCES meta_sample_matches(match_id) ON DELETE CASCADE
      `);
      await tx.unsafe(`
        ALTER TABLE meta_champion_bans
        ADD CONSTRAINT meta_champion_bans_match_id_meta_sample_matches_match_id_fk
        FOREIGN KEY (match_id) REFERENCES meta_sample_matches(match_id) ON DELETE CASCADE
      `);
      console.log(`Copied and atomically swapped ${copied[0]?.records ?? 0} compact public-meta matches.`);
    });
    const after = await client<{ bytes: string }[]>`SELECT pg_total_relation_size('meta_sample_matches') AS bytes`;
    console.log(`meta_sample_matches: ${Number(before[0]?.bytes ?? 0) / 1024 / 1024} MB -> ${Number(after[0]?.bytes ?? 0) / 1024 / 1024} MB.`);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
