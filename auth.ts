import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import sql from 'mssql';

const AUTH_COOKIE = 'pharmacy_auth';
const AUTH_ISSUER = 'fatema-pharmacy';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;

type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

type AuthTokenPayload = JwtPayload & {
  sub: string;
  username: string;
  email: string;
  role: string;
};

let authPool: sql.ConnectionPool | null = null;
let authPoolPromise: Promise<sql.ConnectionPool> | null = null;

function authSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Authentication is not configured. Set AUTH_JWT_SECRET or a SESSION_SECRET with at least 32 characters.');
  }
  return secret;
}

function authDatabaseConfig(): sql.config {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('Authentication database is not configured. Set DATABASE_URL for UserAuthDB.');
  }

  const parsed = sql.ConnectionPool.parseConnectionString(connectionString);
  return {
    ...parsed,
    connectionTimeout: Number(process.env.AUTH_DB_CONNECT_TIMEOUT || 5000),
    requestTimeout: Number(process.env.AUTH_DB_REQUEST_TIMEOUT || 8000),
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
      ...(parsed.pool || {}),
    },
    options: {
      ...(parsed.options || {}),
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };
}

export async function getAuthPool(): Promise<sql.ConnectionPool> {
  if (authPool?.connected) {
    return authPool;
  }
  if (!authPoolPromise) {
    authPoolPromise = new sql.ConnectionPool(authDatabaseConfig())
      .connect()
      .then((pool) => {
        authPool = pool;
        return pool;
      })
      .catch((error) => {
        authPoolPromise = null;
        throw error;
      });
  }
  return authPoolPromise;
}

function normalizeUser(row: Record<string, unknown>): AuthUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    name: String(row.display_name || row.username),
    email: String(row.email),
    role: String(row.role || 'user'),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const pair = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function issueToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      email: user.email,
      role: user.role,
    },
    authSecret(),
    { expiresIn: '8h', issuer: AUTH_ISSUER },
  );
}

function readToken(request: Request): AuthTokenPayload | null {
  const token = getCookie(request, AUTH_COOKIE);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, authSecret(), { issuer: AUTH_ISSUER });
    if (typeof payload === 'string' || !payload.sub || !payload.username || !payload.email) return null;
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

