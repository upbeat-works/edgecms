import { applyD1Migrations, env } from 'cloudflare:test';

// Applied once per worker. Individual tests reset table contents themselves via
// `resetDb()` so they stay independent without paying for re-migration.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
