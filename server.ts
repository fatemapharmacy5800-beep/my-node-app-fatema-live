import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import sql from 'mssql';
import { MedicineItem, Supplier, DatabaseStatus, DashboardAnalytics } from './src/types';
import { getSupplierCategory, getPercentage, getSaleRate } from './src/utils/crystalFormulas';
import { createAuthRouter, requireAuth } from './auth';
import { getHistoricalReport, saveDailySummaryReport, saveHourlySummaryReport } from './reports';
import { createPharmacySettingsRouter } from './pharmacy-settings';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
app.disable('x-powered-by');
const PORT = Number(process.env.PORT || 3001);
const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE || 'Asia/Dhaka';
const isProduction = process.env.NODE_ENV === 'production';
const rawAllowedHosts = (process.env.ALLOWED_HOSTS || '').split(/[,\s]+/).filter(Boolean);

function normalizeHost(value: string): string | null {
  try {
    const parsed = new URL(`http://${value.trim()}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}


const normalizedAllowedHosts = rawAllowedHosts.map(normalizeHost);
const allowedHosts = new Set(normalizedAllowedHosts.filter((host): host is string => host !== null));
const hostConfigurationIsValid = rawAllowedHosts.length > 0 && normalizedAllowedHosts.every((host) => host !== null);

const dbSchema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db-schema.json'), 'utf8')) as {
  tables: Record<string, Array<{ column: string }>>;
  views: Record<string, Array<{ column: string }>>;
};

app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (!isProduction) {
    next();
    return;
  }

  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
  ].join('; '));
  response.setHeader('Strict-Transport-Security', 'max-age=31536000');

  if (!hostConfigurationIsValid) {
    response.status(503).send('Production host security is not configured. Set ALLOWED_HOSTS to the exact authorized hostnames.');
    return;
  }

  const requestHost = normalizeHost(request.get('host') || '');
  if (!requestHost || !allowedHosts.has(requestHost)) {
    response.status(421).send('This host is not authorized to access the application.');
    return;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.get('origin');
    let originHost: string | null = null;
    try {
      if (origin) originHost = normalizeHost(new URL(origin).host);
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== requestHost) {
      response.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      return;
    }
  }

  next();
});

function schemaObject(kind: 'tables' | 'views', name: string) {
  if (!dbSchema[kind]?.[name]) {
    throw new Error(`Database object ${kind}.${name} is not present in db-schema.json`);
  }
  return `[${name}]`;
}

function schemaColumn(kind: 'tables' | 'views', objectName: string, columnName: string) {
  const columns = dbSchema[kind]?.[objectName] || [];
  if (!columns.some((column) => column.column === columnName)) {
    throw new Error(`Database column ${objectName}.${columnName} is not present in db-schema.json`);
  }
  return `[${columnName}]`;
}

app.use(express.json({ limit: '3mb' }));

// In-memory cache & status
let cachedMedicines: MedicineItem[] = [];
let cachedSuppliers: Supplier[] = [];
let lastSyncTime = new Date().toISOString();
let connectionError: string | null = null;
let isConnectedToSql = false;
let sharedPool: sql.ConnectionPool | null = null;
let sharedPoolPromise: Promise<sql.ConnectionPool> | null = null;
let activeSyncPromise: Promise<{
  medicines: MedicineItem[];
  suppliers: Supplier[];
  connected: boolean;
  error?: string;
}> | null = null;
const activeSupplierSyncs = new Map<string, Promise<DatabaseFetchResult>>();

// SQL Server 2000 Connection Configuration
function getSqlConfig(overrides: Partial<sql.config> = {}): sql.config {
  const configuredServer = overrides.server || process.env.DB_SERVER || 'localhost';
  const serverParts = configuredServer.split('\\').filter(Boolean);
  const server = serverParts[0] || configuredServer;
  const configuredInstanceValue = process.env.DB_INSTANCE_NAME?.trim() || '';
  const configuredInstance = configuredInstanceValue.toUpperCase() === 'MSSQLSERVER' ? '' : configuredInstanceValue;
  const parsedInstance = serverParts.length > 1 ? serverParts[serverParts.length - 1] : '';
  const instanceName = configuredInstance || (parsedInstance && parsedInstance.toUpperCase() !== 'MSSQLSERVER' ? parsedInstance : undefined);

  return {
    ...overrides,
    user: overrides.user || process.env.DB_USER || 'sa',
    password: overrides.password !== undefined ? overrides.password : (process.env.DB_PASSWORD || ''),
    server,
    port: overrides.port || parseInt(process.env.DB_PORT || '1433', 10),
    database: overrides.database || process.env.DB_NAME || 'HDMS',
    options: {
      ...(overrides.options || {}),
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      // Keep these configurable for slower local SQL Server installations while
      // using shorter defaults so an unavailable database does not block the UI.
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 2500),
      requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 8000),
      tdsVersion: '7_1', // Compatible with legacy SQL Server 2000
      ...(instanceName ? { instanceName } : {}),
    },
  };
}

// Map database record to MedicineItem applying exact Crystal Report formulas and Items table columns
function mapRecordToMedicine(row: any, index: number): MedicineItem {
  const postCode = (row.Post_Code || '').trim();
  const supplierCate = row.Supplier_Cate || getSupplierCategory(postCode);

  const rate = Number(row.Rate || 0);
  const discPct = Number(row.Disc_Pct || 0);
  const retailDiscount = Number(row.Retail_Discount || 0);
  
  // @Persentage Formula
  const percentage = getPercentage(discPct, retailDiscount);
  
  // @SaleRate Formula
  const saleRate = getSaleRate(rate, percentage);

  const phBalance = Number(row.Balance || 0);
  const storeBalance = Number(row.Store_Balance || 0);
  const totalBalance = phBalance + storeBalance;

  return {
    id: row.Item_ID || index + 1,
    Item_ID: Number(row.Item_ID || index + 1),
    Item_Name: String(row.Item_Name || 'Unnamed Medicine'),
    Item_Code: row.Item_Code ? String(row.Item_Code) : '',
    Catagory_Id: row.Catagory_Id !== undefined && row.Catagory_Id !== null ? Number(row.Catagory_Id) : undefined,
    Category_Name: row.Category_Name ? String(row.Category_Name) : undefined,
    Item_Type: row.Item_Type !== undefined && row.Item_Type !== null ? row.Item_Type : '',
    Specimen: row.Specimen ? String(row.Specimen) : undefined,
    Rate: rate,
    Making_Time: row.Making_Time ? String(row.Making_Time) : undefined,
    Purchase_Rate: row.Purchase_Rate !== undefined && row.Purchase_Rate !== null ? Number(row.Purchase_Rate) : undefined,
    Comments: row.Comments ? String(row.Comments) : undefined,
    Reorder_Level: Number(row.Reorder_Level || 0),
    Balance: phBalance,
    VAT: Boolean(row.VAT),
    Inv_Rep_Type: row.Inv_Rep_Type !== undefined && row.Inv_Rep_Type !== null ? Number(row.Inv_Rep_Type) : undefined,
    Generic_Name: row.Generic_Name ? String(row.Generic_Name) : '',
    Unit: row.Unit ? String(row.Unit) : 'Pkt',
    Service_Charge: Boolean(row.Service_Charge),
    OB: row.OB !== undefined && row.OB !== null ? Number(row.OB) : undefined,
    OB_Date: row.OB_Date ? String(row.OB_Date) : undefined,
    Debit: Number(row.Debit || 0),
    Credit: row.Credit !== undefined && row.Credit !== null ? Number(row.Credit) : undefined,
    Flexible_Rate: Boolean(row.Flexible_Rate),
    Barcode: row.Barcode ? String(row.Barcode) : undefined,
    Location: row.Location ? String(row.Location) : undefined,
    Expire_Date: row.Expire_Date ? String(row.Expire_Date) : undefined,
    Group_Test: Boolean(row.Group_Test),
    Supplier_ID: row.Supplier_ID !== undefined && row.Supplier_ID !== null ? Number(row.Supplier_ID) : undefined,
    Cost_Price: Number(row.Cost_Price || 0),
    OB_Exp_Qty: row.OB_Exp_Qty !== undefined && row.OB_Exp_Qty !== null ? Number(row.OB_Exp_Qty) : undefined,
    OB_SDate_Qty: row.OB_SDate_Qty !== undefined && row.OB_SDate_Qty !== null ? Number(row.OB_SDate_Qty) : undefined,
    Disc_Pct: discPct,
    Audit_Balance: row.Audit_Balance !== undefined && row.Audit_Balance !== null ? Number(row.Audit_Balance) : undefined,
    Manu_ID: row.Manu_ID !== undefined && row.Manu_ID !== null ? Number(row.Manu_ID) : undefined,

    // Calculated / Joined fields
    Store_Balance: storeBalance,
    Total_Balance: totalBalance,
    Retail_Discount: retailDiscount,
    Percentage: percentage,
    SaleRate: saleRate,
    SName: row.SName ? String(row.SName) : 'General Supplier',
    Post_Code: postCode,
    Supplier_Cate: supplierCate,
    Group_Name: row.Generic_Name || row.Category_Name || 'Standard Items',
  };
}

// Map database record to Supplier applying Crystal Report category formula
function mapRecordToSupplier(row: any): Supplier {
  const postCode = (row.Post_Code || '').trim();
  const supplierCate = row.Supplier_Cate || getSupplierCategory(postCode);

  return {
    Supplier_ID: Number(row.Supplier_ID),
    SName: String(row.SName || 'Unnamed Supplier'),
    Contact_Person: row.Contact_Person ? String(row.Contact_Person) : undefined,
    Contact_Person_Designation: row.Contact_Person_Designation ? String(row.Contact_Person_Designation) : undefined,
    Address: row.Address ? String(row.Address) : undefined,
    City: row.City ? String(row.City) : undefined,
    Post_Code: postCode,
    Supplier_Cate: supplierCate,
    StateOrProvince: row.StateOrProvince ? String(row.StateOrProvince) : undefined,
    Country: row.Country ? String(row.Country) : undefined,
    Phone: row.Phone ? String(row.Phone) : undefined,
    Email: row.Email ? String(row.Email) : undefined,
    Favorite: Boolean(row.Favorite),
    OB: row.OB ? Number(row.OB) : undefined,
    Retail_Discount: row.Retail_Discount !== undefined ? Number(row.Retail_Discount) : undefined,
    Wholesale_Discount: row.Wholesale_Discount !== undefined ? Number(row.Wholesale_Discount) : undefined,
  };
}

async function getSharedPool(config: sql.config): Promise<sql.ConnectionPool> {
  if (sharedPool?.connected) {
    return sharedPool;
  }

  if (!sharedPoolPromise) {
    sharedPoolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool) => {
        sharedPool = pool;
        return pool;
      })
      .catch((error) => {
        sharedPoolPromise = null;
        throw error;
      });
  }

  return sharedPoolPromise;
}

async function resetSharedPool(): Promise<void> {
  const pool = sharedPool;
  sharedPool = null;
  sharedPoolPromise = null;
  if (pool) {
    try {
      await pool.close();
    } catch {
      // Ignore close errors while recovering from a failed connection.
    }
  }
}

type DatabaseFetchResult = {
  medicines: MedicineItem[];
  suppliers: Supplier[];
  connected: boolean;
  error?: string;
};

// Fetch medicines and suppliers from SQL Server 2000 (Readonly).
// Default syncs share a pool and are single-flight so a timer and a manual
// refresh cannot open competing connections or duplicate expensive queries.
async function fetchMedicinesFromDatabase(customConfig?: sql.config): Promise<DatabaseFetchResult> {
  if (!customConfig && activeSyncPromise) {
    return activeSyncPromise;
  }

  const operation = fetchMedicinesFromDatabaseInternal(customConfig);
  if (customConfig) {
    return operation;
  }

  activeSyncPromise = operation;
  try {
    return await operation;
  } finally {
    activeSyncPromise = null;
  }
}

async function fetchMedicinesFromDatabaseInternal(
  customConfig?: sql.config,
  supplierName?: string,
): Promise<DatabaseFetchResult> {
  const config = customConfig || getSqlConfig();
  const normalizedSupplier = supplierName?.trim() || undefined;
  const fallbackMedicines = normalizedSupplier
    ? cachedMedicines.filter((medicine) => medicine.SName === normalizedSupplier)
    : cachedMedicines;

  // Guard for missing or default placeholder server when offline
  if (!config.server || config.server === 'localhost' && !process.env.DB_PASSWORD) {
    return {
      medicines: fallbackMedicines,
      suppliers: cachedSuppliers,
      connected: false,
      error: 'SQL Server configuration is missing. Set DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in .env.',
    };
  }

  let pool: sql.ConnectionPool | null = null;
  const usesSharedPool = !customConfig;
  try {
    pool = usesSharedPool ? await getSharedPool(config) : await new sql.ConnectionPool(config).connect();
    
    // Start both independent reads together. The medicine query is normally
    // the expensive one, so this removes the supplier query from its critical
    // path without changing either response or UI behavior.
    const suppliersQuery = normalizedSupplier
      ? Promise.resolve(null)
      : pool.request().query(`
        SELECT 
          Supplier_ID,
          SName,
          Contact_Person,
          Contact_Person_Designation,
          Address,
          City,
          Post_Code,
          StateOrProvince,
          Country,
          Phone,
          Email,
          Favorite,
          OB,
          Retail_Discount,
          Wholesale_Discount
        FROM Suppliers
        ORDER BY SName ASC
      `);
    const supplierFilter = normalizedSupplier ? 'WHERE s.SName = @supplier' : '';
    const viewSupplierFilter = normalizedSupplier ? 'WHERE SName = @supplier' : '';

    const createItemsRequest = () => {
      const request = pool!.request();
      if (normalizedSupplier) {
        request.input('supplier', sql.VarChar(255), normalizedSupplier);
      }
      return request;
    };

    // Query medicines: First attempt to query Items table joined with
    // qryStore_Item_Balance.
    let rows: any[] = [];
    try {
      const itemsQuery = `
        SELECT 
          i.Item_ID,
          i.Item_Name,
          i.Item_Code,
          i.Catagory_Id,
          i.Item_Type,
          i.Specimen,
          i.Rate,
          i.Making_Time,
          i.Purchase_Rate,
          i.Comments,
          i.Reorder_Level,
          i.Balance,
          i.VAT,
          i.Inv_Rep_Type,
          i.Generic_Name,
          i.Unit,
          i.Service_Charge,
          i.OB,
          i.OB_Date,
          i.Debit,
          i.Credit,
          i.Flexible_Rate,
          i.Barcode,
          i.Location,
          i.Expire_Date,
          i.Group_Test,
          i.Supplier_ID,
          i.Cost_Price,
          i.OB_Exp_Qty,
          i.OB_SDate_Qty,
          i.Disc_Pct,
          i.Audit_Balance,
          i.Manu_ID,
          s.SName,
          s.Post_Code,
          s.Retail_Discount,
          s.Wholesale_Discount,
          ISNULL(b.Store_Balance, 0) AS Store_Balance
        FROM dbo.Items i
        LEFT OUTER JOIN dbo.Suppliers s ON i.Supplier_ID = s.Supplier_ID
        LEFT OUTER JOIN dbo.qryStore_Item_Balance b ON i.Item_ID = b.Item_ID
           ${supplierFilter}
        ORDER BY s.SName, i.Item_Name
      `;
      const itemsResult = await createItemsRequest().query(itemsQuery);
      rows = itemsResult.recordset;
      console.log(`[SQL Server] Successfully read ${rows.length} records directly from Items table joined with qryStore_Item_Balance.`);
    } catch (itemsErr) {
      console.warn('[SQL Server] Query on Items with qryStore_Item_Balance view failed, trying direct subquery with qryStore_Transaction_Sum_Posted:', itemsErr);
      
      // Fallback 1: Calculate Store_Balance inline using the exact SQL from qryStore_Item_Balance:
      // SUM(ISNULL(dbo.qryStore_Transaction_Sum_Posted.Received_Qty_Sum - dbo.qryStore_Transaction_Sum_Posted.Delivered_Qty_Sum, 0)) AS Store_Balance
      try {
        const inlineStoreBalQuery = `
          SELECT 
            i.Item_ID,
            i.Item_Name,
            i.Item_Code,
            i.Catagory_Id,
            i.Item_Type,
            i.Specimen,
            i.Rate,
            i.Making_Time,
            i.Purchase_Rate,
            i.Comments,
            i.Reorder_Level,
            i.Balance,
            i.VAT,
            i.Inv_Rep_Type,
            i.Generic_Name,
            i.Unit,
            i.Service_Charge,
            i.OB,
            i.OB_Date,
            i.Debit,
            i.Credit,
            i.Flexible_Rate,
            i.Barcode,
            i.Location,
            i.Expire_Date,
            i.Group_Test,
            i.Supplier_ID,
            i.Cost_Price,
            i.OB_Exp_Qty,
            i.OB_SDate_Qty,
            i.Disc_Pct,
            i.Audit_Balance,
            i.Manu_ID,
            s.SName,
            s.Post_Code,
            s.Retail_Discount,
            s.Wholesale_Discount,
            ISNULL(st.Store_Balance, 0) AS Store_Balance
          FROM dbo.Items i
          LEFT OUTER JOIN dbo.Suppliers s ON i.Supplier_ID = s.Supplier_ID
          LEFT OUTER JOIN (
            SELECT 
              Item_ID,
              SUM(ISNULL(Received_Qty_Sum - Delivered_Qty_Sum, 0)) AS Store_Balance
            FROM dbo.qryStore_Transaction_Sum_Posted
            GROUP BY Item_ID
          ) st ON i.Item_ID = st.Item_ID
           ${supplierFilter}
          ORDER BY s.SName, i.Item_Name
        `;
         const inlineResult = await createItemsRequest().query(inlineStoreBalQuery);
        rows = inlineResult.recordset;
        console.log(`[SQL Server] Successfully calculated Store_Balance via qryStore_Transaction_Sum_Posted.`);
      } catch (inlineErr) {
        console.warn('[SQL Server] Inline store balance failed, trying qryMedicine view:', inlineErr);
        try {
           const qryResult = await createItemsRequest().query(
             `SELECT TOP 2000 * FROM qryMedicine ${viewSupplierFilter} ORDER BY SName, Item_Name`,
           );
          rows = qryResult.recordset;
        } catch (qryErr) {
          console.warn('[SQL Server] Query on qryMedicine failed, trying basic Items SELECT:', qryErr);
           const basicQuery = `
             SELECT TOP 2000 i.*, s.SName, s.Post_Code, s.Retail_Discount,
               s.Wholesale_Discount, 0 AS Store_Balance
             FROM dbo.Items i
             LEFT OUTER JOIN dbo.Suppliers s ON i.Supplier_ID = s.Supplier_ID
             ${supplierFilter}
             ORDER BY i.Item_Name
           `;
           const basicResult = await createItemsRequest().query(basicQuery);
          rows = basicResult.recordset;
        }
      }
    }

    // Resolve the supplier query after the medicine query has started so both
    // reads can use the already-open pool concurrently.
    try {
      const suppliersResult = await suppliersQuery;
      if (suppliersResult?.recordset && suppliersResult.recordset.length > 0) {
        cachedSuppliers = suppliersResult.recordset.map((r) => mapRecordToSupplier(r));
        console.log(`[SQL Server] Loaded ${cachedSuppliers.length} suppliers from Suppliers table.`);
      }
    } catch (suppErr) {
      console.warn('[SQL Server] Could not query Suppliers table directly, keeping cached suppliers:', suppErr);
    }

    if (rows && rows.length > 0) {
      const mapped = rows.map((r, i) => mapRecordToMedicine(r, i));
      if (!normalizedSupplier) {
        cachedMedicines = mapped;
      }
      lastSyncTime = new Date().toISOString();
      isConnectedToSql = true;
      connectionError = null;
      return { medicines: mapped, suppliers: cachedSuppliers, connected: true };
    } else {
      return { medicines: fallbackMedicines, suppliers: cachedSuppliers, connected: true };
    }
  } catch (err: any) {
    const errorMsg = err.message || 'Failed to connect to SQL Server 2000';
    isConnectedToSql = false;
    connectionError = errorMsg;
    if (usesSharedPool) {
      await resetSharedPool();
    }
    return {
      medicines: fallbackMedicines,
      suppliers: cachedSuppliers,
      connected: false,
      error: errorMsg,
    };
  } finally {
    if (pool && customConfig) {
      try {
        await pool.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

async function fetchSupplierMedicinesFromDatabase(supplierName: string): Promise<DatabaseFetchResult> {
  const normalizedSupplier = supplierName.trim();
  if (!normalizedSupplier) {
    return fetchMedicinesFromDatabase();
  }

  const existingSync = activeSupplierSyncs.get(normalizedSupplier);
  if (existingSync) {
    return existingSync;
  }

  const sync = fetchMedicinesFromDatabaseInternal(undefined, normalizedSupplier);
  activeSupplierSyncs.set(normalizedSupplier, sync);
  try {
    return await sync;
  } finally {
    activeSupplierSyncs.delete(normalizedSupplier);
  }
}

// Live stock sync every 5 minutes in background
setInterval(async () => {
  try {
    const result = await fetchMedicinesFromDatabase();
    if (result.connected) {
      console.log(`[Auto-Sync] Successfully synchronized ${result.medicines.length} medicines from SQL Server at ${new Date().toLocaleTimeString()}`);
    }
  } catch (err) {
    console.error('[Auto-Sync Error]:', err);
  }
}, 5 * 60 * 1000);

// Initial probe attempt on boot
fetchMedicinesFromDatabase().catch(() => {});

// --- API ROUTES ---

// Authentication uses its own UserAuthDB pool. It is intentionally mounted
// before the legacy routes so a failure in either database stays isolated.
app.use('/api', createAuthRouter());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// All operational data routes require a valid auth cookie. Health and auth
// endpoints remain public so the UI can establish and recover a session.
app.use('/api', requireAuth);
app.use('/api/settings', createPharmacySettingsRouter());

// Database status & sync info
app.get('/api/db-status', (req, res) => {
  const status: DatabaseStatus = {
    connected: isConnectedToSql,
    mode: isConnectedToSql ? 'mssql' : 'unavailable',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'PharmacyDB',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    lastSync: lastSyncTime,
    recordCount: cachedMedicines.length,
    errorMessage: connectionError || undefined,
  };
  res.json(status);
});

// List medicines with optional query filter. When a supplier is selected,
// refresh only that supplier from SQL instead of loading the full inventory.
app.get('/api/medicines', async (req, res) => {
  const query = String(req.query.q || '').toLowerCase();
  const category = String(req.query.category || '');
  const supplier = String(req.query.supplier || '');
  const lowStockOnly = req.query.lowStock === 'true';

  const source = supplier
    ? await fetchSupplierMedicinesFromDatabase(supplier)
    : {
        medicines: cachedMedicines,
        connected: isConnectedToSql,
      };
  let filtered = source.medicines;

  if (query) {
    filtered = filtered.filter(
      (m) =>
        m.Item_Name.toLowerCase().includes(query) ||
        (m.Item_Code && m.Item_Code.toLowerCase().includes(query)) ||
        (m.Generic_Name && m.Generic_Name.toLowerCase().includes(query)) ||
        m.SName.toLowerCase().includes(query)
    );
  }

  if (category) {
    filtered = filtered.filter((m) => m.Supplier_Cate === category);
  }

  if (supplier) {
    filtered = filtered.filter((m) => m.SName === supplier);
  }

  if (lowStockOnly) {
    filtered = filtered.filter((m) => m.Total_Balance <= m.Reorder_Level || m.Total_Balance === 0);
  }

  res.json({
    data: filtered,
    total: supplier ? source.medicines.length : cachedMedicines.length,
    filteredCount: filtered.length,
    lastSync: lastSyncTime,
    connected: source.connected,
  });
});

// List all suppliers from dbo.Suppliers with details
app.get('/api/suppliers', (req, res) => {
  // Count items per supplier from medicines cache
  const supplierCounts = new Map<string, number>();
  cachedMedicines.forEach((m) => {
    const s = m.SName || 'Unknown';
    supplierCounts.set(s, (supplierCounts.get(s) || 0) + 1);
  });

  const enrichedSuppliers = cachedSuppliers.map((s) => ({
    ...s,
    itemCount: supplierCounts.get(s.SName) || 0,
  }));

  res.json({
    data: enrichedSuppliers,
    total: enrichedSuppliers.length,
    connected: isConnectedToSql,
  });
});

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function dateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function localDateKey(date = new Date(), timeZone = REPORT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDateKey(value: string): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function millisecondsUntilNextLocalMidnight(): number {
  const now = Date.now();
  const currentDate = localDateKey(new Date(now));
  let upper = now + 24 * 60 * 60 * 1000;

  while (localDateKey(new Date(upper)) === currentDate && upper < now + 72 * 60 * 60 * 1000) {
    upper += 60 * 60 * 1000;
  }

  let lower = now;
  // Find the local date boundary without assuming the server's system timezone
  // or a fixed 24-hour day (DST can make a day 23 or 25 hours).
  for (let iteration = 0; iteration < 42; iteration += 1) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (localDateKey(new Date(midpoint)) === currentDate) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }
  return Math.max(1000, upper - now + 1000);
}

let automaticSummaryTimer: NodeJS.Timeout | null = null;
function scheduleAutomaticDailySummary(): void {
  if (automaticSummaryTimer) clearTimeout(automaticSummaryTimer);
  const delay = millisecondsUntilNextLocalMidnight();
  automaticSummaryTimer = setTimeout(async () => {
    const reportDate = previousDateKey(localDateKey());
    try {
      const report = await fetchAnalyticsFromDatabase(reportDate);
      const saved = await saveDailySummaryReport(report, null);
      console.log(`[Daily Summary] Automatically saved ${saved.date} to UserAuthDB (${REPORT_TIME_ZONE}).`);
    } catch (error: any) {
      // A failed midnight save must not stop the app or the next scheduled run.
      console.error(`[Daily Summary] Automatic save failed for ${reportDate}:`, error?.message || error);
    } finally {
      scheduleAutomaticDailySummary();
    }
  }, delay);
  automaticSummaryTimer.unref();
  console.log(`[Daily Summary] Next automatic save scheduled for ${new Date(Date.now() + delay).toISOString()} (${REPORT_TIME_ZONE}).`);
}

async function fetchAnalyticsFromDatabase(date: string): Promise<DashboardAnalytics> {
  const pool = await getSharedPool(getSqlConfig());
  // The legacy views expand one header record into one row per detail record.
  // Read the supplied header/detail tables directly so dashboard totals do not
  // multiply a purchase or expense when it has several line items.
  const purchaseTable = schemaObject('tables', 'Purchase');
  const purchaseSubTable = schemaObject('tables', 'Purchase_sub');
  const supplierTable = schemaObject('tables', 'Suppliers');
  const transactionTable = schemaObject('tables', 'transactions');
  const transactionParticularsTable = schemaObject('tables', 'transactions_particulars');
  const transactionPaymentsTable = schemaObject('tables', 'transactions_payments');
  const paymentModeTable = schemaObject('tables', 'Payment_Mode');
  const expenseTable = schemaObject('tables', 'Expense');
  const expenseSubTable = schemaObject('tables', 'Expense_Sub');
  const purchasePaymentsTable = schemaObject('tables', 'purchase_payments');
  const partyPaymentTable = schemaObject('tables', 'Party_Payment');
  const employeeTransactionTable = schemaObject('tables', 'Employee_Transaction');
  const expiryCashTable = schemaObject('tables', 'Medicine_Expiry_Cash_Transaction');

  const purchaseDate = schemaColumn('tables', 'Purchase', 'Date');
  const purchaseTime = schemaColumn('tables', 'Purchase', 'Time');
  const purchaseId = schemaColumn('tables', 'Purchase', 'Purchase_Id');
  const purchaseNo = schemaColumn('tables', 'Purchase', 'Purchase_No');
  const purchaseInvoice = schemaColumn('tables', 'Purchase', 'Invoicel_No');
  const purchaseAmount = schemaColumn('tables', 'Purchase', 'Total_Amount');
  const purchaseDiscount = schemaColumn('tables', 'Purchase', 'Discount');
  const purchaseVatAmount = schemaColumn('tables', 'Purchase', 'VAT_Amount');
  const purchasePosted = schemaColumn('tables', 'Purchase', 'Posted');
  const purchaseSupplierId = schemaColumn('tables', 'Purchase', 'Supplier_ID');
  const purchaseSubId = schemaColumn('tables', 'Purchase_sub', 'Purchase_ID');
  const purchaseSubRate = schemaColumn('tables', 'Purchase_sub', 'Rate');
  const purchaseSubQty = schemaColumn('tables', 'Purchase_sub', 'Qty');
  const purchaseSubAmount = schemaColumn('tables', 'Purchase_sub', 'Amount');
  const purchaseSubVatPct = schemaColumn('tables', 'Purchase_sub', 'Item_VAT_Pct');
  const purchaseSubVatAmount = schemaColumn('tables', 'Purchase_sub', 'Item_VAT_Amount');
  const purchaseSubDiscountPct = schemaColumn('tables', 'Purchase_sub', 'Item_Discount_Pct');
  const purchaseSubDiscountAmount = schemaColumn('tables', 'Purchase_sub', 'Item_Discount_Amount');
  const purchaseSubPosted = schemaColumn('tables', 'Purchase_sub', 'Posted');
  const supplierId = schemaColumn('tables', 'Suppliers', 'Supplier_ID');
  const supplierName = schemaColumn('tables', 'Suppliers', 'SName');

  const saleDate = schemaColumn('tables', 'transactions', 'entry_date');
  const saleTime = schemaColumn('tables', 'transactions', 'time');
  const saleId = schemaColumn('tables', 'transactions', 'trans_id');
  const saleMedicineBillNo = schemaColumn('tables', 'transactions', 'Medicine_Bill_no');
  const saleAmount = schemaColumn('tables', 'transactions', 'total_bill');
  const saleDiscount = schemaColumn('tables', 'transactions', 'discount');
  const saleTotalPaid = schemaColumn('tables', 'transactions', 'total_paid');
  const saleAmountPaid = schemaColumn('tables', 'transactions', 'Amount_Paid');
  const salePaymentMode = schemaColumn('tables', 'transactions', 'pay_mode');
  const saleUser = schemaColumn('tables', 'transactions', 'user_name');
  const saleCounter = schemaColumn('tables', 'transactions', 'computer_name');
  const salePosted = schemaColumn('tables', 'transactions', 'posted');
  const saleParticularsId = schemaColumn('tables', 'transactions_particulars', 'trans_id');
  const saleParticularsQty = schemaColumn('tables', 'transactions_particulars', 'qty');
  const saleParticularsAmount = schemaColumn('tables', 'transactions_particulars', 'amount');
  const saleParticularsDiscountPct = schemaColumn('tables', 'transactions_particulars', 'Item_Discount_Pct');
  const saleParticularsDiscountAmount = schemaColumn('tables', 'transactions_particulars', 'Item_Discount_Amount');
  const saleParticularsPosted = schemaColumn('tables', 'transactions_particulars', 'posted');
  const dueCollectionDate = schemaColumn('tables', 'transactions_payments', 'Date');
  const dueCollectionTime = schemaColumn('tables', 'transactions_payments', 'Time');
  const dueCollectionId = schemaColumn('tables', 'transactions_payments', 'T_Payment_ID');
  const dueCollectionAmount = schemaColumn('tables', 'transactions_payments', 'Amount');
  const dueCollectionTransId = schemaColumn('tables', 'transactions_payments', 'Trans_ID');
  const dueCollectionParticulars = schemaColumn('tables', 'transactions_payments', 'Particulars');
  const dueCollectionUserName = schemaColumn('tables', 'transactions_payments', 'UserName');
  const dueCollectionComputerName = schemaColumn('tables', 'transactions_payments', 'ComputerName');
  const dueCollectionPayMode = schemaColumn('tables', 'transactions_payments', 'Pay_Mode');
  const dueCollectionPayModeDetails = schemaColumn('tables', 'transactions_payments', 'Pay_Mode_Details');
  const dueCollectionPosted = schemaColumn('tables', 'transactions_payments', 'Posted');
  const paymentModeId = schemaColumn('tables', 'Payment_Mode', 'ID');
  const paymentModeName = schemaColumn('tables', 'Payment_Mode', 'Name');

  const expenseDate = schemaColumn('tables', 'Expense', 'Date');
  const expenseTime = schemaColumn('tables', 'Expense', 'Time');
  const expenseId = schemaColumn('tables', 'Expense', 'Exp_ID');
  const expenseVoucher = schemaColumn('tables', 'Expense', 'Exp_Vouvher_No');
  const expenseAmount = schemaColumn('tables', 'Expense', 'Total_Exp');
  const expenseRemark = schemaColumn('tables', 'Expense', 'Exp_Remark');
  const expensePosted = schemaColumn('tables', 'Expense', 'Posted');
  const expenseSubId = schemaColumn('tables', 'Expense_Sub', 'Exp_ID');
  const expenseHead = schemaColumn('tables', 'Expense_Sub', 'Exp_Head');
  const expenseSubPosted = schemaColumn('tables', 'Expense_Sub', 'Posted');
  const purchasePaymentDate = schemaColumn('tables', 'purchase_payments', 'Date');
  const purchasePaymentAmount = schemaColumn('tables', 'purchase_payments', 'Amount');
  const purchasePaymentPosted = schemaColumn('tables', 'purchase_payments', 'Posted');
  const partyPaymentDate = schemaColumn('tables', 'Party_Payment', 'Date');
  const partyPaymentAmount = schemaColumn('tables', 'Party_Payment', 'Amount');
  const partyPaymentPosted = schemaColumn('tables', 'Party_Payment', 'Posted');
  const employeeTransactionDate = schemaColumn('tables', 'Employee_Transaction', 'Date');
  const employeeTransactionAmount = schemaColumn('tables', 'Employee_Transaction', 'Amount');
  const expiryCashDate = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Date');
  const expiryCashAmount = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Amount');
  const [
    purchaseResult,
    salesResult,
    expenseResult,
    dueCollectionResult,
    purchasePaymentResult,
    partyPaymentResult,
    employeePaymentResult,
    expiryCashAdjustmentResult,
  ] = await Promise.all([
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
        p.${purchaseDate} AS entry_date,
        p.${purchaseTime} AS entry_time,
        p.${purchaseId} AS purchase_id,
        p.${purchaseNo} AS purchase_no,
        p.${purchaseInvoice} AS invoice_no,
         ISNULL(ps.invoice_amount, ISNULL(p.${purchaseAmount}, 0))
           + ISNULL(p.${purchaseVatAmount}, 0)
           - ISNULL(p.${purchaseDiscount}, 0) AS amount,
        s.${supplierName} AS supplier,
        ISNULL(ps.items, 0) AS items
       FROM ${purchaseTable} p
       LEFT OUTER JOIN ${supplierTable} s
         ON p.${purchaseSupplierId} = s.${supplierId}
       LEFT OUTER JOIN (
          SELECT
            ${purchaseSubId} AS purchase_id,
            SUM(ISNULL(${purchaseSubQty}, 0)) AS items,
            SUM(
              ISNULL(${purchaseSubAmount}, 0)
              + CASE
                  WHEN ISNULL(${purchaseSubVatAmount}, 0) = 0
                    THEN ISNULL(${purchaseSubVatPct}, 0) / 100 * ISNULL(${purchaseSubRate}, 0) * ISNULL(${purchaseSubQty}, 0)
                  ELSE ISNULL(${purchaseSubVatAmount}, 0)
                END
              - (
                  ISNULL(${purchaseSubDiscountPct}, 0) / 100 * ISNULL(${purchaseSubRate}, 0) * ISNULL(${purchaseSubQty}, 0)
                  + ISNULL(${purchaseSubDiscountAmount}, 0)
                )
            ) AS invoice_amount
         FROM ${purchaseSubTable}
         WHERE ${purchaseSubPosted} = 1
         GROUP BY ${purchaseSubId}
       ) ps ON p.${purchaseId} = ps.purchase_id
       WHERE CONVERT(varchar(10), p.${purchaseDate}, 120) = @date
         AND ISNULL(p.${purchasePosted}, 0) = 1
       ORDER BY p.${purchaseDate} DESC, p.${purchaseTime} DESC, p.${purchaseId} DESC`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
        t.${saleDate} AS entry_date,
        t.${saleTime} AS entry_time,
        t.${saleId} AS trans_id,
        t.${saleMedicineBillNo} AS medicine_bill_no,
         ISNULL(tp.gross_amount, ISNULL(t.${saleAmount}, 0))
           - ISNULL(tp.item_discount, 0)
           - ISNULL(t.${saleDiscount}, 0) AS net_payable,
        ISNULL(t.${saleTotalPaid}, t.${saleAmountPaid}) AS paid_after_discount,
        t.${salePaymentMode} AS pay_mode,
        pm.${paymentModeName} AS payment_mode_name,
        t.${saleUser} AS user_name,
        t.${saleCounter} AS computer_name,
        ISNULL(tp.items, 0) AS items
       FROM ${transactionTable} t
       LEFT OUTER JOIN ${paymentModeTable} pm
         ON t.${salePaymentMode} = pm.${paymentModeId}
       LEFT OUTER JOIN (
          SELECT
            ${saleParticularsId} AS trans_id,
            SUM(ISNULL(${saleParticularsQty}, 0)) AS items,
            SUM(ISNULL(${saleParticularsAmount}, 0)) AS gross_amount,
            SUM(
              (ISNULL(${saleParticularsAmount}, 0) * ISNULL(${saleParticularsDiscountPct}, 0) / 100)
              + ISNULL(${saleParticularsDiscountAmount}, 0)
            ) AS item_discount
         FROM ${transactionParticularsTable}
         WHERE ${saleParticularsPosted} = 1
         GROUP BY ${saleParticularsId}
       ) tp ON t.${saleId} = tp.trans_id
       WHERE CONVERT(varchar(10), t.${saleDate}, 120) = @date
         AND ISNULL(t.${salePosted}, 0) = 1
       ORDER BY t.${saleDate} DESC, t.${saleTime} DESC, t.${saleId} DESC`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
        e.${expenseDate} AS entry_date,
        e.${expenseTime} AS entry_time,
        e.${expenseId} AS exp_id,
        e.${expenseVoucher} AS voucher,
        e.${expenseAmount} AS amount,
        e.${expenseRemark} AS remark,
        es.exp_head AS exp_head
       FROM ${expenseTable} e
       LEFT OUTER JOIN (
         SELECT ${expenseSubId} AS exp_id, MIN(${expenseHead}) AS exp_head
         FROM ${expenseSubTable}
         WHERE ${expenseSubPosted} = 1
         GROUP BY ${expenseSubId}
       ) es ON e.${expenseId} = es.exp_id
       WHERE CONVERT(varchar(10), e.${expenseDate}, 120) = @date
         AND ISNULL(e.${expensePosted}, 0) = 1
       ORDER BY e.${expenseDate} DESC, e.${expenseTime} DESC, e.${expenseId} DESC`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
         p.${dueCollectionId} AS payment_id,
         p.${dueCollectionTime} AS payment_time,
         p.${dueCollectionAmount} AS amount,
         p.${dueCollectionParticulars} AS particulars,
         p.${dueCollectionUserName} AS user_name,
         p.${dueCollectionComputerName} AS computer_name,
         p.${dueCollectionPayMode} AS pay_mode,
         p.${dueCollectionPayModeDetails} AS pay_mode_details,
         t.${saleMedicineBillNo} AS medicine_bill_no,
         pm.${paymentModeName} AS payment_mode_name
       FROM ${transactionPaymentsTable} p
       LEFT OUTER JOIN ${transactionTable} t
         ON p.${dueCollectionTransId} = t.${saleId}
       LEFT OUTER JOIN ${paymentModeTable} pm
         ON p.${dueCollectionPayMode} = pm.${paymentModeId}
       WHERE CONVERT(varchar(10), p.${dueCollectionDate}, 120) = @date
         AND ISNULL(p.${dueCollectionPosted}, 0) = 1
       ORDER BY p.${dueCollectionDate} DESC, p.${dueCollectionTime} DESC, p.${dueCollectionId} DESC`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
         COUNT(*) AS transactions,
         SUM(ISNULL(p.${purchasePaymentAmount}, 0)) AS amount
       FROM ${purchasePaymentsTable} p
       WHERE CONVERT(varchar(10), p.${purchasePaymentDate}, 120) = @date
         AND ISNULL(p.${purchasePaymentPosted}, 0) = 1`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
         COUNT(*) AS transactions,
         SUM(ISNULL(p.${partyPaymentAmount}, 0)) AS amount
       FROM ${partyPaymentTable} p
       WHERE CONVERT(varchar(10), p.${partyPaymentDate}, 120) = @date
         AND ISNULL(p.${partyPaymentPosted}, 0) = 1`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
         COUNT(*) AS transactions,
         SUM(ISNULL(e.${employeeTransactionAmount}, 0)) AS amount
       FROM ${employeeTransactionTable} e
       WHERE CONVERT(varchar(10), e.${employeeTransactionDate}, 120) = @date`,
    ),
    pool.request().input('date', sql.VarChar(10), date).query(
      `SELECT
          COUNT(*) AS transactions,
          SUM(ISNULL(e.${expiryCashAmount}, 0)) AS amount
        FROM ${expiryCashTable} e
        WHERE CONVERT(varchar(10), e.${expiryCashDate}, 120) = @date`,
    ),
  ]);
  const purchases: DashboardAnalytics['purchases'] = purchaseResult.recordset.map((row, index) => ({
    id: row.purchase_id ?? index,
    time: String(row.entry_time || ''),
    invoice: String(row.invoice_no || row.purchase_no || row.purchase_id || '—'),
    supplier: String(row.supplier || 'Unknown supplier'),
    amount: money(row.amount),
    items: Number(row.items || 0),
    status: 'Posted',
  }));
  const sales: DashboardAnalytics['sales'] = salesResult.recordset.map((row, index) => ({
    id: row.trans_id ?? index,
    time: String(row.entry_time || ''),
    medicineBillNo: row.medicine_bill_no === null || row.medicine_bill_no === undefined
      ? '—'
      : String(row.medicine_bill_no),
    amount: money(row.net_payable),
    due: money(Math.abs(money(row.net_payable) - money(row.paid_after_discount))),
    items: Number(row.items || 0),
    employee: String(row.user_name || 'Unassigned'),
    counter: String(row.computer_name || 'Main counter'),
    payment: String(row.payment_mode_name || (row.pay_mode === null || row.pay_mode === undefined ? 'Recorded' : `Mode ${row.pay_mode}`)),
  }));
  const expenses: DashboardAnalytics['expenses'] = expenseResult.recordset.map((row, index) => ({
    id: row.exp_id ?? index,
    head: String(row.exp_head || 'General'),
    voucher: String(row.voucher || '—'),
    amount: money(row.amount),
    remark: String(row.remark || ''),
    time: String(row.entry_time || ''),
  }));
  const dueCollections: DashboardAnalytics['dueCollections'] = dueCollectionResult.recordset.map((row, index) => ({
    id: row.payment_id ?? index,
    time: String(row.payment_time || ''),
    medicineBillNo: row.medicine_bill_no === null || row.medicine_bill_no === undefined
      ? '—'
      : String(row.medicine_bill_no),
    amount: money(row.amount),
    paymentMode: String(row.payment_mode_name || row.pay_mode_details || (row.pay_mode === null || row.pay_mode === undefined ? 'Recorded' : `Mode ${row.pay_mode}`)),
    particulars: String(row.particulars || 'Due bill payment'),
    userName: String(row.user_name || 'Unassigned'),
    computerName: String(row.computer_name || 'Main counter'),
  }));
  const paidAfterDiscount = salesResult.recordset.reduce(
    (sum, row) => sum + Math.min(money(row.net_payable), money(row.paid_after_discount)),
    0,
  );
  const dueCollection = money(dueCollections.reduce((sum, item) => sum + item.amount, 0));
  const purchasePaymentRow = purchasePaymentResult.recordset[0] || {};
  const partyPaymentRow = partyPaymentResult.recordset[0] || {};
  const employeePaymentRow = employeePaymentResult.recordset[0] || {};
  const expiryCashAdjustmentRow = expiryCashAdjustmentResult.recordset[0] || {};
  const expiryCashAdjustmentAmount = money(expiryCashAdjustmentRow.amount);
  const totalCollection = money(paidAfterDiscount + dueCollection + expiryCashAdjustmentAmount);
  const supplierPaymentAmount = money(Number(purchasePaymentRow.amount || 0) + Number(partyPaymentRow.amount || 0));
  const supplierPaymentTransactions = Number(purchasePaymentRow.transactions || 0) + Number(partyPaymentRow.transactions || 0);
  const groupBy = (rows: DashboardAnalytics['sales'], key: 'employee' | 'counter') => {
    const result = new Map<string, { transactions: number; amount: number }>();
    rows.forEach((row) => {
      const name = row[key] || 'Unassigned';
      const current = result.get(name) || { transactions: 0, amount: 0 };
      current.transactions += 1;
      current.amount += row.amount;
      result.set(name, current);
    });
    return Array.from(result, ([name, values]) => ({ name, ...values })).sort((a, b) => b.amount - a.amount);
  };
  return {
    generatedAt: new Date().toISOString(),
    date,
    dailyPurchase: {
      amount: purchases.reduce((sum, item) => sum + item.amount, 0),
      transactions: purchases.length,
      items: purchases.reduce((sum, item) => sum + item.items, 0),
    },
    liveSales: {
      amount: sales.reduce((sum, item) => sum + item.amount, 0),
      transactions: sales.length,
      items: sales.reduce((sum, item) => sum + item.items, 0),
    },
    paidAfterDiscount,
    dueCollection,
    totalCollection,
    supplierPayment: { amount: supplierPaymentAmount, transactions: supplierPaymentTransactions },
    employeePayment: {
      amount: money(employeePaymentRow.amount),
      transactions: Number(employeePaymentRow.transactions || 0),
    },
    expiryCashAdjustment: {
      amount: expiryCashAdjustmentAmount,
      transactions: Number(expiryCashAdjustmentRow.transactions || 0),
    },
    inventory: { items: cachedMedicines.length, units: cachedMedicines.reduce((sum, item) => sum + item.Total_Balance, 0), valuation: cachedMedicines.reduce((sum, item) => sum + item.Total_Balance * item.Cost_Price, 0) },
    expensesTotal: expenses.reduce((sum, item) => sum + item.amount, 0),
    purchases,
    sales,
    employees: groupBy(sales, 'employee'),
    counters: groupBy(sales, 'counter'),
    expenses,
    dueCollections,
  };
}

