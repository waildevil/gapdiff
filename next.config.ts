import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks the module.
  serverExternalPackages: ['@electric-sql/pglite'],
  images: {
    // Champion, item and rune art comes from Riot's CDNs. Both are free and
    // versioned by patch — never self-host these.
    remotePatterns: [
      { protocol: 'https', hostname: 'ddragon.leagueoflegends.com' },
      { protocol: 'https', hostname: 'raw.communitydragon.org' },
    ],
  },
};

export default config;
