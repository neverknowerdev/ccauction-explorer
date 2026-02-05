/**
 * Load env from .env.local if the file exists, then use process.env.
 * Variables from .env.local take precedence; any not in .env.local come from process.env.
 * Import this first in scripts that need DB_CONNECTION_STRING or other env (e.g. before importing lib/db).
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envLocalPath = resolve(process.cwd(), '.env.local');

if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}