app.get('/api/analytics', async (req, res) => {
  try {
    const requestedDate = String(req.query.date || dateKey());
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : dateKey();
    res.json(await fetchAnalyticsFromDatabase(date));
  } catch (error: any) {
    res.status(503).json({ error: error.message || 'Analytics unavailable' });
  }
});

app.get('/api/expiry-cash-adjustments', async (req, res) => {
  const requestedDate = String(req.query.date || dateKey());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    res.status(400).json({ error: 'A valid adjustment date is required.' });
    return;
  }

  try {
    const pool = await getSharedPool(getSqlConfig());
    const adjustmentTable = schemaObject('tables', 'Medicine_Expiry_Cash_Transaction');
    const supplierTable = schemaObject('tables', 'Suppliers');
    const adjustmentId = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Exp_Cash_Trans_ID');
    const adjustmentDate = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Date');
    const adjustmentTime = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Time');
    const adjustmentSupplierId = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Supplier_ID');
    const adjustmentAmount = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Amount');
    const adjustmentRemark = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Remark');
    const adjustmentUserName = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'User_Name');
    const adjustmentComputerName = schemaColumn('tables', 'Medicine_Expiry_Cash_Transaction', 'Computer_Name');
    const supplierId = schemaColumn('tables', 'Suppliers', 'Supplier_ID');
    const supplierName = schemaColumn('tables', 'Suppliers', 'SName');
    const result = await pool.request()
      .input('date', sql.VarChar(10), requestedDate)
      .query(
        `SELECT
          a.${adjustmentId} AS adjustment_id,
          CONVERT(varchar(10), a.${adjustmentDate}, 120) AS adjustment_date,
          a.${adjustmentTime} AS adjustment_time,
          a.${adjustmentSupplierId} AS supplier_id,
          s.${supplierName} AS supplier_name,
          a.${adjustmentAmount} AS amount,
          a.${adjustmentRemark} AS remark,
          a.${adjustmentUserName} AS user_name,
          a.${adjustmentComputerName} AS computer_name
         FROM ${adjustmentTable} a
         LEFT OUTER JOIN ${supplierTable} s
           ON a.${adjustmentSupplierId} = s.${supplierId}
         WHERE CONVERT(varchar(10), a.${adjustmentDate}, 120) = @date
         ORDER BY a.${adjustmentDate} DESC, a.${adjustmentTime} DESC, a.${adjustmentId} DESC`,
      );
    const records = result.recordset.map((row) => ({
      id: Number(row.adjustment_id),
      date: String(row.adjustment_date || requestedDate),
      time: String(row.adjustment_time || ''),
      supplierId: Number(row.supplier_id),
      supplierName: String(row.supplier_name || 'Unknown supplier'),
      amount: money(row.amount),
      remark: String(row.remark || ''),
      userName: String(row.user_name || ''),
      computerName: String(row.computer_name || ''),
    }));
    res.json({
      date: requestedDate,
      total: money(records.reduce((sum, record) => sum + record.amount, 0)),
      transactions: records.length,
      records,
    });
  } catch (error: any) {
    console.error('[Expiry cash adjustments error]', error?.message || error);
    res.status(503).json({ error: 'Expiry cash adjustments could not be loaded from SQL Server.' });
  }
});

