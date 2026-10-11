import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import sql from 'mssql';
import { getAuthPool } from './auth';

const EMAIL_SETTINGS_TABLE = 'dbo.EmailNotificationSettings';

type StoredEmailSettings = {
  sender_email: string | null;
  app_password_ciphertext: Buffer | null;
  app_password_iv: Buffer | null;
  app_password_auth_tag: Buffer | null;
  updated_at: Date | null;
};

function encryptionKey(): Buffer {
  const masterKey = process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET;
  if (!masterKey || masterKey.length < 32) {
    throw new Error('Email settings encryption is not configured. Set AUTH_JWT_SECRET or a SESSION_SECRET with at least 32 characters.');
  }

  return Buffer.from(hkdfSync(
    'sha256',
    masterKey,
    'fatema-pharmacy-email-settings-v1',
    'gmail-app-password',
    32,
  ));
}

function encryptAppPassword(password: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decryptAppPassword(settings: StoredEmailSettings): string {
  if (!settings.app_password_ciphertext || !settings.app_password_iv || !settings.app_password_auth_tag) {
    throw new Error('Email notification credentials are incomplete.');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), settings.app_password_iv);
  decipher.setAuthTag(settings.app_password_auth_tag);
  return Buffer.concat([
    decipher.update(settings.app_password_ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

async function readStoredEmailSettings(): Promise<StoredEmailSettings | null> {
  const pool = await getAuthPool();
  const result = await pool.request().query<StoredEmailSettings>(
    `SELECT TOP 1 sender_email, app_password_ciphertext, app_password_iv,
            app_password_auth_tag, updated_at
     FROM ${EMAIL_SETTINGS_TABLE}
     WHERE id = 1`,
  );
  return result.recordset[0] || null;
}

export async function getHourlyEmailCredentials(): Promise<{ email: string; appPassword: string } | null> {
  const settings = await readStoredEmailSettings();
  if (!settings?.sender_email
      || !settings.app_password_ciphertext
      || !settings.app_password_iv
      || !settings.app_password_auth_tag) {
    return null;
  }

  return {
    email: settings.sender_email,
    appPassword: decryptAppPassword(settings),
  };
}

const requireAdmin: RequestHandler = (_request, response, next) => {
  const role = String(response.locals.authUser?.role || '').trim().toLowerCase();
  if (role !== 'admin') {
    response.status(403).json({ error: 'Administrator access is required.' });
    return;
  }
  next();
};

export function createEmailSettingsRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', async (_request, response) => {
    try {
      const settings = await readStoredEmailSettings();
      if (!settings) {
        response.status(503).json({ error: 'Email settings are not configured. Run sql/user-auth-schema.sql in UserAuthDB first.' });
        return;
      }

      response.json({
        email: settings.sender_email || '',
        configured: Boolean(settings.app_password_ciphertext && settings.app_password_iv && settings.app_password_auth_tag),
        updatedAt: settings.updated_at ? new Date(settings.updated_at).toISOString() : null,
      });
    } catch (error) {
      console.error('[Email settings read error]', error instanceof Error ? error.message : error);
      response.status(503).json({ error: 'Email settings could not be loaded. Check UserAuthDB and run sql/user-auth-schema.sql if needed.' });
    }
  });

  router.post('/', async (request, response) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawPassword = typeof body.appPassword === 'string' ? body.appPassword.trim() : '';
    const appPassword = rawPassword.replace(/\s+/g, '');

    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      response.status(400).json({ error: 'Enter a valid notification email address.' });
      return;
    }
    if (rawPassword.length > 512) {
      response.status(400).json({ error: 'The app password must be 512 characters or fewer.' });
      return;
    }

    try {
      const current = await readStoredEmailSettings();
      if (!current) {
        response.status(503).json({ error: 'Email settings are not configured. Run sql/user-auth-schema.sql in UserAuthDB first.' });
        return;
      }
      if (!appPassword && !current.app_password_ciphertext) {
        response.status(400).json({ error: 'Enter the Gmail app password to configure email notifications.' });
        return;
      }

      const encrypted = appPassword ? encryptAppPassword(appPassword) : null;
      const ciphertext = encrypted?.ciphertext || current.app_password_ciphertext;
      const iv = encrypted?.iv || current.app_password_iv;
      const authTag = encrypted?.authTag || current.app_password_auth_tag;
      const pool = await getAuthPool();
      const result = await pool.request()
        .input('email', sql.NVarChar(320), email)
        .input('ciphertext', sql.VarBinary(sql.MAX), ciphertext)
        .input('iv', sql.VarBinary(16), iv)
        .input('authTag', sql.VarBinary(16), authTag)
        .query(
          `UPDATE ${EMAIL_SETTINGS_TABLE}
           SET sender_email = @email,
               app_password_ciphertext = @ciphertext,
               app_password_iv = @iv,
               app_password_auth_tag = @authTag,
               updated_at = GETDATE()
           WHERE id = 1;

           IF @@ROWCOUNT = 0
           BEGIN
             INSERT INTO ${EMAIL_SETTINGS_TABLE}
               (id, sender_email, app_password_ciphertext, app_password_iv, app_password_auth_tag, updated_at)
             VALUES
               (1, @email, @ciphertext, @iv, @authTag, GETDATE());
           END;

           SELECT TOP 1 sender_email, app_password_ciphertext, app_password_iv,
                  app_password_auth_tag, updated_at
           FROM ${EMAIL_SETTINGS_TABLE}
           WHERE id = 1;`,
        );
      const saved = result.recordset[0] as StoredEmailSettings | undefined;
      if (!saved) {
        response.status(503).json({ error: 'Email settings could not be saved.' });
        return;
      }

      console.log(`[Email settings] Notification sender updated for ${email}.`);
      response.json({
        email: saved.sender_email || '',
        configured: Boolean(saved.app_password_ciphertext && saved.app_password_iv && saved.app_password_auth_tag),
        updatedAt: saved.updated_at ? new Date(saved.updated_at).toISOString() : null,
      });
    } catch (error) {
      console.error('[Email settings update error]', error instanceof Error ? error.message : error);
      response.status(503).json({ error: 'Email settings could not be saved. Check UserAuthDB and run sql/user-auth-schema.sql if needed.' });
    }
  });

  return router;
}
