import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Only `drizzle-kit generate` runs from this config, and generating SQL from the
 * schema needs no connection — so a missing DATABASE_URL is fine here. Applying
 * migrations goes through `npm run db:migrate`, which picks the right driver.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unused' },
  verbose: true,
  strict: true,
});
