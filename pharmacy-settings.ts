import { Router } from 'express';
import sql from 'mssql';
import { getAuthPool } from './auth';
import type { PharmacySettings } from './src/types';

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const SETTINGS_SCHEMA_ERROR = 'Pharmacy settings are not configured. Run sql/user-auth-schema.sql in UserAuthDB first.';

function settingsFromRow(row: Record<string, unknown>): PharmacySettings {
  const mimeType = row.logo_mime_type ? String(row.logo_mime_type) : null;
  const logoData = row.logo_data ? Buffer.from(row.logo_data as Buffer).toString('base64') : null;

  return {
    name: String(row.pharmacy_name),
    address: String(row.address),
    phone: String(row.phone),
    logoDataUrl: mimeType && logoData ? `data:${mimeType};base64,${logoData}` : null,
  };
}

function validLogo(mimeType: string, image: Buffer): boolean {
  if (mimeType === 'image/png') {
    return image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/jpeg') {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  }
  return false;
}

export function createPharmacySettingsRouter(): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    try {
      const pool = await getAuthPool();
      const result = await pool.request()
        .query('SELECT TOP 1 pharmacy_name, address, phone, logo_mime_type, logo_data FROM dbo.PharmacySettings WHERE id = 1');
      if (!result.recordset[0]) {
        response.status(503).json({ error: SETTINGS_SCHEMA_ERROR });
        return;
      }
      response.json({ pharmacy: settingsFromRow(result.recordset[0]) });
    } catch (error) {
      console.error('[Pharmacy settings read error]', error instanceof Error ? error.message : error);
      response.status(503).json({ error: SETTINGS_SCHEMA_ERROR });
    }
  });

  router.put('/', async (request, response) => {
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!name || name.length > 100) {
      response.status(400).json({ error: 'Pharmacy name is required and must be 100 characters or fewer.' });
      return;
    }
    if (address.length > 300 || phone.length > 40) {
      response.status(400).json({ error: 'Address must be 300 characters or fewer and phone must be 40 characters or fewer.' });
      return;
    }

    try {
      const pool = await getAuthPool();
      const result = await pool.request()
        .input('name', sql.NVarChar(100), name)
        .input('address', sql.NVarChar(300), address)
        .input('phone', sql.NVarChar(40), phone)
        .query(
          `UPDATE dbo.PharmacySettings
           SET pharmacy_name = @name, address = @address, phone = @phone, updated_at = GETDATE()
           WHERE id = 1;
           SELECT TOP 1 pharmacy_name, address, phone, logo_mime_type, logo_data
           FROM dbo.PharmacySettings WHERE id = 1`,
        );
      if (!result.recordset[0]) {
        response.status(503).json({ error: SETTINGS_SCHEMA_ERROR });
        return;
      }
      response.json({ pharmacy: settingsFromRow(result.recordset[0]) });
    } catch (error) {
      console.error('[Pharmacy settings update error]', error instanceof Error ? error.message : error);
      response.status(503).json({ error: SETTINGS_SCHEMA_ERROR });
    }
  });

  router.put('/logo', async (request, response) => {
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const match = /^data:(image\/(?:png|jpeg));base64,([a-zA-Z0-9+/]+=*)$/.exec(dataUrl);
    if (!match) {
      response.status(400).json({ error: 'Choose a PNG or JPEG image.' });
      return;
    }
    const mimeType = match[1];
    const image = Buffer.from(match[2], 'base64');
    if (image.length === 0 || image.length > MAX_LOGO_BYTES || !validLogo(mimeType, image)) {
      response.status(400).json({ error: 'The logo must be a valid PNG or JPEG image no larger than 1.5 MB.' });
      return;
    }

    try {
      const pool = await getAuthPool();
      const result = await pool.request()
        .input('mimeType', sql.NVarChar(20), mimeType)
        .input('image', sql.VarBinary(sql.MAX), image)
        .query(
          `UPDATE dbo.PharmacySettings
           SET logo_mime_type = @mimeType, logo_data = @image, updated_at = GETDATE()
           WHERE id = 1;
           SELECT TOP 1 pharmacy_name, address, phone, logo_mime_type, logo_data
           FROM dbo.PharmacySettings WHERE id = 1`,
        );
      if (!result.recordset[0]) {
        response.status(503).json({ error: SETTINGS_SCHEMA_ERROR });
        return;
      }
      response.json({ pharmacy: settingsFromRow(result.recordset[0]) });
    } catch (error) {
      console.error('[Pharmacy logo update error]', error instanceof Error ? error.message : error);
      response.status(503).json({ error: SETTINGS_SCHEMA_ERROR });
    }
  });

  return router;
}