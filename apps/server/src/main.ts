import { buildServer } from './server.js';
import { configFromEnvironment } from './config.js';

const config = configFromEnvironment();
const { app } = buildServer(config);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}
await app.listen({ host: config.listenHost??'127.0.0.1', port: config.listenPort??4100 });
