import { createHash } from 'node:crypto';
import { mcp } from '@better-auth/mcp';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { sql } from 'kysely';
import type { Executor } from './database.js';
import { AppError } from './errors.js';
import { isReadOperation } from './operation-locks.js';
import type { Operation } from '@xobject/contracts';
import type { RequestContext } from './api-credentials.js';

export const authSchemaRevision = 'better-auth-1.7.18-oauth-session-2';
export const oauthHash = (value:string) => createHash('sha256').update(value).digest('hex');
const snake = (value:string) => value.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
export function oauthPlugins(baseURL:string) {
  const options = {resource:new URL('/mcp',baseURL).href, loginPage:'/oauth/login', consentPage:'/oauth/consent',
    scopes:['xobject:read','xobject:write','offline_access'], grantTypes:['authorization_code','refresh_token'] as ('authorization_code'|'refresh_token')[],
    disableJwtPlugin:true, accessTokenExpiresIn:900, refreshTokenExpiresIn:604800,
    refreshTokenReuseInterval:0, storeTokens:{hash:oauthHash}, dpop:{signingAlgorithms:[]},
    allowDynamicClientRegistration:false, allowUnauthenticatedClientRegistration:false,
  };
  // Keep the maintained provider's complete schema, mapped to the system naming convention.
  const base=mcp(options);
  const schema=Object.fromEntries(Object.entries(base.schema).map(([name,definition])=>[name,{
    modelName:`sys_${snake(name)}`,
    fields:Object.fromEntries(Object.keys(definition.fields).map(field=>[field,snake(field)])),
  }]));
  return [mcp({...options,schema}),cimd({metadataProfile:'mcp-2026-07-28',fetchClientMetadataResource})];
}

type OAuthRow={id:string;user_id:string;session_id:string|null;client_id:string;scopes:string[];resources:string[];confirmation:unknown;name:string|null};
/** Offline consent survives natural web-session expiry/deletion. Online-only grants
 * still require a live session. Explicit security actions revoke both token kinds. */
export async function authenticateOAuth(tx:Executor,authorization:string,resource:string) {
  const match=/^Bearer ([A-Za-z0-9_-]{20,512})$/.exec(authorization);
  if(!match)throw new AppError(401,'Invalid access token');
  const row=(await sql<OAuthRow>`SELECT t.*,c.name FROM sys_oauth_access_token t JOIN sys_oauth_client c ON c.client_id=t.client_id JOIN sys_users u ON u.id=t.user_id LEFT JOIN sys_sessions s ON s.id=t.session_id AND s.user_id=t.user_id WHERE t.token=${oauthHash(match[1])} AND t.revoked IS NULL AND t.expires_at>clock_timestamp() AND NOT COALESCE(c.disabled,false) AND u.active AND NOT u.must_change_password AND (t.scopes ? 'offline_access' OR s.expires_at>clock_timestamp())`.execute(tx)).rows[0];
  if(!row || !row.resources?.includes(resource) || row.confirmation || !row.scopes?.some(scope=>scope==='xobject:read'||scope==='xobject:write'))throw new AppError(401,'Invalid access token');
  return {userId:row.user_id,channel:'mcp' as const,oauthTokenId:row.id,oauthResource:resource,agentName:row.name??'OAuth client'};
}
export async function validateOAuthContext(tx:Executor,actor:string,operation:Operation,context?:RequestContext){
  if(!context?.oauthTokenId)return;
  const row=(await sql<OAuthRow>`SELECT t.*,c.name FROM sys_oauth_access_token t JOIN sys_oauth_client c ON c.client_id=t.client_id JOIN sys_users u ON u.id=t.user_id LEFT JOIN sys_sessions s ON s.id=t.session_id AND s.user_id=t.user_id WHERE t.id=${context.oauthTokenId} AND t.user_id=${actor} AND t.revoked IS NULL AND t.expires_at>clock_timestamp() AND NOT COALESCE(c.disabled,false) AND u.active AND NOT u.must_change_password AND (t.scopes ? 'offline_access' OR s.expires_at>clock_timestamp()) FOR UPDATE OF t`.execute(tx)).rows[0];
  if(!row||!row.resources?.includes(context.oauthResource??'')||row.confirmation||!row.scopes.some(scope=>scope==='xobject:read'||scope==='xobject:write'))throw new AppError(401,'OAuth access expired or revoked');
  if(operation.includes('api_credential')||operation.includes('oauth_authorization')||['change_password','get_account_security','revoke_session','revoke_other_sessions'].includes(operation))throw new AppError(403,'Interactive session required');
  if(!isReadOperation(operation)&&!row.scopes.includes('xobject:write'))throw new AppError(403,'OAuth access is read-only');
  context.agentName=row.name??'OAuth client';
}

export async function manageOAuth(tx:Executor,operation:'list_oauth_authorizations'|'revoke_oauth_authorization',actor:string,context:RequestContext|undefined,clientId?:string,journal?:(before:unknown)=>Promise<void>){
  if(context?.credentialId||context?.oauthTokenId||!context?.sessionId||!(await sql`SELECT 1 FROM sys_sessions WHERE id=${context.sessionId} AND user_id=${actor} AND expires_at>clock_timestamp()`.execute(tx)).rows.length)throw new AppError(403,'Interactive session required');
  if(operation==='list_oauth_authorizations')return (await sql<{clientId:string;name:string;scopes:string[];createdAt:Date}>`WITH grants AS (
    SELECT client_id,scopes,created_at FROM sys_oauth_access_token WHERE user_id=${actor} AND revoked IS NULL AND expires_at>clock_timestamp()
    UNION ALL SELECT client_id,scopes,created_at FROM sys_oauth_refresh_token WHERE user_id=${actor} AND revoked IS NULL AND expires_at>clock_timestamp()
    UNION ALL SELECT client_id,scopes,created_at FROM sys_oauth_consent WHERE user_id=${actor}
  ) SELECT c.client_id AS "clientId",COALESCE(c.name,c.client_id) AS name,ARRAY(SELECT DISTINCT jsonb_array_elements_text(g2.scopes) FROM grants g2 WHERE g2.client_id=c.client_id) AS scopes,MIN(g.created_at) AS "createdAt" FROM sys_oauth_client c JOIN grants g ON g.client_id=c.client_id GROUP BY c.client_id,c.name ORDER BY COALESCE(c.name,c.client_id)`.execute(tx)).rows.map(row=>({...row,createdAt:row.createdAt.toISOString()}));
  const access=(await sql`UPDATE sys_oauth_access_token SET revoked=clock_timestamp() WHERE user_id=${actor} AND client_id=${clientId!} AND revoked IS NULL RETURNING id`.execute(tx)).rows;
  const refresh=(await sql`UPDATE sys_oauth_refresh_token SET revoked=clock_timestamp() WHERE user_id=${actor} AND client_id=${clientId!} AND revoked IS NULL RETURNING id`.execute(tx)).rows;
  const consent=(await sql`DELETE FROM sys_oauth_consent WHERE user_id=${actor} AND client_id=${clientId!} RETURNING id`.execute(tx)).rows;
  if(access.length||refresh.length||consent.length)await journal?.({clientId,accessTokens:access.length,refreshTokens:refresh.length});
  return {revoked:true};
}
export async function revokeUserOAuth(tx:Executor,userId:string){
  await sql`UPDATE sys_oauth_access_token SET revoked=clock_timestamp() WHERE user_id=${userId} AND revoked IS NULL`.execute(tx);
  await sql`UPDATE sys_oauth_refresh_token SET revoked=clock_timestamp() WHERE user_id=${userId} AND revoked IS NULL`.execute(tx);
}