app.get('/api/payment-details', async (req, res) => {
  const kind = String(req.query.kind || '');
  const requestedDate = String(req.query.date || dateKey());
  if (kind !== 'supplier' && kind !== 'employee') {
    res.status(400).json({ error: 'A valid payment type is required.' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    res.status(400).json({ error: 'A valid payment date is required.' });
    return;
  }

  try {
    const pool = await getSharedPool(getSqlConfig());
    const paymentModeTable = schemaObject('tables', 'Payment_Mode');
    const paymentModeId = schemaColumn('tables', 'Payment_Mode', 'ID');
    const paymentModeName = schemaColumn('tables', 'Payment_Mode', 'Name');
    const date = requestedDate;
    let result: sql.IResult<any>;

    if (kind === 'supplier') {
      const purchasePaymentsTable = schemaObject('tables', 'purchase_payments');
      const partyPaymentTable = schemaObject('tables', 'Party_Payment');
      const purchaseTable = schemaObject('tables', 'Purchase');
      const supplierTable = schemaObject('tables', 'Suppliers');
      const purchasePaymentDate = schemaColumn('tables', 'purchase_payments', 'Date');
      const purchasePaymentTime = schemaColumn('tables', 'purchase_payments', 'Time');
      const purchasePaymentId = schemaColumn('tables', 'purchase_payments', 'P_Payment_ID');
      const purchasePaymentAmount = schemaColumn('tables', 'purchase_payments', 'Amount');
      const purchasePaymentPurchaseId = schemaColumn('tables', 'purchase_payments', 'Purchase_Id');
      const purchasePaymentPosted = schemaColumn('tables', 'purchase_payments', 'Posted');
      const purchasePaymentParticulars = schemaColumn('tables', 'purchase_payments', 'Particulars');
      const purchasePaymentUserName = schemaColumn('tables', 'purchase_payments', 'UserName');
      const purchasePaymentComputerName = schemaColumn('tables', 'purchase_payments', 'ComputerName');
      const purchasePaymentMode = schemaColumn('tables', 'purchase_payments', 'Pay_Mode');
      const purchasePaymentModeDetails = schemaColumn('tables', 'purchase_payments', 'Pay_Mode_Details');
      const purchaseId = schemaColumn('tables', 'Purchase', 'Purchase_Id');
      const purchaseNo = schemaColumn('tables', 'Purchase', 'Purchase_No');
      const purchaseInvoice = schemaColumn('tables', 'Purchase', 'Invoicel_No');
      const purchaseSupplierId = schemaColumn('tables', 'Purchase', 'Supplier_ID');
      const supplierId = schemaColumn('tables', 'Suppliers', 'Supplier_ID');
      const supplierName = schemaColumn('tables', 'Suppliers', 'SName');
      const partyPaymentDate = schemaColumn('tables', 'Party_Payment', 'Date');
      const partyPaymentTime = schemaColumn('tables', 'Party_Payment', 'Time');
      const partyPaymentId = schemaColumn('tables', 'Party_Payment', 'Payment_ID');
      const partyPaymentPartyId = schemaColumn('tables', 'Party_Payment', 'Party_ID');
      const partyPaymentAmount = schemaColumn('tables', 'Party_Payment', 'Amount');
      const partyPaymentPosted = schemaColumn('tables', 'Party_Payment', 'Posted');
      const partyPaymentParticulars = schemaColumn('tables', 'Party_Payment', 'Particulars');
      const partyPaymentUserName = schemaColumn('tables', 'Party_Payment', 'Username');
      const partyPaymentComputerName = schemaColumn('tables', 'Party_Payment', 'Computer_Name');
      const partyPaymentMode = schemaColumn('tables', 'Party_Payment', 'Pay_Mode_ID');
      const partyPaymentModeDetails = schemaColumn('tables', 'Party_Payment', 'Pay_Mode_Detail');
      const partyPaymentBillNo = schemaColumn('tables', 'Party_Payment', 'PP_Bill_No');

      result = await pool.request().input('date', sql.VarChar(10), date).query(
        `SELECT * FROM (
          SELECT
            'purchase-' + CONVERT(varchar(50), p.${purchasePaymentId}) AS payment_id,
            p.${purchasePaymentTime} AS payment_time,
            'Purchase payment' AS category,
            COALESCE(
              CONVERT(varchar(50), h.${purchaseInvoice}),
              CONVERT(varchar(50), h.${purchaseNo}),
              CONVERT(varchar(50), h.${purchaseId})
            ) AS reference,
            ISNULL(s.${supplierName}, 'Unknown supplier') AS counterparty,
            COALESCE(pm.${paymentModeName}, p.${purchasePaymentModeDetails},
              CASE WHEN p.${purchasePaymentMode} IS NULL THEN 'Recorded'
                   ELSE 'Mode ' + CONVERT(varchar(20), p.${purchasePaymentMode}) END) AS payment_mode,
            ISNULL(p.${purchasePaymentParticulars}, '') AS particulars,
            ISNULL(p.${purchasePaymentUserName}, '') AS user_name,
            ISNULL(p.${purchasePaymentComputerName}, '') AS computer_name,
            ISNULL(p.${purchasePaymentAmount}, 0) AS amount,
            p.${purchasePaymentDate} AS payment_date
          FROM ${purchasePaymentsTable} p
          LEFT OUTER JOIN ${purchaseTable} h
            ON p.${purchasePaymentPurchaseId} = h.${purchaseId}
          LEFT OUTER JOIN ${supplierTable} s
            ON h.${purchaseSupplierId} = s.${supplierId}
          LEFT OUTER JOIN ${paymentModeTable} pm
            ON p.${purchasePaymentMode} = pm.${paymentModeId}
          WHERE CONVERT(varchar(10), p.${purchasePaymentDate}, 120) = @date
            AND ISNULL(p.${purchasePaymentPosted}, 0) = 1

          UNION ALL

          SELECT
            'party-' + CONVERT(varchar(50), p.${partyPaymentId}) AS payment_id,
            p.${partyPaymentTime} AS payment_time,
            'Party payment' AS category,
            COALESCE(CONVERT(varchar(50), p.${partyPaymentBillNo}),
              CONVERT(varchar(50), p.${partyPaymentPartyId})) AS reference,
            COALESCE(
              NULLIF(LTRIM(RTRIM(s.${supplierName})), ''),
              CASE WHEN p.${partyPaymentPartyId} IS NULL THEN 'Party'
                ELSE 'Party ' + CONVERT(varchar(50), p.${partyPaymentPartyId}) END
            ) AS counterparty,
            COALESCE(pm.${paymentModeName}, p.${partyPaymentModeDetails},
              CASE WHEN p.${partyPaymentMode} IS NULL THEN 'Recorded'
                   ELSE 'Mode ' + CONVERT(varchar(20), p.${partyPaymentMode}) END) AS payment_mode,
            ISNULL(p.${partyPaymentParticulars}, '') AS particulars,
            ISNULL(p.${partyPaymentUserName}, '') AS user_name,
            ISNULL(p.${partyPaymentComputerName}, '') AS computer_name,
            ISNULL(p.${partyPaymentAmount}, 0) AS amount,
            p.${partyPaymentDate} AS payment_date
          FROM ${partyPaymentTable} p
          LEFT OUTER JOIN ${supplierTable} s
            ON p.${partyPaymentPartyId} = s.${supplierId}
          LEFT OUTER JOIN ${paymentModeTable} pm
            ON p.${partyPaymentMode} = pm.${paymentModeId}
          WHERE CONVERT(varchar(10), p.${partyPaymentDate}, 120) = @date
            AND ISNULL(p.${partyPaymentPosted}, 0) = 1
        ) payments
        ORDER BY payment_date DESC, payment_time DESC, payment_id DESC`,
      );
    } else {
      const employeeTransactionTable = schemaObject('tables', 'Employee_Transaction');
      const employeeTable = schemaObject('tables', 'Employee');
      const employeeDate = schemaColumn('tables', 'Employee_Transaction', 'Date');
      const employeeTime = schemaColumn('tables', 'Employee_Transaction', 'Time');
      const employeeTransactionId = schemaColumn('tables', 'Employee_Transaction', 'EL_ID');
      const employeeId = schemaColumn('tables', 'Employee_Transaction', 'E_ID');
      const employeeAmount = schemaColumn('tables', 'Employee_Transaction', 'Amount');
      const employeeParticular = schemaColumn('tables', 'Employee_Transaction', 'Particular');
      const employeeUserName = schemaColumn('tables', 'Employee_Transaction', 'UserName');
      const employeeComputerName = schemaColumn('tables', 'Employee_Transaction', 'ComputerName');
      const employeePaymentMode = schemaColumn('tables', 'Employee_Transaction', 'Pay_Mode_ID');
      const employeePaymentModeDetail = schemaColumn('tables', 'Employee_Transaction', 'Pay_Mode_Detail');
      const employeeMasterId = schemaColumn('tables', 'Employee', 'Eid');
      const employeeName = schemaColumn('tables', 'Employee', 'Name');

      result = await pool.request().input('date', sql.VarChar(10), date).query(
        `SELECT
          e.${employeeTransactionId} AS payment_id,
          e.${employeeTime} AS payment_time,
          'Employee payment' AS category,
          CONVERT(varchar(50), e.${employeeTransactionId}) AS reference,
          ISNULL(emp.${employeeName}, 'Unknown employee') AS counterparty,
          COALESCE(pm.${paymentModeName}, e.${employeePaymentModeDetail},
            CASE WHEN e.${employeePaymentMode} IS NULL THEN 'Recorded'
                 ELSE 'Mode ' + CONVERT(varchar(20), e.${employeePaymentMode}) END) AS payment_mode,
          ISNULL(e.${employeeParticular}, '') AS particulars,
          ISNULL(e.${employeeUserName}, '') AS user_name,
          ISNULL(e.${employeeComputerName}, '') AS computer_name,
          ISNULL(e.${employeeAmount}, 0) AS amount,
          e.${employeeDate} AS payment_date
        FROM ${employeeTransactionTable} e
        LEFT OUTER JOIN ${employeeTable} emp
          ON e.${employeeId} = emp.${employeeMasterId}
        LEFT OUTER JOIN ${paymentModeTable} pm
          ON e.${employeePaymentMode} = pm.${paymentModeId}
        WHERE CONVERT(varchar(10), e.${employeeDate}, 120) = @date
        ORDER BY e.${employeeDate} DESC, e.${employeeTime} DESC, e.${employeeTransactionId} DESC`,
      );
    }

    const records = result.recordset.map((row, index) => ({
      id: row.payment_id ?? index,
      time: String(row.payment_time || ''),
      category: String(row.category || ''),
      reference: String(row.reference || '—'),
      counterparty: String(row.counterparty || '—'),
      paymentMode: String(row.payment_mode || 'Recorded'),
      particulars: String(row.particulars || ''),
      userName: String(row.user_name || '—'),
      computerName: String(row.computer_name || '—'),
      amount: money(row.amount),
    }));
    res.json({
      date,
      total: money(records.reduce((sum, record) => sum + record.amount, 0)),
      transactions: records.length,
      records,
    });
  } catch (error: any) {
    res.status(503).json({ error: error.message || 'Payment details are unavailable.' });
  }
});

app.post('/api/reports/daily-summary', async (req, res) => {
  const requestedDate = String(req.body?.date || dateKey());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    res.status(400).json({ error: 'A valid report date is required.' });
    return;
  }

  try {
    // Recalculate on the server so a browser cannot alter the saved totals.
    const report = await fetchAnalyticsFromDatabase(requestedDate);
    const userId = Number(res.locals.authUser?.id);
    const saved = await saveDailySummaryReport(report, Number.isInteger(userId) ? userId : null);
    res.status(201).json({ success: true, report: saved });
  } catch (error: any) {
    console.error('[Daily summary save error]', error?.message || error);
    res.status(503).json({ error: 'Daily summary could not be saved. Check the SQL Server connections and report table.' });
  }
});

app.get('/api/reports/analytics', async (req, res) => {
  const requestedView = String(req.query.view || 'monthly');
  if (!['daily', 'monthly', 'yearly'].includes(requestedView)) {
    res.status(400).json({ error: 'Report view must be daily, monthly, or yearly.' });
    return;
  }
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const date = String(req.query.date || '');
  const compare = req.query.compare === 'true';
  if (req.query.year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 2200)) {
    res.status(400).json({ error: 'A valid report year is required.' });
    return;
  }
  if (req.query.month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    res.status(400).json({ error: 'A valid report month is required.' });
    return;
  }
  if (req.query.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'A valid report date is required.' });
    return;
  }

  try {
    const report = await getHistoricalReport({
      view: requestedView as 'daily' | 'monthly' | 'yearly',
      year: Number.isInteger(year) ? year : new Date().getUTCFullYear(),
      month: Number.isInteger(month) ? month : undefined,
      date: date || undefined,
      compare,
    });
    res.json(report);
  } catch (error: any) {
    console.error('[Historical report error]', error?.message || error);
    res.status(503).json({ error: 'Historical analytics are unavailable. Check the UserAuthDB report table.' });
  }
});

