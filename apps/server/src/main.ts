import { buildServer } from './server.js';
import { configFromEnvironment } from './config.js';

const config = configFromEnvironment();
const url = new URL(config.baseURL);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
  throw new Error('The technical spike supports HTTP on loopback only');
}
const { app } = buildServer(config);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}
await app.listen({ host: '127.0.0.1', port: Number(url.port || 80) });
