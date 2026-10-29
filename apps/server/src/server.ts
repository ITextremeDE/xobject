import Fastify from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z, ZodError } from 'zod';
import { connect } from './database.js';
import { createAuth } from './auth.js';
import { AppError, Application, schemas, type Operation } from './domain.js';

export type Config = { databaseURL: string; authSecret: string; baseURL: string };

export function buildServer(config: Config) {
  const { db, pool } = connect(config.databaseURL);
  const auth = createAuth(pool, config.authSecret, config.baseURL);
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
    logger: { level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    bodyLimit: 1024 * 1024,
  });
  const application = new Application(db);
  const base = new URL(config.baseURL);
  app.addHook('onClose', async () => { await db.destroy(); });
  app.addHook('onRequest', async (request) => {
    if (request.headers.host !== base.host) throw new AppError(400, 'Unexpected Host');
    const origin = request.headers.origin;
    if (origin && origin !== base.origin) throw new AppError(403, 'Unexpected Origin');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.message });
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid input', issues: error.issues });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'Invalid request' });
    // Do not log database statements/parameters, record contents or authentication bodies.
    request.log.error({ code: (error as { code?: string }).code ?? 'INTERNAL' }, 'Request failed');
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.route({
    method: ['GET', 'POST'], url: '/api/auth/*',
    handler: async (request, reply) => {
      const response = await auth.handler(new Request(new URL(request.url, base), {
        method: request.method, headers: fromNodeHeaders(request.headers),
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') reply.header(key, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });

  // Custom header + JSON + same-origin policy protect cookie-authenticated mutations.
  const authenticate = async (headers: Record<string, string | string[] | undefined>) => {
    if (headers['x-xobject-request'] !== '1') throw new AppError(400, 'X-XObject-Request: 1 is required');
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) throw new AppError(401, 'Authentication required');
    return session.user.id;
  };

  for (const operation of Object.keys(schemas) as Operation[]) {
    app.post(`/api/v1/${operation}`, {
      schema: { body: z.toJSONSchema(schemas[operation], { target: 'draft-7', io: 'input' }) },
    }, async (request) => application.execute(operation, request.body, await authenticate(request.headers)));
  }

  app.post('/mcp', async (request, reply) => {
    const userId = await authenticate(request.headers);
    const server = new McpServer({ name: 'xobject-spike', version: '0.0.0' });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true,
    });
    for (const operation of Object.keys(schemas) as Operation[]) {
      server.registerTool(operation, {
        description: `Experimental xObject operation: ${operation}`,
        inputSchema: schemas[operation],
        annotations: { readOnlyHint: operation.startsWith('get_') || operation.startsWith('list_'), openWorldHint: false },
      }, async (input: unknown) => {
        try {
          const result = await application.execute(operation, input, userId);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (error) {
          const message = error instanceof AppError || error instanceof ZodError ? error.message : 'Internal server error';
          return { isError: true, content: [{ type: 'text' as const, text: message }] };
        }
      });
    }
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(new Request(new URL(request.url, base), {
        method: 'POST', headers: fromNodeHeaders(request.headers), body: JSON.stringify(request.body),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(await response.text());
    } finally { await server.close(); }
  });
  app.route({ method: ['GET', 'DELETE'], url: '/mcp', handler: async (_request, reply) => {
    return reply.header('allow', 'POST').code(405).send({ error: 'Only stateless POST requests are supported' });
  } });
  return { app, db, auth };
}
