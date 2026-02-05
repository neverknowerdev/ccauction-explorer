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

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Re-export schema for convenience
export * from './schema';

// Re-export query utilities
export * from './queries';
