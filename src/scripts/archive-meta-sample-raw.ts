import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { asc, gt, sql } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { metaSampleMatches } from '@/db/schema';

const PAGE_SIZE = 100;

interface ArchiveManifest {
  format: 'gapdiff-meta-sample-raw/v1';
  createdAt: string;
  records: number;
  sha256: string;
  source: { table: 'meta_sample_matches'; rawColumn: 'raw' };
}

function outputPath(): string {
  const supplied = process.argv.slice(2).find((arg) => arg.startsWith('--output='));
  if (supplied) return path.resolve(supplied.slice('--output='.length));
  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+/, '');
  return path.resolve('archives', `meta-sample-raw-${stamp}.jsonl.gz`);
}

async function main() {
  const verify = process.argv.slice(2).find((arg) => arg.startsWith('--verify='));
  if (verify) {
    await verifyArchive(path.resolve(verify.slice('--verify='.length)));
    return;
  }

  const output = outputPath();
  const manifestPath = `${output}.manifest.json`;
  if (existsSync(output) || existsSync(manifestPath)) {
    throw new Error(`Archive already exists: ${output}. Choose another --output path.`);
  }

  await mkdir(path.dirname(output), { recursive: true });
  const gzip = createGzip({ level: 9 });
  const destination = createWriteStream(output, { flags: 'wx' });
  gzip.pipe(destination);

  const digest = createHash('sha256');
  let records = 0;
  let cursor: string | null = null;

  try {
    while (true) {
      const rows = await db
        .select()
        .from(metaSampleMatches)
        .where(cursor ? gt(metaSampleMatches.matchId, cursor) : sql`true`)
        .orderBy(asc(metaSampleMatches.matchId))
        .limit(PAGE_SIZE);
      if (rows.length === 0) break;

      for (const row of rows) {
        const line = `${JSON.stringify(row)}\n`;
        digest.update(line);
        if (!gzip.write(line)) await new Promise<void>((resolve) => gzip.once('drain', resolve));
        records++;
      }
      cursor = rows.at(-1)!.matchId;
      console.log(`Archived ${records} public-meta matches...`);
    }

    gzip.end();
    await finished(destination);
  } catch (error) {
    gzip.destroy();
    destination.destroy();
    throw error;
  }

  const manifest: ArchiveManifest = {
    format: 'gapdiff-meta-sample-raw/v1',
    createdAt: new Date().toISOString(),
    records,
    sha256: digest.digest('hex'),
    source: { table: 'meta_sample_matches', rawColumn: 'raw' },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Archive verified: ${records} records, SHA-256 ${manifest.sha256}`);
  console.log(`Archive: ${output}`);
  console.log(`Manifest: ${manifestPath}`);
}

async function verifyArchive(output: string) {
  const manifestPath = `${output}.manifest.json`;
  if (!existsSync(output) || !existsSync(manifestPath)) {
    throw new Error(`Archive and manifest are both required: ${output}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ArchiveManifest;
  if (manifest.format !== 'gapdiff-meta-sample-raw/v1') throw new Error(`Unsupported archive format: ${manifest.format}`);

  const digest = createHash('sha256');
  let records = 0;
  const input = createReadStream(output).pipe(createGunzip());
  for await (const chunk of input) {
    const bytes = chunk as Buffer;
    digest.update(bytes);
    for (const byte of bytes) if (byte === 10) records++;
  }
  const actualHash = digest.digest('hex');
  if (records !== manifest.records || actualHash !== manifest.sha256) {
    throw new Error(`Archive verification failed: expected ${manifest.records}/${manifest.sha256}, got ${records}/${actualHash}`);
  }
  console.log(`Archive verified: ${records} records, SHA-256 ${actualHash}`);
}

void runScript(main);
