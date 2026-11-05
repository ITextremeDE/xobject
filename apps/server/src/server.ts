import {apiError} from './errors.js';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {authenticateCredential} from './api-credentials.js';
import {API_VERSION} from '@xobject/contracts';
import Fastify from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z, ZodError } from 'zod';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connect,assertCurrentSchema } from './database.js';
import { createAuth } from './auth.js';
import { AppError, Application, schemas, type Operation } from './domain.js';

export type Config = { databaseURL: string; authSecret: string; baseURL: string };

export function buildServer(config: Config) {
  const { db, pool } = connect(config.databaseURL);
  const auth = createAuth(pool, config.authSecret, config.baseURL);
  const apiDocument=JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@xobject/contracts/openapi'),'utf8'));
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
    logger: { serializers:{req:(request)=>({method:request.method,url:(request.url??'').split('?')[0],hostname:request.hostname,remoteAddress:request.ip})},level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    bodyLimit: 1024 * 1024,
  });
  app.addHook('onReady',()=>assertCurrentSchema(pool));
  const application = new Application(db);
  const base = new URL(config.baseURL);
  app.addHook('onClose', async () => { await db.destroy(); });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/mcp')) reply.header('Cache-Control', 'no-store');
    if (request.headers.host !== base.host) throw new AppError(400, 'Unexpected Host');
    if(request.url.startsWith('/api/v1/')||request.url.startsWith('/mcp')){reply.header('X-XObject-API-Version',API_VERSION);const version=request.headers['x-xobject-api-version'];if(version&&version!=='1')throw new AppError(400,'Unsupported API major version');}
    const origin = request.headers.origin;
    if (origin && origin !== base.origin) throw new AppError(403, 'Unexpected Origin');
  });
  app.setErrorHandler((error, request, reply) => {
    if(error instanceof AppError&&error.status===401&&request.headers.authorization)reply.header('WWW-Authenticate','Bearer realm="xObject API v1", error="invalid_token"');
    if (error instanceof AppError) return reply.code(error.status).send(apiError(error));
    if (error instanceof ZodError) return reply.code(400).send(apiError(error));
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'Invalid request',code:status===429?'rate_limited':'invalid_input' });
    // Do not log database statements/parameters, record contents or authentication bodies.
    request.log.error({ code: (error as { code?: string }).code ?? 'INTERNAL' }, 'Request failed');
    return reply.code(500).send({ error: 'Internal server error',code:'internal_error' });
  });

  app.route({
    method: ['GET', 'POST'], url: '/api/auth/*',
    handler: async (request, reply) => {
      // Security/profile mutations use the common journaled API/MCP operations, not alternate auth routes.
      const authPath = new URL(request.url, base).pathname.replace(/\/+$/, '');
      if (!['/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session'].includes(authPath)) throw new AppError(404, 'Not found');
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
  const authenticate = async (headers: Record<string, string | string[] | undefined>,channel:'api'|'mcp'='api',csrf=true) => {
    if(headers.authorization){if(typeof headers.authorization!=='string'||headers.cookie)throw new AppError(401,'Use a single authentication method');return authenticateCredential(db,headers.authorization,channel);}
    if (csrf&&headers['x-xobject-request'] !== '1') throw new AppError(400, 'X-XObject-Request: 1 is required');
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) throw new AppError(401, 'Authentication required');
    if(!(await pool.query('SELECT 1 FROM sys_users WHERE id=$1 AND active',[session.user.id])).rows.length)throw new AppError(401,'Authentication required');
    return { userId: session.user.id, sessionId: session.session.id,channel:channel==='mcp'?'mcp' as const:'web' as const };
  };

  app.get('/api/v1/openapi.json',async(request)=>{await authenticate(request.headers,'api',false);return apiDocument;});
  app.get('/api/v1/contract',async(request)=>{await authenticate(request.headers,'api',false);return {apiVersion:API_VERSION,majorVersion:1,openapi:'/api/v1/openapi.json',components:apiDocument.components,operations:Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,{method:'POST',path:`/api/v1/${name}`,inputSchema:z.toJSONSchema(schema,{target:'draft-7',io:'input'}),outputSchema:apiDocument.paths[`/api/v1/${name}`].post.responses['200'].content['application/json'].schema}])),errors:{shape:{error:'string',details:'optional structured code/fieldId/context',issues:'optional input-validation issues'},statuses:[400,401,403,404,409,429,500]}};});

  for (const operation of Object.keys(schemas) as Operation[]) {
    app.post(`/api/v1/${operation}`, {
      schema: { body: z.toJSONSchema(schemas[operation], { target: 'draft-7', io: 'input' }) },
    }, async (request) => {
      const context = await authenticate(request.headers);
      return application.execute(operation, request.body, context.userId, context);
    });
  }

  app.post('/mcp', async (request, reply) => {
    const context = await authenticate(request.headers,'mcp');
    const server = new McpServer({ name: 'xobject', version: API_VERSION });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true,
    });
    server.registerResource('api-v1-contract','xobject://api/v1/openapi',{mimeType:'application/json',description:'Versioned input/output schemas for all xObject operations.'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(apiDocument)}]}));
    for (const operation of Object.keys(schemas) as Operation[]) {
      server.registerTool(operation, {
        description: `xObject API v1 operation: ${operation}`,
        inputSchema: schemas[operation],
        annotations: { readOnlyHint: operation.startsWith('get_') || operation.startsWith('list_') || operation.startsWith('search_'), destructiveHint:['permanently_delete_record','recycle_record','revoke_api_credential','revoke_all_api_credentials','set_definition_state'].includes(operation),openWorldHint: false },
      }, async (input: unknown) => {
        try {
          const result = await application.execute(operation, input, context.userId, context);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (error) {
          return {isError:true,content:[{type:'text' as const,text:JSON.stringify(apiError(error))}]};
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
    return reply.header('allow', 'POST').code(405).send({ error: 'Only stateless POST requests are supported',code:'method_not_allowed' });
  } });
  // One origin for web and auth: no cross-origin proxy or exposed credentials.
  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot, prefix: '/', index: ['index.html'] });
    app.setNotFoundHandler((request, reply) => {
      const pathname = new URL(request.url, base).pathname;
      // Only application document routes fall back to the shell. Missing API/MCP/assets stay 404.
      const documentRoute = !/^\/(?:api|mcp|assets)(?:\/|$)/i.test(pathname) && !pathname.includes('.');
      if (request.method === 'GET' && request.headers.accept?.includes('text/html') && documentRoute) {
        return reply.header('Cache-Control', 'no-store').sendFile('index.html', { cacheControl: false });
      }
      return reply.code(404).send({ error: 'Not found',code:'not_found' });
    });

  }
  return { app, db, auth };
}
