import sql from 'mssql';
import type { DashboardAnalytics, HistoricalReport, HistoricalReportMetric, HistoricalReportView } from './src/types';
import { getAuthPool } from './auth';

export async function saveDailySummaryReport(report: DashboardAnalytics, userId: number | null): Promise<{ id: number; date: string; savedAt: string }> {
  const pool = await getAuthPool();
  // Keep new dashboard metrics in the existing snapshot JSON to avoid requiring
  // a UserAuthDB schema migration whenever the dashboard adds a card.
  const reportJson = JSON.stringify({
    ...report,
    expiryCashAdjustment: report.expiryCashAdjustment ?? { amount: 0, transactions: 0 },
  });
  const transaction = new sql.Transaction(pool);
  const createdBy = userId !== null && Number.isInteger(userId) && userId > 0 ? userId : null;

  await transaction.begin();
  try {
    const request = transaction.request()
      .input('reportDate', sql.Date, report.date)
      .input('generatedAt', sql.DateTime, new Date(report.generatedAt))
      .input('createdBy', sql.Int, createdBy)
      .input('dailyPurchaseAmount', sql.Decimal(19, 2), report.dailyPurchase.amount)
      .input('purchaseTransactions', sql.Int, report.dailyPurchase.transactions)
      .input('purchaseItems', sql.Int, report.dailyPurchase.items)
      .input('liveSalesAmount', sql.Decimal(19, 2), report.liveSales.amount)
      .input('salesTransactions', sql.Int, report.liveSales.transactions)
      .input('salesItems', sql.Int, report.liveSales.items)
      .input('paidAfterDiscount', sql.Decimal(19, 2), report.paidAfterDiscount)
      .input('dueCollection', sql.Decimal(19, 2), report.dueCollection)
      .input('totalCollection', sql.Decimal(19, 2), report.totalCollection)
      .input('supplierPaymentAmount', sql.Decimal(19, 2), report.supplierPayment.amount)
      .input('employeePaymentAmount', sql.Decimal(19, 2), report.employeePayment.amount)
      .input('inventoryItems', sql.Int, report.inventory.items)
      .input('inventoryUnits', sql.Decimal(19, 2), report.inventory.units)
      .input('inventoryValuation', sql.Decimal(19, 2), report.inventory.valuation)
      .input('expensesTotal', sql.Decimal(19, 2), report.expensesTotal)
      .input('reportJson', sql.NVarChar(sql.MAX), reportJson);

    const result = await request.query(
      `UPDATE dbo.DailySummaryReports
       SET generated_at = @generatedAt,
           created_by = @createdBy,
           daily_purchase_amount = @dailyPurchaseAmount,
           purchase_transactions = @purchaseTransactions,
           purchase_items = @purchaseItems,
           live_sales_amount = @liveSalesAmount,
           sales_transactions = @salesTransactions,
           sales_items = @salesItems,
           paid_after_discount = @paidAfterDiscount,
           due_collection = @dueCollection,
           total_collection = @totalCollection,
           supplier_payment_amount = @supplierPaymentAmount,
           employee_payment_amount = @employeePaymentAmount,
           inventory_items = @inventoryItems,
           inventory_units = @inventoryUnits,
           inventory_valuation = @inventoryValuation,
           expenses_total = @expensesTotal,
           report_json = @reportJson,
           saved_at = GETDATE()
       WHERE report_date = @reportDate;

       IF @@ROWCOUNT = 0
       BEGIN
         INSERT INTO dbo.DailySummaryReports (
           report_date, generated_at, created_by,
           daily_purchase_amount, purchase_transactions, purchase_items,
           live_sales_amount, sales_transactions, sales_items,
           paid_after_discount, due_collection, total_collection,
           supplier_payment_amount, employee_payment_amount,
           inventory_items, inventory_units, inventory_valuation,
           expenses_total, report_json
         )
         VALUES (
           @reportDate, @generatedAt, @createdBy,
           @dailyPurchaseAmount, @purchaseTransactions, @purchaseItems,
           @liveSalesAmount, @salesTransactions, @salesItems,
           @paidAfterDiscount, @dueCollection, @totalCollection,
           @supplierPaymentAmount, @employeePaymentAmount,
           @inventoryItems, @inventoryUnits, @inventoryValuation,
           @expensesTotal, @reportJson
         );
       END;

       SELECT TOP 1 id, report_date, saved_at
       FROM dbo.DailySummaryReports
       WHERE report_date = @reportDate;`,
    );
    await transaction.commit();
    const row = result.recordset[0];
    return {
      id: Number(row.id),
      date: report.date,
      savedAt: new Date(row.saved_at).toISOString(),
    };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

export async function saveHourlySummaryReport(
  report: DashboardAnalytics,
  snapshotHourUtc: Date,
): Promise<{ id: number; snapshotHourUtc: string; savedAt: string }> {
  const pool = await getAuthPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const result = await transaction.request()
      .input('snapshotHourUtc', sql.DateTime, snapshotHourUtc)
      .input('generatedAt', sql.DateTime, new Date(report.generatedAt))
      .input('stockValuation', sql.Decimal(19, 2), report.inventory.valuation)
      .input('dailyPurchase', sql.Decimal(19, 2), report.dailyPurchase.amount)
      .input('liveSale', sql.Decimal(19, 2), report.liveSales.amount)
      .input('paidAfterDiscount', sql.Decimal(19, 2), report.paidAfterDiscount)
      .input('dailyDueCollections', sql.Decimal(19, 2), report.dueCollection)
      .input('totalCollection', sql.Decimal(19, 2), report.totalCollection)
      .query(
        `UPDATE dbo.HourlySummaryReports
         SET generated_at = @generatedAt,
             stock_valuation = @stockValuation,
             daily_purchase = @dailyPurchase,
             live_sale = @liveSale,
             paid_after_discount = @paidAfterDiscount,
             daily_due_collections = @dailyDueCollections,
             total_collection = @totalCollection,
             saved_at = GETDATE()
         WHERE snapshot_hour_utc = @snapshotHourUtc;

         IF @@ROWCOUNT = 0
         BEGIN
           INSERT INTO dbo.HourlySummaryReports (
             snapshot_hour_utc, generated_at, stock_valuation, daily_purchase,
             live_sale, paid_after_discount, daily_due_collections, total_collection
           )
           VALUES (
             @snapshotHourUtc, @generatedAt, @stockValuation, @dailyPurchase,
             @liveSale, @paidAfterDiscount, @dailyDueCollections, @totalCollection
           );
         END;

         SELECT TOP 1 id, snapshot_hour_utc, saved_at
         FROM dbo.HourlySummaryReports
         WHERE snapshot_hour_utc = @snapshotHourUtc;`,
      );
    const row = result.recordset[0];
    if (!row) {
      throw new Error('Hourly summary upsert did not return the saved record.');
    }
    await transaction.commit();
    return {
      id: Number(row.id),
      snapshotHourUtc: new Date(row.snapshot_hour_utc).toISOString(),
      savedAt: new Date(row.saved_at).toISOString(),
    };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

type HistoricalReportRow = {
  report_date: string | Date;
  daily_purchase_amount: unknown;
  purchase_transactions: unknown;
  live_sales_amount: unknown;
  sales_transactions: unknown;
  total_collection: unknown;
  supplier_payment_amount: unknown;
  employee_payment_amount: unknown;
  inventory_valuation: unknown;
  expenses_total: unknown;
  report_json: unknown;
};

type HistoricalReportQuery = {
  view: HistoricalReportView;
  year: number;
  month?: number;
  date?: string;
  compare?: boolean;
};

const reportNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function savedPaymentAmount(
  row: HistoricalReportRow,
  column: 'supplier_payment_amount' | 'employee_payment_amount',
  snapshotKey: 'supplierPayment' | 'employeePayment',
): number {
  const storedAmount = reportNumber(row[column]);
  if (storedAmount !== 0 || !row.report_json) return storedAmount;

  try {
    const snapshot = typeof row.report_json === 'string' ? JSON.parse(row.report_json) : row.report_json;
    if (!snapshot || typeof snapshot !== 'object') return storedAmount;
    const payment = (snapshot as Record<string, unknown>)[snapshotKey];
    if (!payment || typeof payment !== 'object') return storedAmount;
    return reportNumber((payment as Record<string, unknown>).amount);
  } catch {
    return storedAmount;
  }
}

function savedExpiryCashAdjustmentAmount(row: HistoricalReportRow): number {
  if (!row.report_json) return 0;
  try {
    const snapshot = typeof row.report_json === 'string' ? JSON.parse(row.report_json) : row.report_json;
    if (!snapshot || typeof snapshot !== 'object') return 0;
    const adjustment = (snapshot as Record<string, unknown>).expiryCashAdjustment;
    if (!adjustment || typeof adjustment !== 'object') return 0;
    return reportNumber((adjustment as Record<string, unknown>).amount);
  } catch {
    return 0;
  }
}

const dateKey = (value: string | Date): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
};

const utcDateKey = (year: number, monthIndex: number, day = 1): string =>
  new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

const addDays = (value: string, days: number): string => {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const emptyMetric = (period: string, label: string): HistoricalReportMetric => ({
  period,
  label,
  totalRevenue: 0,
  totalPurchases: 0,
  totalExpenses: 0,
  totalCollections: 0,
  totalExpiryCashAdjustments: 0,
  totalSupplierPayments: 0,
  totalEmployeePayments: 0,
  inventoryValuation: 0,
  netAfterPayments: 0,
  salesTransactions: 0,
  purchaseTransactions: 0,
  daysReported: 0,
});

function aggregateMetric(rows: HistoricalReportRow[], period: string, label: string): HistoricalReportMetric {
  const metric = emptyMetric(period, label);
  metric.totalRevenue = rows.reduce((sum, row) => sum + reportNumber(row.live_sales_amount), 0);
  metric.totalPurchases = rows.reduce((sum, row) => sum + reportNumber(row.daily_purchase_amount), 0);
  metric.totalExpenses = rows.reduce((sum, row) => sum + reportNumber(row.expenses_total), 0);
  metric.totalCollections = rows.reduce((sum, row) => sum + reportNumber(row.total_collection), 0);
  metric.totalExpiryCashAdjustments = rows.reduce((sum, row) => sum + savedExpiryCashAdjustmentAmount(row), 0);
  metric.totalSupplierPayments = rows.reduce(
    (sum, row) => sum + savedPaymentAmount(row, 'supplier_payment_amount', 'supplierPayment'),
    0,
  );
  metric.totalEmployeePayments = rows.reduce(
    (sum, row) => sum + savedPaymentAmount(row, 'employee_payment_amount', 'employeePayment'),
    0,
  );
  metric.salesTransactions = rows.reduce((sum, row) => sum + reportNumber(row.sales_transactions), 0);
  metric.purchaseTransactions = rows.reduce((sum, row) => sum + reportNumber(row.purchase_transactions), 0);
  metric.daysReported = rows.length;
  // Inventory is a point-in-time snapshot, so use the last reported value instead of
  // adding each day's same stock valuation together.
  const lastRow = rows[rows.length - 1];
  metric.inventoryValuation = lastRow ? reportNumber(lastRow.inventory_valuation) : 0;
  metric.netAfterPayments = metric.totalCollections
    - metric.totalExpenses
    - metric.totalSupplierPayments
    - metric.totalEmployeePayments;
  Object.keys(metric).forEach((key) => {
    if (key !== 'period' && key !== 'label') {
      const numericKey = key as keyof HistoricalReportMetric;
      if (typeof metric[numericKey] === 'number') {
        metric[numericKey] = Math.round((metric[numericKey] as number) * 100) / 100 as never;
      }
    }
  });
  return metric;
}

function groupRows(rows: HistoricalReportRow[], keyFor: (date: string) => string, labelFor: (key: string) => string): HistoricalReportMetric[] {
  const groups = new Map<string, HistoricalReportRow[]>();
  rows.forEach((row) => {
    const key = keyFor(dateKey(row.report_date));
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => aggregateMetric(group, key, labelFor(key)));
}

function parseReportDate(value: string | undefined, fallbackYear: number, fallbackMonth: number): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return utcDateKey(fallbackYear, fallbackMonth - 1);
}

export async function getHistoricalReport(query: HistoricalReportQuery): Promise<HistoricalReport> {
  const pool = await getAuthPool();
  const compare = query.view === 'yearly' && query.compare === true;
  const safeYear = Number.isInteger(query.year) && query.year >= 1900 && query.year <= 2200
    ? query.year
    : new Date().getUTCFullYear();
  const safeMonth = Number.isInteger(query.month) && query.month! >= 1 && query.month! <= 12
    ? query.month!
    : new Date().getUTCMonth() + 1;

  let startDate: string;
  let endDate: string;
  let label: string;
  if (query.view === 'daily') {
    startDate = parseReportDate(query.date, safeYear, safeMonth);
    endDate = addDays(startDate, 1);
    label = `Daily report · ${startDate}`;
  } else if (query.view === 'monthly') {
    startDate = utcDateKey(safeYear, safeMonth - 1);
    endDate = utcDateKey(safeYear, safeMonth);
    label = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${startDate}T12:00:00.000Z`));
  } else if (compare) {
    startDate = '1900-01-01';
    endDate = '2201-01-01';
    label = 'All reported years';
  } else {
    startDate = utcDateKey(safeYear, 0);
    endDate = utcDateKey(safeYear + 1, 0);
    label = `Year ${safeYear}`;
  }

  const result = await pool.request()
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<HistoricalReportRow>(`
      SELECT
        report_date,
        daily_purchase_amount,
        purchase_transactions,
        live_sales_amount,
        sales_transactions,
        total_collection,
        supplier_payment_amount,
        employee_payment_amount,
        inventory_valuation,
        expenses_total,
        report_json
      FROM dbo.DailySummaryReports
      WHERE report_date >= @startDate
        AND report_date < @endDate
      ORDER BY report_date ASC
    `);

  const rows = result.recordset;
  const trend = query.view === 'daily'
    ? (rows.length ? [aggregateMetric(rows, startDate, startDate)] : [])
    : query.view === 'monthly'
      ? groupRows(rows, (date) => date, (date) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00.000Z`)))
      : groupRows(
        rows,
        (date) => compare ? date.slice(0, 4) : date.slice(0, 7),
        (key) => compare
          ? key
          : new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${key}-01T12:00:00.000Z`)),
      );
  const summary = aggregateMetric(rows, compare ? 'all' : query.view === 'daily' ? startDate : String(safeYear), label);
  const yearsResult = await pool.request().query<{ report_year: number }>(`
    SELECT DISTINCT DATEPART(year, report_date) AS report_year
    FROM dbo.DailySummaryReports
    ORDER BY report_year DESC
  `);
  const availableYears = yearsResult.recordset.map((row) => Number(row.report_year)).filter(Number.isInteger);

  return {
    view: query.view,
    compare,
    year: safeYear,
    ...(query.view === 'monthly' ? { month: safeMonth } : {}),
    label,
    generatedAt: new Date().toISOString(),
    source: 'UserAuthDB.dbo.DailySummaryReports',
    summary,
    trend,
    availableYears,
  };
}