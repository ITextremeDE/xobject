import { sql } from 'kysely';
import type { Operation } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';
import { validateCredentialContext, type RequestContext } from './api-credentials.js';
import { validateOAuthContext } from './oauth.js';

/** Recheck external authentication after model/workspace locks, inside the business transaction. */
export async function validateRequestContext(tx: Executor, actor: string, operation: Operation, context?: RequestContext) {
  // Bootstrap/operator calls have no external authentication context; authorize() still checks the actor.
  if (!context) return;
  const identities = [context.sessionId, context.credentialId, context.oauthTokenId].filter(Boolean);
  if (identities.length !== 1) throw new AppError(401, 'Authentication required');
  if (context.sessionId) {
    // The wall clock matters after waiting for a lock; transaction_timestamp()/now() may be stale.
    // Holding a shared row lock orders in-flight work before a concurrent sign-out/session deletion.
    const session = (await sql`SELECT id FROM sys_sessions WHERE id=${context.sessionId} AND user_id=${actor} AND expires_at>clock_timestamp() FOR SHARE`.execute(tx)).rows[0];
    if (!session) throw new AppError(401, 'Session expired or revoked');
    return;
  }
  await validateCredentialContext(tx, actor, operation, context);
  await validateOAuthContext(tx, actor, operation, context);
}
