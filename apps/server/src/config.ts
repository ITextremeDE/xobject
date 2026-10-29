import { z } from 'zod';
import type { Config } from './server.js';

export function configFromEnvironment(): Config {
  const env = z.object({
    DATABASE_URL: z.url().refine(s => s.startsWith('postgres://') || s.startsWith('postgresql://')),
    BETTER_AUTH_SECRET: z.string().min(32),
    BASE_URL: z.url().default('http://127.0.0.1:4100'),
  }).parse(process.env);
  const url = new URL(env.BASE_URL);
  if (url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('BASE_URL must be an HTTP(S) origin');
  }
  return { databaseURL: env.DATABASE_URL, authSecret: env.BETTER_AUTH_SECRET, baseURL: url.origin };
}
