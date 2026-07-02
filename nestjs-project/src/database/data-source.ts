import 'dotenv/config';
import { DataSource } from 'typeorm';
import databaseConfig from '../config/database.config';

const dbConfig = databaseConfig();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.name,
  synchronize: false,
  // __dirname-relative (not CWD-relative) so this resolves correctly both in
  // dev (ts-node, running from src/) and in the compiled production build
  // (node, running from dist/) — a CWD-relative 'src/...' glob only ever
  // matches in dev, silently finding zero migrations in production.
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  entities: ['src/**/*.entity.ts'],
});