app.get('/api/sales/:id/receipt', async (req, res) => {
  const transactionId = Number(req.params.id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    res.status(400).json({ error: 'A valid transaction id is required' });
    return;
  }

  try {
    const pool = await getSharedPool(getSqlConfig());
    const transactionTable = schemaObject('tables', 'transactions');
    const transactionParticularsTable = schemaObject('tables', 'transactions_particulars');
    const paymentModeTable = schemaObject('tables', 'Payment_Mode');
    const saleId = schemaColumn('tables', 'transactions', 'trans_id');
    const saleDate = schemaColumn('tables', 'transactions', 'entry_date');
    const saleTime = schemaColumn('tables', 'transactions', 'time');
    const saleMedicineBillNo = schemaColumn('tables', 'transactions', 'Medicine_Bill_no');
    const salePatientName = schemaColumn('tables', 'transactions', 'Patient_Name');
    const saleTotalBill = schemaColumn('tables', 'transactions', 'total_bill');
    const saleTotalPaid = schemaColumn('tables', 'transactions', 'total_paid');
    const saleAmountPaid = schemaColumn('tables', 'transactions', 'Amount_Paid');
    const saleDiscount = schemaColumn('tables', 'transactions', 'discount');
    const salePaymentMode = schemaColumn('tables', 'transactions', 'pay_mode');
    const saleUser = schemaColumn('tables', 'transactions', 'user_name');
    const saleCounter = schemaColumn('tables', 'transactions', 'computer_name');
    const salePosted = schemaColumn('tables', 'transactions', 'posted');
    const paymentModeId = schemaColumn('tables', 'Payment_Mode', 'ID');
    const paymentModeName = schemaColumn('tables', 'Payment_Mode', 'Name');
    const particularsId = schemaColumn('tables', 'transactions_particulars', 'trans_sub_id');
    const particularsTransactionId = schemaColumn('tables', 'transactions_particulars', 'trans_id');
    const particularsItems = schemaColumn('tables', 'transactions_particulars', 'items');
    const particularsRate = schemaColumn('tables', 'transactions_particulars', 'rate');
    const particularsQty = schemaColumn('tables', 'transactions_particulars', 'qty');
    const particularsAmount = schemaColumn('tables', 'transactions_particulars', 'amount');
    const particularsDiscountPct = schemaColumn('tables', 'transactions_particulars', 'Item_Discount_Pct');
    const particularsDiscountAmount = schemaColumn('tables', 'transactions_particulars', 'Item_Discount_Amount');
    const particularsPosted = schemaColumn('tables', 'transactions_particulars', 'posted');

    const result = await pool.request()
      .input('transactionId', sql.Int, transactionId)
      .query(
        `SELECT
          t.${saleId} AS trans_id,
          t.${saleDate} AS entry_date,
          t.${saleTime} AS entry_time,
          t.${saleMedicineBillNo} AS medicine_bill_no,
          t.${salePatientName} AS patient_name,
          t.${saleTotalBill} AS total_bill,
          ISNULL(t.${saleTotalPaid}, t.${saleAmountPaid}) AS total_paid,
          t.${saleDiscount} AS bill_discount,
          t.${salePaymentMode} AS pay_mode,
          pm.${paymentModeName} AS payment_mode_name,
          t.${saleUser} AS user_name,
          t.${saleCounter} AS computer_name,
          tp.${particularsId} AS trans_sub_id,
          tp.${particularsItems} AS item_name,
          tp.${particularsRate} AS rate,
          tp.${particularsQty} AS qty,
          tp.${particularsAmount} AS amount,
          tp.${particularsDiscountPct} AS item_discount_pct,
          tp.${particularsDiscountAmount} AS item_discount_amount
         FROM ${transactionTable} t
         LEFT OUTER JOIN ${paymentModeTable} pm
           ON t.${salePaymentMode} = pm.${paymentModeId}
         LEFT OUTER JOIN ${transactionParticularsTable} tp
           ON t.${saleId} = tp.${particularsTransactionId}
          AND ISNULL(tp.${particularsPosted}, 0) = 1
         WHERE t.${saleId} = @transactionId
           AND ISNULL(t.${salePosted}, 0) = 1
         ORDER BY tp.${particularsId}`,
      );

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Posted sale was not found' });
      return;
    }

    const header = result.recordset[0];
    const items = result.recordset
      .filter((row) => row.trans_sub_id !== null && row.trans_sub_id !== undefined)
      .map((row) => {
        const amount = money(row.amount);
        const itemDiscount = money(
          (amount * Number(row.item_discount_pct || 0)) / 100 + Number(row.item_discount_amount || 0),
        );
        return {
          id: row.trans_sub_id,
          name: String(row.item_name || 'Unnamed item'),
          qty: Number(row.qty || 0),
          rate: money(row.rate),
          amount,
          itemDiscount,
          netAmount: money(amount - itemDiscount),
        };
      });
    const grossSubtotal = money(items.reduce((sum, item) => sum + item.amount, 0));
    const itemDiscount = money(items.reduce((sum, item) => sum + item.itemDiscount, 0));
    const billDiscount = money(header.bill_discount);
    const fallbackGrossSubtotal = money(header.total_bill);
    const netPayable = money((items.length > 0 ? grossSubtotal : fallbackGrossSubtotal) - itemDiscount - billDiscount);
    const totalPaid = money(header.total_paid);

    res.json({
      id: header.trans_id,
      medicineBillNo: header.medicine_bill_no === null || header.medicine_bill_no === undefined
        ? '—'
        : String(header.medicine_bill_no),
      date: String(header.entry_date || ''),
      time: String(header.entry_time || ''),
      customer: String(header.patient_name || 'Walk-in customer'),
      employee: String(header.user_name || 'Unassigned'),
      counter: String(header.computer_name || 'Main counter'),
      paymentMode: String(header.payment_mode_name || (header.pay_mode === null || header.pay_mode === undefined ? 'Recorded' : `Mode ${header.pay_mode}`)),
      items,
      grossSubtotal,
      itemDiscount,
      billDiscount,
      netPayable,
      totalPaid,
      due: money(Math.abs(netPayable - totalPaid)),
    });
  } catch (error: any) {
    res.status(503).json({ error: error.message || 'Receipt unavailable' });
  }
});

