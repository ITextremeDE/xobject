import { betterAuth, type BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';
import { v7 } from 'uuid';

export function authOptions(pool: Pool, secret: string, baseURL: string, allowLocalProvisioning = false) {
  return {
    appName: 'xObject',
    database: pool,
    secret,
    baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    emailAndPassword: { enabled: true, disableSignUp: !allowLocalProvisioning, minPasswordLength: 12 },
    user: {
      modelName: 'sys_users',
      fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: { language: { type: 'string', required: false, input: false } },
    },
    session: {
      modelName: 'sys_sessions', cookieCache: { enabled: false },
      fields: {
        userId: 'user_id', expiresAt: 'expires_at', createdAt: 'created_at',
        updatedAt: 'updated_at', ipAddress: 'ip_address', userAgent: 'user_agent',
      },
    },
    account: {
      modelName: 'sys_accounts',
      fields: {
        userId: 'user_id', accountId: 'account_id', providerId: 'provider_id',
        accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'sys_verifications',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    advanced: { database: { generateId: () => v7() } },
  } satisfies BetterAuthOptions;
}

export function createAuth(pool: Pool, secret: string, baseURL: string, allowLocalProvisioning = false) {
  return betterAuth(authOptions(pool, secret, baseURL, allowLocalProvisioning));
}