function setAuthCookie(response: Response, token: string): void {
  response.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

function clearAuthCookie(response: Response): void {
  response.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

function clientAddress(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

const attempts = new Map<string, { count: number; resetAt: number }>();
function allowAuthAttempt(request: Request): boolean {
  const now = Date.now();
  const key = clientAddress(request);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function requestBody(request: Request): Record<string, unknown> {
  return request.body && typeof request.body === 'object' ? request.body : {};
}

function validEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUsername(value: string): boolean {
  return value.length >= 3 && value.length <= 50 && /^[a-zA-Z0-9_.-]+$/.test(value);
}

function validationError(body: Record<string, unknown>, signup: boolean): string | null {
  const username = String(body.username || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (signup && !validUsername(username)) {
    return 'Username must be 3–50 characters and contain only letters, numbers, dots, hyphens, or underscores.';
  }
  if (!validEmail(email)) return 'Enter a valid email address.';
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    return `Password must be between ${PASSWORD_MIN_LENGTH} and 128 characters.`;
  }
  return null;
}

function databaseError(error: unknown): string {
  return error instanceof Error ? error.message : 'Authentication database is unavailable.';
}

export const requireAuth: RequestHandler = (request, response, next: NextFunction) => {
  const payload = readToken(request);
  if (!payload) {
    clearAuthCookie(response);
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  response.locals.authUser = {
    id: Number(payload.sub),
    username: payload.username,
    email: payload.email,
    role: payload.role,
  };
  next();
};

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/signup', async (request, response) => {
    if (!allowAuthAttempt(request)) {
      response.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
      return;
    }
    const body = requestBody(request);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const error = validationError(body, true);
    if (error) {
      response.status(400).json({ error });
      return;
    }

    try {
      const pool = await getAuthPool();
      const existing = await pool.request()
        .input('username', sql.NVarChar(50), username)
        .input('email', sql.NVarChar(320), email)
        .query('SELECT TOP 1 id FROM dbo.Users WHERE username = @username OR email = @email');
      if (existing.recordset.length > 0) {
        response.status(409).json({ error: 'That username or email is already registered.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.request()
        .input('username', sql.NVarChar(50), username)
        .input('email', sql.NVarChar(320), email)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .query(
           `INSERT INTO dbo.Users (username, email, password_hash, display_name)
            OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.role, INSERTED.created_at, INSERTED.display_name
            VALUES (@username, @email, @passwordHash, @username)`,
        );
      const user = normalizeUser(result.recordset[0]);
      setAuthCookie(response, issueToken(user));
      response.status(201).json({ user });
    } catch (error) {
      // A unique index is still the source of truth if concurrent sign-ups race.
      if (typeof error === 'object' && error !== null && 'number' in error && [2601, 2627].includes(Number(error.number))) {
        response.status(409).json({ error: 'That username or email is already registered.' });
        return;
      }
      console.error('[Auth signup error]', databaseError(error));
      response.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  });

  router.post('/login', async (request, response) => {
    if (!allowAuthAttempt(request)) {
      response.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
      return;
    }
    const body = requestBody(request);
    const identifier = String(body.identifier || body.email || body.username || '').trim();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!identifier || password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
      response.status(400).json({ error: 'Enter your username or email and password.' });
      return;
    }

    try {
      const pool = await getAuthPool();
      const result = await pool.request()
        .input('identifier', sql.NVarChar(320), identifier.toLowerCase())
        .query(
           `SELECT TOP 1 id, username, email, password_hash, role, created_at, display_name
           FROM dbo.Users
           WHERE LOWER(username) = @identifier OR LOWER(email) = @identifier`,
        );
      const row = result.recordset[0];
      const passwordMatches = row ? await bcrypt.compare(password, String(row.password_hash)) : false;
      if (!row || !passwordMatches) {
        response.status(401).json({ error: 'Invalid username/email or password.' });
        return;
      }
      const user = normalizeUser(row);
      setAuthCookie(response, issueToken(user));
      response.json({ user });
    } catch (error) {
      console.error('[Auth login error]', databaseError(error));
      response.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  });

  router.get('/me', async (request, response) => {
    const payload = readToken(request);
    if (!payload) {
      clearAuthCookie(response);
      response.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    try {
      const pool = await getAuthPool();
      const result = await pool.request()
        .input('id', sql.Int, Number(payload.sub))
        .query('SELECT TOP 1 id, username, email, role, created_at, display_name FROM dbo.Users WHERE id = @id');
      if (result.recordset.length === 0) {
        clearAuthCookie(response);
        response.status(401).json({ error: 'Your account no longer exists.' });
        return;
      }
      response.json({ user: normalizeUser(result.recordset[0]) });
    } catch (error) {
      console.error('[Auth me error]', databaseError(error));
      response.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  });

  router.put('/profile', async (request, response) => {
    const payload = readToken(request);
    if (!payload) {
      clearAuthCookie(response);
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowAuthAttempt(request)) {
      response.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
      return;
    }

    const body = requestBody(request);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!name || name.length > 100) {
      response.status(400).json({ error: 'Name is required and must be 100 characters or fewer.' });
      return;
    }
    if (!validEmail(email)) {
      response.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (currentPassword.length < PASSWORD_MIN_LENGTH || currentPassword.length > 128) {
      response.status(400).json({ error: 'Enter your current password to confirm profile changes.' });
      return;
    }
    if (newPassword && (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > 128)) {
      response.status(400).json({ error: `New password must be between ${PASSWORD_MIN_LENGTH} and 128 characters.` });
      return;
    }

    try {
      const pool = await getAuthPool();
      const existing = await pool.request()
        .input('id', sql.Int, Number(payload.sub))
        .query('SELECT TOP 1 id, password_hash FROM dbo.Users WHERE id = @id');
      const row = existing.recordset[0];
      if (!row) {
        clearAuthCookie(response);
        response.status(401).json({ error: 'Your account no longer exists.' });
        return;
      }
      if (!(await bcrypt.compare(currentPassword, String(row.password_hash)))) {
        response.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : String(row.password_hash);
      const result = await pool.request()
        .input('id', sql.Int, Number(payload.sub))
        .input('name', sql.NVarChar(100), name)
        .input('email', sql.NVarChar(320), email)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .query(
          `UPDATE dbo.Users
           SET display_name = @name, email = @email, password_hash = @passwordHash
           WHERE id = @id;
           SELECT TOP 1 id, username, email, role, created_at, display_name
           FROM dbo.Users WHERE id = @id`,
        );
      const user = normalizeUser(result.recordset[0]);
      setAuthCookie(response, issueToken(user));
      response.json({ user });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'number' in error && [2601, 2627].includes(Number(error.number))) {
        response.status(409).json({ error: 'That email address is already registered.' });
        return;
      }
      console.error('[Auth profile update error]', databaseError(error));
      response.status(503).json({ error: 'Profile could not be updated. Check that the updated UserAuthDB schema has been applied.' });
    }
  });

  router.post('/logout', (request, response) => {
    clearAuthCookie(response);
    response.status(204).end();
  });

  return router;
}