// Trigger immediate manual live sync
app.post('/api/sync', async (req, res) => {
  const result = await fetchMedicinesFromDatabase();
  lastSyncTime = new Date().toISOString();
  res.json({
    success: result.connected,
    connected: result.connected,
    recordCount: cachedMedicines.length,
    supplierCount: cachedSuppliers.length,
    lastSync: lastSyncTime,
    message: result.connected
      ? `Successfully synchronized ${cachedMedicines.length} medicines and ${cachedSuppliers.length} suppliers from SQL Server 2000.`
      : `Live SQL Server sync failed; no mock data was used. ${result.error || 'Check the SQL Server settings in .env.'}`,
  });
});

// Test custom connection settings from UI
app.post('/api/test-connection', async (req, res) => {
  const { server, port, user, password, database } = req.body;
  const testConfig = getSqlConfig({
    server,
    port: parseInt(port || '1433', 10),
    user,
    password,
    database,
  });

  try {
    const pool = await new sql.ConnectionPool(testConfig).connect();
    const result = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS dbname');
    await pool.close();
    res.json({
      success: true,
      message: 'Connection to SQL Server successful!',
      version: result.recordset[0]?.version,
      dbname: result.recordset[0]?.dbname,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Connection failed',
      hint: 'For SQL Server 2000: Ensure TCP/IP is enabled on port 1433, Mixed Mode (SQL Server and Windows Authentication) is selected, and firewall allows port 1433.',
    });
  }
});

