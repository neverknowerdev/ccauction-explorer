import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Connection string from environment (same as run-migrations.sh)
const connectionString = process.env.DB_CONNECTION_STRING;

if (!connectionString) {
  throw new Error('DB_CONNECTION_STRING environment variable is not set');
}

// Create postgres client
const client = postgres(connectionString);

// Enable full SQL query logging when DRIZZLE_LOG_QUERIES=true
const logQueries = process.env.DRIZZLE_LOG_QUERIES === 'true';

// Create drizzle instance with schema
export const db = drizzle(client, {
  schema,
  logger: logQueries,
});

// Re-export schema for convenience
export * from './schema';

// Re-export query utilities
export * from './queries';
