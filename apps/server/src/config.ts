import {isIP} from 'node:net';
import { z } from 'zod';
import type { Config } from './server.js';

export function configFromEnvironment(): Config {
  const env = z.object({
    DATABASE_URL: z.url().refine(s => s.startsWith('postgres://') || s.startsWith('postgresql://')),
    BETTER_AUTH_SECRET: z.string().min(32),
    LISTEN_HOST:z.enum(['127.0.0.1','localhost','0.0.0.0','::','::1']).default('127.0.0.1'),
    PORT:z.coerce.number().int().min(1).max(65535).optional(),
    TRUSTED_PROXIES:z.string().optional(),
    BASE_URL: z.url().default('http://127.0.0.1:4100'),
  }).parse(process.env);
  const url = new URL(env.BASE_URL);
  if (url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('BASE_URL must be an HTTP(S) origin');
  }
  if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('BASE_URL requires HTTPS except on loopback');
  const trustedProxies=env.TRUSTED_PROXIES?.split(',').map(value=>value.trim()).filter(Boolean);
  for(const proxy of trustedProxies??[]){const [address,mask,...extra]=proxy.split('/');const family=isIP(address);if(!family||extra.length||(mask!==undefined&&(!/^\d+$/.test(mask)||Number(mask)>(family===4?32:128))))throw new Error('TRUSTED_PROXIES must contain explicit IP addresses or CIDR ranges');}
  return { listenHost:env.LISTEN_HOST,listenPort:env.PORT??Number(url.port||4100),trustedProxies,databaseURL: env.DATABASE_URL, authSecret: env.BETTER_AUTH_SECRET, baseURL: url.origin };
}