// Start server with Vite middleware in dev or static files in prod
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Medicine Order Manager running on http://0.0.0.0:${PORT}`);
  });

  let hourlyReportInFlight = false;
  const sendHourlyReport = async (): Promise<void> => {
    if (hourlyReportInFlight) {
      console.warn('[Hourly Summary] Previous run is still in progress; skipping this tick.');
      return;
    }

    hourlyReportInFlight = true;
    const startedAt = new Date();
    console.log(`[Hourly Summary] Starting ${startedAt.toISOString()}.`);
    try {
      const syncResult = await fetchMedicinesFromDatabase();
      if (!syncResult.connected) {
        throw new Error(syncResult.error || 'Live stock data could not be refreshed from SQL Server.');
      }

      const report = await fetchAnalyticsFromDatabase(localDateKey(startedAt));
      const snapshotHourUtc = new Date(Math.floor(startedAt.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
      const saved = await saveHourlySummaryReport(report, snapshotHourUtc);
      console.log(`[Hourly Summary] Saved snapshot ${saved.snapshotHourUtc}: stock=${report.inventory.valuation}, purchase=${report.dailyPurchase.amount}, sales=${report.liveSales.amount}, paid=${report.paidAfterDiscount}, due=${report.dueCollection}, collection=${report.totalCollection}.`);

      try {
        const notificationEmail = process.env.EMAIL_USER?.trim();
        const notificationPassword = process.env.EMAIL_PASS;
        if (!notificationEmail || !notificationPassword?.trim()) {
          console.log('[Hourly Summary] Snapshot saved; email was not sent because notification credentials are not configured.');
          return;
        }

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: notificationEmail,
            pass: notificationPassword,
          },
        });
        const formatMoney = (amount: number) => new Intl.NumberFormat('en-BD', {
          style: 'currency',
          currency: 'BDT',
        }).format(amount);
        const reportText = [
    '══════════════════════════════════════',
    '       💊 FATEMA PHARMACY ANALYST       ',
    '       Hourly Business Summary Report   ',
    '══════════════════════════════════════',
    '',
    `🕒 Snapshot Time : ${startedAt.toLocaleString('en-BD', { timeZone: REPORT_TIME_ZONE })} (${REPORT_TIME_ZONE})`,
    `📅 Business Date : ${report.date}`,
    '',
    '──────────────────────────────────────',
    ' FINANCIAL & INVENTORY OVERVIEW',
    '──────────────────────────────────────',
    `• Stock Valuation     : ${formatMoney(report.inventory.valuation)}`,
    `• Daily Purchase      : ${formatMoney(report.dailyPurchase.amount)}`,
    `• Live Sale           : ${formatMoney(report.liveSales.amount)}`,
    `• Paid After Discount : ${formatMoney(report.paidAfterDiscount)}`,
    `• Daily Due Collection: ${formatMoney(report.dueCollection)}`,
    `• Total Collection    : ${formatMoney(report.totalCollection)}`,
    '',
    '══════════════════════════════════════',
    `🌐 Access Live Dashboard:`,
    `   http://27.147.170.216:3001`,
    '══════════════════════════════════════'
].join('\n');

        await transporter.sendMail({
          from: notificationEmail,
          to: notificationEmail,
          subject: `Fatema Pharmacy hourly summary — ${report.date}`,
          text: reportText,
        });
        console.log('[Hourly Summary] Email report sent to the configured notification address.');
      } catch (error) {
        console.error('[Hourly Summary] Email dispatch failed:', error instanceof Error ? error.message : error);
      }
    } catch (error) {
      console.error('[Hourly Summary] Snapshot failed:', error instanceof Error ? error.message : error);
    } finally {
      hourlyReportInFlight = false;
    }
  };

  const hourlySummaryTimer = setInterval(() => {
    void sendHourlyReport();
  }, 60 * 60 * 1000);
  hourlySummaryTimer.unref();
  void sendHourlyReport();
}

scheduleAutomaticDailySummary();
startServer();