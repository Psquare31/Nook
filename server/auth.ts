import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { Account } from '../shared/types';
import { cleanName } from './world';

export type AuthConfig = {
  googleClientId: string;
  sessionSecret: string;
  // Only changed by tests, which sign their own stand-in Google tokens.
  googleKeysUrl?: string;
};

export type Auth = {
  googleClientId: string;
  signIn: (credential: unknown) => Promise<{ account: Account; session: string } | null>;
  readSession: (token: unknown) => Promise<Account | null>;
};

const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const SESSION_ISSUER = 'nook';
const SESSION_LIFETIME = '30d';
const CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;
const SECRET_MIN = 32;
const TOKEN_MAX = 4096;
const PICTURE = /^https:\/\/[\w.-]+\.googleusercontent\.com\//;

export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig | null {
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const sessionSecret = env.SESSION_SECRET?.trim() ?? '';
  if (!googleClientId) return null;

  if (!CLIENT_ID.test(googleClientId)) {
    console.warn('GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com. Sign-in is off.');
    return null;
  }
  if (sessionSecret.length < SECRET_MIN) {
    console.warn(`SESSION_SECRET must be at least ${SECRET_MIN} characters. Sign-in is off.`);
    return null;
  }
  return { googleClientId, sessionSecret };
}

// Google's account id is not secret, but nobody else needs it, so rooms and players
// carry a digest of it instead.
function accountId(googleSub: string): string {
  return createHash('sha256').update(`google:${googleSub}`).digest('hex').slice(0, 16);
}

function picture(value: unknown): string | null {
  return typeof value === 'string' && PICTURE.test(value) ? value : null;
}

export function createAuth(config: AuthConfig): Auth {
  const googleKeys = createRemoteJWKSet(new URL(config.googleKeysUrl ?? GOOGLE_KEYS_URL));
  const secret = new TextEncoder().encode(config.sessionSecret);

  // Google's token lasts an hour. The app's own session lasts a month, so people stay
  // signed in across reloads and server restarts without going back to Google.
  const issueSession = (account: Account) =>
    new SignJWT({ name: account.name, picture: account.picture })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(account.id)
      .setIssuer(SESSION_ISSUER)
      .setIssuedAt()
      .setExpirationTime(SESSION_LIFETIME)
      .sign(secret);

  return {
    googleClientId: config.googleClientId,

    async signIn(credential) {
      if (typeof credential !== 'string' || credential.length > TOKEN_MAX) return null;
      try {
        const { payload } = await jwtVerify(credential, googleKeys, {
          issuer: GOOGLE_ISSUERS,
          audience: config.googleClientId,
        });
        if (typeof payload.sub !== 'string') return null;

        const account: Account = {
          id: accountId(payload.sub),
          name: cleanName(payload.name) ?? 'Google user',
          picture: picture(payload.picture),
        };
        return { account, session: await issueSession(account) };
      } catch {
        return null;
      }
    },

    async readSession(token) {
      if (typeof token !== 'string' || token.length > TOKEN_MAX) return null;
      try {
        const { payload } = await jwtVerify(token, secret, {
          issuer: SESSION_ISSUER,
          algorithms: ['HS256'],
        });
        if (typeof payload.sub !== 'string' || typeof payload.name !== 'string') return null;
        return { id: payload.sub, name: payload.name, picture: picture(payload.picture) };
      } catch {
        return null;
      }
    },
  };
}
