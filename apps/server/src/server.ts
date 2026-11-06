import {liveUpdates} from './live-updates.js';
import {browserDefaults,browserShell,webManifest} from './browser-shell.js';
import {Pool} from 'pg';
import {authenticateOAuth} from './oauth.js';
import {verifyOAuthQueryParams} from '@better-auth/oauth-provider';
import {apiError} from './errors.js';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {authenticateCredential} from './api-credentials.js';
import {API_VERSION} from '@xobject/contracts';
import Fastify from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { mcpOutputSchemas, toolMetadata } from './mcp-contract.js';
import { attachSkills } from './mcp-skills.js';
import { z, ZodError } from 'zod';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connect,assertCurrentSchema } from './database.js';
import { createAuth } from './auth.js';
import { AppError, Application, schemas, type Operation } from './domain.js';

export type Config = { databaseURL: string; authSecret: string; baseURL: string; listenHost?:string; listenPort?:number; trustedProxies?:string[]; appName?:string; appDescription?:string; browserTitleMode?:'context'|'neutral' };

export function buildServer(config: Config) {
  const { db, pool } = connect(config.databaseURL);
  const oauthGate = new Pool({connectionString:config.databaseURL,max:2,connectionTimeoutMillis:5000});
  const auth = createAuth(pool, config.authSecret, config.baseURL);
  const apiDocument=JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@xobject/contracts/openapi'),'utf8'));
  const outputSchemas = mcpOutputSchemas(apiDocument);
  const app = Fastify({
    trustProxy:config.trustedProxies??false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
    logger: { serializers:{req:(request)=>({method:request.method,url:(request.url??'').split('?')[0],hostname:request.hostname,remoteAddress:request.ip})},level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    bodyLimit: 1024 * 1024,
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => done(null, body));
  app.addHook('onReady',()=>assertCurrentSchema(pool));
  const application = new Application(db);
  const base = new URL(config.baseURL);
  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  const htmlSource=existsSync(`${webRoot}/index.html`)?readFileSync(`${webRoot}/index.html`,'utf8'):'';
  const buildId=htmlSource.match(/name="xobject-build" content="([^"]+)"/)?.[1]??'development';
  const appName=config.appName??browserDefaults.name,description=config.appDescription??browserDefaults.description;
  const shell=()=>browserShell(htmlSource,base.origin,appName,description);
  const updates=liveUpdates(config.databaseURL,application,buildId,db);
  app.addHook('preClose',()=>updates.close());
  app.addHook('onClose', async () => { await db.destroy(); if(!pool.ended)await pool.end(); await oauthGate.end(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Robots-Tag','noindex, nofollow').header('X-Content-Type-Options','nosniff').header('X-Frame-Options','DENY').header('Referrer-Policy','no-referrer').header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(base.protocol==='https:')reply.header('Strict-Transport-Security','max-age=31536000');
    reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (request.url.startsWith('/api/') || request.url.startsWith('/mcp')) reply.header('Cache-Control', 'no-store');
    if (request.headers.host !== base.host) throw new AppError(400, 'Unexpected Host');
    if(request.url.startsWith('/api/v1/')||request.url.startsWith('/mcp')){reply.header('X-XObject-API-Version',API_VERSION);const version=request.headers['x-xobject-api-version'];if(version&&version!=='1')throw new AppError(400,'Unsupported API major version');}
    const origin = request.headers.origin;
    if (origin && origin !== base.origin) throw new AppError(403, 'Unexpected Origin');
  });
  app.setErrorHandler((error, request, reply) => {
    if(error instanceof AppError&&error.status===401&&(request.headers.authorization||request.url.startsWith('/mcp')))reply.header('WWW-Authenticate',request.url.startsWith('/mcp') ? `Bearer resource_metadata="${base.origin}/.well-known/oauth-protected-resource/mcp"` : 'Bearer realm="xObject API v1", error="invalid_token"');
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
      if (!['/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session', '/api/auth/oauth2/authorize', '/api/auth/oauth2/token', '/api/auth/oauth2/revoke', '/api/auth/oauth2/consent', '/api/auth/oauth2/continue'].includes(authPath)) throw new AppError(404, 'Not found');
      const gate=authPath==='/api/auth/oauth2/token'?await oauthGate.connect():undefined;
      try {
      if(gate)await gate.query("SELECT pg_advisory_lock_shared(hashtext('xobject:model'))");
      const response = await auth.handler(new Request(new URL(request.url, base), {
        method: request.method, headers: new Headers({...Object.fromEntries(fromNodeHeaders(request.headers)), 'x-xobject-client-ip':request.ip}),
        ...(request.body !== undefined ? { body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body) } : {}),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') reply.header(key, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
      } finally {if(gate){try{await gate.query("SELECT pg_advisory_unlock_shared(hashtext('xobject:model'))");}finally{gate.release();}}}
    },
  });

  // Custom header + JSON + same-origin policy protect cookie-authenticated mutations.
  const authenticate = async (headers: Record<string, string | string[] | undefined>,channel:'api'|'mcp'='api',csrf=true) => {
    if(headers.authorization){if(typeof headers.authorization!=='string'||headers.cookie)throw new AppError(401,'Use a single authentication method');if(channel==='mcp'&&!headers.authorization.startsWith('Bearer xo1_'))return authenticateOAuth(db,headers.authorization,new URL('/mcp',base).href);return authenticateCredential(db,headers.authorization,channel);}
    if(channel==='mcp'&&!headers.cookie)throw new AppError(401,'Authentication required');
    if (csrf&&headers['x-xobject-request'] !== '1') throw new AppError(400, 'X-XObject-Request: 1 is required');
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) throw new AppError(401, 'Authentication required');
    if(!(await pool.query('SELECT 1 FROM sys_users WHERE id=$1 AND active',[session.user.id])).rows.length)throw new AppError(401,'Authentication required');
    return { userId: session.user.id, sessionId: session.session.id,channel:channel==='mcp'?'mcp' as const:'web' as const };
  };

  for (const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-authorization-server/api/auth','/api/auth/.well-known/oauth-authorization-server']) {
    app.get(path, async (request,reply) => {
      const response=await auth.handler(new Request(new URL(request.url,base),{headers:fromNodeHeaders(request.headers)}));
      reply.code(response.status); response.headers.forEach((value,key)=>reply.header(key,value));
      return reply.send(await response.text());
    });
  }
  app.post('/api/oauth/consent-context',async(request)=>{
    if(request.headers.authorization)throw new AppError(403,'Interactive session required');
    const context=await authenticate(request.headers);
    const {query}=z.object({query:z.string().min(1).max(16000)}).strict().parse(request.body);
    if(!await verifyOAuthQueryParams(query,config.authSecret))throw new AppError(400,'Invalid or expired authorization request');
    const params=new URLSearchParams(query),clientId=params.get('client_id');
    const client=(await pool.query('SELECT name FROM sys_oauth_client WHERE client_id=$1 AND NOT COALESCE(disabled,false)',[clientId])).rows[0];
    if(!client)throw new AppError(400,'Unavailable client');
    const user=(await pool.query('SELECT must_change_password FROM sys_users WHERE id=$1',[context.userId])).rows[0];
    if(user?.must_change_password)throw new AppError(403,'Change password first');
    return {clientId,name:client.name??clientId,scopes:(params.get('scope')??'').split(' ').filter(Boolean),redirectUri:params.get('redirect_uri')};
  });

  app.get('/api/client-info',async()=>({name:appName,description,titleMode:config.browserTitleMode??'context',buildId}));
  app.get('/manifest.webmanifest',async(_request,reply)=>reply.header('Cache-Control','no-cache').type('application/manifest+json').send({...webManifest(appName),description}));
  app.get('/robots.txt',async(_request,reply)=>reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  app.post('/api/events',async(request,reply)=>{
    if(request.headers.authorization)throw new AppError(403,'Interactive session required');
    const context=await authenticate(request.headers);
    const input=z.object({workspaceId:z.uuid(),watched:z.array(z.object({objectTypeId:z.uuid(),recordId:z.uuid()}).strict()).max(200).default([])}).strict().parse(request.body);
    const validate=async()=>{await authenticate(request.headers);if((await pool.query('SELECT must_change_password FROM sys_users WHERE id=$1',[context.userId])).rows[0]?.must_change_password)throw new AppError(401,'Change password first');};
    const disconnect=new AbortController();reply.raw.once('close',()=>disconnect.abort());request.raw.once('aborted',()=>disconnect.abort());
    const stream=await updates.subscribe(context.userId,input.workspaceId,input.watched,validate,disconnect.signal);
    request.raw.once('aborted',()=>stream.destroy());reply.raw.once('close',()=>stream.destroy());
    return reply.header('Content-Type','text/event-stream').header('Cache-Control','no-store').header('X-Accel-Buffering','no').send(stream);
  });

  app.get('/healthz',async(_request,reply)=>{reply.header('Cache-Control','no-store');await pool.query('SELECT 1');return {status:'ok'};});
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
    const handler = createMcpHandler(async () => {
    const server = new McpServer({ name: 'xobject', version: API_VERSION });
    await attachSkills(server, application, context);
    server.registerResource('api-v1-contract','xobject://api/v1/openapi',{mimeType:'application/json',description:'Versioned input/output schemas for all xObject operations.'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(apiDocument)}]}));
    for (const operation of Object.keys(schemas) as Operation[]) {
      server.registerTool(operation, {
        ...toolMetadata(operation),
        outputSchema: outputSchemas[operation],
        inputSchema: schemas[operation],
      }, async (input: unknown) => {
        try {
          // Normalize Dates and JSON values exactly as the REST transport does before output validation.
          const result = JSON.parse(JSON.stringify(await application.execute(operation, input, context.userId, context)));
          return { structuredContent: result, content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (error) {
          return {isError:true,content:[{type:'text' as const,text:JSON.stringify(apiError(error))}]};
        }
      });
    }
    return server;
    }, { responseMode: 'auto', maxSubscriptions: 0 });
      const response = await handler.fetch(new Request(new URL(request.url, base), {
        method: 'POST', headers: new Headers({...Object.fromEntries(fromNodeHeaders(request.headers)), 'x-xobject-client-ip':request.ip}), body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(await response.text());

  });
  app.route({ method: ['GET', 'DELETE'], url: '/mcp', handler: async (_request, reply) => {
    return reply.header('allow', 'POST').code(405).send({ error: 'Only stateless POST requests are supported',code:'method_not_allowed' });
  } });
  // One origin for web and auth: no cross-origin proxy or exposed credentials.
  if (existsSync(webRoot)) {
    for(const path of ['/','/index.html'])app.get(path,async(_request,reply)=>reply.header('Cache-Control','no-store').type('text/html').send(shell()));
    app.register(fastifyStatic, { root: webRoot, prefix: '/', index: ['index.html'] });
    app.setNotFoundHandler((request, reply) => {
      const pathname = new URL(request.url, base).pathname;
      // Only application document routes fall back to the shell. Missing API/MCP/assets stay 404.
      const documentRoute = !/^\/(?:api|mcp|assets)(?:\/|$)/i.test(pathname) && !pathname.includes('.');
      if (request.method === 'GET' && request.headers.accept?.includes('text/html') && documentRoute) {
        return reply.header('Cache-Control', 'no-store').type('text/html').send(shell());
      }
      return reply.code(404).send({ error: 'Not found',code:'not_found' });
    });

  }
  return { app, db, auth };
}
