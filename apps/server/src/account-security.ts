import { sql } from 'kysely';
import { v7 } from 'uuid';
import { schemas, type Operation, type AccountSecurity } from '@xobject/contracts';
import type { Executor } from './database.js';
import { passwordCrypto } from './auth.js';
import { AppError } from './errors.js';

type SecurityOperation = 'get_account_security' | 'change_password' | 'revoke_session' | 'revoke_other_sessions';
type Journal = (kind: string, id: string, change: string, key: string, before: unknown, after: unknown) => Promise<void>;
export function isAccountSecurityOperation(operation: Operation): operation is SecurityOperation {
  return ['get_account_security', 'change_password', 'revoke_session', 'revoke_other_sessions'].includes(operation);
}

export class AccountSecurityService {
  // A bounded per-process guard for this loopback prototype; not a distributed rate limiter.
  private failures = new Map<string, { count: number; until: number }>();

  async execute(tx: Executor, operation: SecurityOperation, input: unknown, actor: string, currentId: string | undefined, journal: Journal): Promise<AccountSecurity | { changed?: boolean; revokedSessions: number }> {
    const current = currentId && (await sql`SELECT id FROM sys_sessions WHERE id = ${currentId} AND user_id = ${actor} AND expires_at > now()`.execute(tx)).rows[0];
    if (!current) throw new AppError(401, 'Authentication required');
    if (operation === 'get_account_security') {
      const credential = (await sql`SELECT 1 FROM sys_accounts WHERE user_id = ${actor} AND provider_id = 'credential' AND password IS NOT NULL`.execute(tx)).rows.length > 0;
      const rows = (await sql<{ id: string; created_at: Date; updated_at: Date; expires_at: Date; ip_address: string | null; user_agent: string | null }>`SELECT id, created_at, updated_at, expires_at, ip_address, user_agent FROM sys_sessions WHERE user_id = ${actor} AND expires_at > now() ORDER BY (id = ${currentId}) DESC, updated_at DESC, id`.execute(tx)).rows;
      return { hasPassword: credential, sessions: rows.map(row => ({ id: row.id, current: row.id === currentId, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), expiresAt: row.expires_at.toISOString(), ipAddress: row.ip_address, userAgent: row.user_agent })) };
    }
    const change = v7();
    if (operation === 'change_password') {
      const args = schemas.change_password.parse(input);
      const now = Date.now();
      for (const [id, item] of this.failures) if (item.until <= now) this.failures.delete(id);
      const attempts = this.failures.get(actor);
      if (attempts && attempts.count >= 5) throw new AppError(429, 'Password attempts exceeded');
      const account = (await sql<{ id: string; password: string }>`SELECT id, password FROM sys_accounts WHERE user_id = ${actor} AND provider_id = 'credential' AND password IS NOT NULL FOR UPDATE`.execute(tx)).rows[0];
      if (!account) throw new AppError(400, 'Local password is not available');
      if (!await passwordCrypto.verify({ hash: account.password, password: args.currentPassword })) {
        if (this.failures.size >= 10000 && !attempts) throw new AppError(429, 'Password attempts exceeded');
        this.failures.set(actor, { count: (attempts?.count ?? 0) + 1, until: attempts?.until ?? now + 60000 });
        throw new AppError(400, 'Current password is incorrect');
      }
      if (await passwordCrypto.verify({ hash: account.password, password: args.newPassword })) throw new AppError(400, 'New password must be different');
      const hash = await passwordCrypto.hash(args.newPassword);
      await sql`UPDATE sys_accounts SET password = ${hash}, updated_at = now() WHERE id = ${account.id}`.execute(tx);
      const user = (await sql<{ must_change_password: boolean }>`SELECT must_change_password FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
      if (user.must_change_password) {
        await sql`UPDATE sys_users SET must_change_password = false, management_version = management_version + 1, updated_at = now() WHERE id = ${actor}`.execute(tx);
        await journal('user', actor, change, 'must_change_password', true, false);
      }
      let revokedSessions = 0;
      if (args.revokeOtherSessions || user.must_change_password) revokedSessions = await this.revoke(tx, actor, currentId!, change, journal);
      await journal('account_security', actor, change, 'password_changed', null, true);
      // Keeping the counter until expiry also bounds repeated successful attempts after rollback.
      return { changed: true, revokedSessions };
    }
    const target = operation === 'revoke_session' ? schemas.revoke_session.parse(input).sessionId : undefined;
    if (target === currentId) throw new AppError(400, 'Use sign-out for the current session');
    const revokedSessions = await this.revoke(tx, actor, currentId!, change, journal, target);
    if (target && !revokedSessions) throw new AppError(404, 'Session not found');
    return { revokedSessions };
  }

  private async revoke(tx: Executor, actor: string, currentId: string, change: string, journal: Journal, target?: string) {
    const rows = (await sql<{ id: string }>`DELETE FROM sys_sessions WHERE user_id = ${actor} AND id <> ${currentId} AND expires_at > now() ${target ? sql`AND id = ${target}` : sql``} RETURNING id`.execute(tx)).rows;
    for (const row of rows) await journal('session', row.id, change, 'revoked', false, true);
    return rows.length;
  }
}
