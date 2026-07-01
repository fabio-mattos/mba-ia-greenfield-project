import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { createTestDataSource } from '../test/create-test-data-source';

const MANAGED_TABLES = [
  'users',
  'channels',
  'refresh_tokens',
  'verification_tokens',
];

// CreateAuthTokens1777579850478 hardcodes "public".<object> for its enum
// type and indexes (migrations are immutable — cannot be edited to
// parameterize the schema). That makes a shared-schema or search_path-based
// isolation strategy unsafe: it always targets the real "public" schema,
// which already has these objects in a normally-migrated dev DB. The only
// isolation that actually avoids colliding with the shared dev database is
// a disposable database of its own, dropped again in afterAll.
const testDbName = `migrations_test_${randomUUID().replace(/-/g, '')}`;

function createAdminClient(): Client {
  return new Client({
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: 'postgres',
  });
}

describe('Database migrations (integration)', () => {
  let adminClient: Client;
  let dataSource: DataSource;

  beforeAll(async () => {
    adminClient = createAdminClient();
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${testDbName}"`);

    dataSource = createTestDataSource(
      [User, Channel, RefreshToken, VerificationToken],
      {
        synchronize: false,
        database: testDbName,
        migrations: [
          CreateUsersAndChannels1775687773260,
          CreateAuthTokens1777579850478,
        ],
      },
    );

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await adminClient.query(`DROP DATABASE "${testDbName}" WITH (FORCE)`);
    await adminClient.end();
  });

  it('should apply all migrations and create all four tables', async () => {
    const ranMigrations = await dataSource.runMigrations();

    expect(ranMigrations).toHaveLength(2);

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [MANAGED_TABLES],
    );
    const tableNames = result.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'channels',
      'refresh_tokens',
      'users',
      'verification_tokens',
    ]);
  });

  it('should revert the last migration and remove token tables', async () => {
    await dataSource.undoLastMigration();

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [['refresh_tokens', 'verification_tokens']],
    );
    expect(result).toHaveLength(0);
  });
});
