import React, { useCallback, useEffect, useMemo, useState } from 'react';
import brandLogo from '../../attached_assets/Logo_j_1790267212219.png';
import {
  ArrowDownUp,
  Activity,
  BarChart3,
  BadgeDollarSign,
  Boxes,
  CircleDollarSign,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  HandCoins,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Moon,
  PackageCheck,
  RefreshCw,
  Search,
  Save,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  WalletCards,
  X,
} from 'lucide-react';
import { DashboardAnalytics, DashboardPage, ExpiryCashAdjustment, ExpiryCashAdjustmentsResponse, PaymentDetailsResponse, PharmacySettings, SaleReceipt } from '../types';
import { BRAND_NAME, COPYRIGHT_NOTICE } from '../brand';
import { exportDailySummaryPdf, exportSaleReceiptPdf } from '../utils/pdfExport';
import type { PharmacyPdfInfo } from '../utils/pdfExport';
import { HistoricalReportsDashboard } from './HistoricalReportsDashboard';
import { NavigationDrawer } from './NavigationDrawer';
import { PHARMACY_INFO } from '../sampleData';
import type { AuthUser } from './AuthGate';

const money = (value: number) => `৳${Math.round(value).toLocaleString()}`;
const cashMoney = (value: number) => `৳${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (value: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const ANALYTICS_REFRESH_INTERVAL_MS = 60_000;

type SalesSortDirection = 'asc' | 'desc';
type SalesSortKey = 'bill' | 'employee' | 'counter';

const compareMedicineBillNumbers = (left: string, right: string) => {
  const leftValue = left.trim();
  const rightValue = right.trim();
  const leftIsNumeric = /^\d+$/.test(leftValue);
  const rightIsNumeric = /^\d+$/.test(rightValue);

  if (leftValue === '—' && rightValue !== '—') return 1;
  if (rightValue === '—' && leftValue !== '—') return -1;
  if (leftIsNumeric && rightIsNumeric) {
    const normalizedLeft = leftValue.replace(/^0+(?=\d)/, '');
    const normalizedRight = rightValue.replace(/^0+(?=\d)/, '');
    if (normalizedLeft.length !== normalizedRight.length) {
      return normalizedLeft.length - normalizedRight.length;
    }
    return normalizedLeft.localeCompare(normalizedRight);
  }

  return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare(leftValue, rightValue);
};

const compareSalesText = (left: string, right: string) => {
  const leftValue = left.trim();
  const rightValue = right.trim();
  if (leftValue === '—' && rightValue !== '—') return 1;
  if (rightValue === '—' && leftValue !== '—') return -1;
  return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare(leftValue, rightValue);
};

function Panel({ title, icon, action, children, className = '' }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dashboard-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, sub, icon, tone, onClick, actionLabel, compact = false, pressed }: { label: string; value: string; sub: string; icon: React.ReactNode; tone: string; onClick?: () => void; actionLabel?: string; compact?: boolean; pressed?: boolean }) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className={`dashboard-metric-value mt-2 font-black tracking-tight text-slate-900 ${compact ? 'text-base' : 'text-2xl'}`}>{value}</p>
        </div>
        <span className={`rounded-lg ${compact ? 'p-1.5' : 'p-2.5'} ${tone}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-slate-500 ${compact ? 'text-[9px] leading-4' : 'text-[11px]'}`}>{sub}</p>
    </>
  );
  const cardClass = compact
    ? 'dashboard-metric-card rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm'
    : 'dashboard-metric-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={actionLabel} aria-pressed={pressed} className={`${cardClass} dashboard-metric-card-clickable w-full ${pressed ? 'dashboard-metric-card-pressed' : ''}`}>
        {content}
      </button>
    );
  }

  return <div className={cardClass}>{content}</div>;
}

const receiptMoney = (value: number) => `৳${value.toFixed(2)}`;

function SaleReceiptModal({ receipt, onClose, pharmacy }: { receipt: SaleReceipt; onClose: () => void; pharmacy: PharmacyPdfInfo }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="sales-receipt-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="sales-receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="sales-receipt-title">
        <div className="sales-receipt-header">
          <div>
            <p className="sales-receipt-eyebrow">Fatema Pharmacy · Money receipt</p>
            <h2 id="sales-receipt-title">Bill No. {receipt.medicineBillNo}</h2>
            <p>{receipt.date} {receipt.time}</p>
          </div>
          <div className="sales-receipt-actions">
            <button type="button" onClick={() => exportSaleReceiptPdf(receipt, pharmacy)} className="sales-receipt-download">
              <Download aria-hidden="true" /> Download PDF
            </button>
            <button type="button" onClick={onClose} className="sales-receipt-close" aria-label="Close receipt">
              <X aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="sales-receipt-body">
          <div className="sales-receipt-meta">
            <div><span>Customer</span><strong>{receipt.customer}</strong></div>
            <div><span>Employee</span><strong>{receipt.employee}</strong></div>
            <div><span>Counter</span><strong>{receipt.counter}</strong></div>
            <div><span>Payment</span><strong>{receipt.paymentMode}</strong></div>
          </div>

          <div className="sales-receipt-items-wrap">
            <table className="sales-receipt-items">
              <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>
                {receipt.items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                    <td>{receiptMoney(item.rate)}</td>
                    <td>{receiptMoney(item.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {receipt.items.length === 0 && <p className="sales-receipt-empty">No posted item lines were found for this bill.</p>}
          </div>

          <div className="sales-receipt-summary">
            <div><span>Gross subtotal</span><strong>{receiptMoney(receipt.grossSubtotal)}</strong></div>
            <div><span>Item discount</span><strong>{receiptMoney(receipt.itemDiscount)}</strong></div>
            <div><span>Bill discount</span><strong>{receiptMoney(receipt.billDiscount)}</strong></div>
            <div className="sales-receipt-total"><span>Net payable</span><strong>{receiptMoney(receipt.netPayable)}</strong></div>
            <div><span>Total paid</span><strong>{receiptMoney(receipt.totalPaid)}</strong></div>
            <div className={receipt.due > 0 ? 'sales-receipt-due' : ''}><span>Due</span><strong>{receiptMoney(receipt.due)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

type AnalyticsPage = DashboardPage;
type ThemeMode = 'light' | 'dark';

const pageFromPath = (): DashboardPage => {
  if (window.location.pathname === '/reports') return 'reports';
  if (window.location.pathname === '/live-sales') return 'sales';
  if (window.location.pathname === '/daily-purchases') return 'purchases';
  if (window.location.pathname === '/due-collections') return 'dueCollections';
  if (window.location.pathname === '/daily-expenses') return 'expenses';
  if (window.location.pathname === '/payments') return 'payments';
  if (window.location.pathname === '/employee-payments') return 'employeePayments';
  return 'dashboard';
};

function LiveSalesPage({ data, pharmacy }: { data: DashboardAnalytics; pharmacy: PharmacyPdfInfo }) {
  const [billSearch, setBillSearch] = useState('');
  const [sortKey, setSortKey] = useState<SalesSortKey>('bill');
  const [sortDirection, setSortDirection] = useState<SalesSortDirection>('desc');
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<number | string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const filteredSales = useMemo(() => {
    const query = billSearch.trim().toLowerCase();
    if (!query) return data.sales;
    return data.sales.filter((sale) => sale.medicineBillNo.toLowerCase().includes(query));
  }, [billSearch, data.sales]);
  const sortedSales = useMemo(() => {
    return [...filteredSales].sort((left, right) => {
      const result = sortKey === 'bill'
        ? compareMedicineBillNumbers(left.medicineBillNo, right.medicineBillNo)
        : sortKey === 'employee'
          ? compareSalesText(left.employee, right.employee)
          : compareSalesText(left.counter, right.counter);
      if (result !== 0) return sortDirection === 'asc' ? result : -result;
      return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
    });
  }, [filteredSales, sortDirection, sortKey]);

  const toggleSort = (nextKey: SalesSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  };

  const sortIcon = (key: SalesSortKey) => (
    sortKey === key
      ? sortDirection === 'asc' ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />
      : <ArrowDownUp aria-hidden="true" />
  );

  const openReceipt = async (saleId: number | string) => {
    setReceiptLoadingId(saleId);
    setReceiptError(null);
    try {
      const response = await fetch(`/api/sales/${encodeURIComponent(String(saleId))}/receipt`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Receipt unavailable');
      setReceipt(payload as SaleReceipt);
    } catch (error: any) {
      setReceipt(null);
      setReceiptError(error.message || 'Receipt unavailable');
    } finally {
      setReceiptLoadingId(null);
    }
  };

  return (
    <>
      <Panel title="Live sales counter" icon={<Store className="h-4 w-4 text-emerald-600" />} action={<span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">TODAY</span>} className="sales-counter-panel">
      <div className="grid grid-cols-1 border-b border-slate-100 bg-white sm:grid-cols-3">
        <div className="p-5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Revenue</p><p className="mt-1 text-2xl font-black">{money(data.liveSales.amount)}</p></div>
        <div className="border-t border-slate-100 p-5 sm:border-l sm:border-t-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Transactions</p><p className="mt-1 text-2xl font-black">{data.liveSales.transactions}</p></div>
        <div className="border-t border-slate-100 p-5 sm:border-l sm:border-t-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Avg. ticket</p><p className="mt-1 text-2xl font-black">{money(data.liveSales.amount / Math.max(1, data.liveSales.transactions))}</p></div>
      </div>
      <div className="sales-table-wrap">
         <div className="sales-toolbar">
           <label className="sales-search">
             <Search aria-hidden="true" />
             <span className="sr-only">Search bill number</span>
             <input
               type="search"
               value={billSearch}
               onChange={(event) => setBillSearch(event.target.value)}
               placeholder="Search bill number"
               aria-label="Search bill number"
             />
           </label>
           {billSearch.trim() && <span className="sales-search-count">{sortedSales.length} matching {sortedSales.length === 1 ? 'bill' : 'bills'}</span>}
         </div>
        <table className="sales-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col" aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}>
                <button
                  type="button"
                   onClick={() => toggleSort('bill')}
                  className="sales-sort-button"
                   aria-label={`Sort Medicine_Bill_no ${sortKey === 'bill' && sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <span>Medicine_Bill_no</span>
                   {sortIcon('bill')}
                </button>
              </th>
              <th scope="col" className="sales-number-cell">Items</th>
              <th scope="col" className="sales-number-cell">Revenue</th>
              <th scope="col" className="sales-number-cell">Due</th>
              <th scope="col" className="sales-text-cell" aria-sort={sortKey === 'employee' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button
                  type="button"
                  onClick={() => toggleSort('employee')}
                  className="sales-sort-button sales-sort-button-right"
                  aria-label={`Sort Employee ${sortKey === 'employee' && sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <span>Employee</span>{sortIcon('employee')}
                </button>
              </th>
              <th scope="col" className="sales-text-cell" aria-sort={sortKey === 'counter' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button
                  type="button"
                  onClick={() => toggleSort('counter')}
                  className="sales-sort-button sales-sort-button-right"
                  aria-label={`Sort Counter ${sortKey === 'counter' && sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <span>Counter</span>{sortIcon('counter')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSales.map((sale, index) => (
              <tr key={`${sale.medicineBillNo}-${sale.id}-${index}`}>
                <td data-label="Time" className="sales-time-cell">{sale.time || '—'}</td>
                <td data-label="Medicine_Bill_no" className="sales-bill-cell">
                  <button type="button" className="sales-bill-button" onClick={() => void openReceipt(sale.id)} disabled={receiptLoadingId !== null} aria-label={`Open money receipt for bill ${sale.medicineBillNo}`}>
                    {receiptLoadingId === sale.id ? <LoaderCircle className="sales-bill-loading" aria-hidden="true" /> : <FileText aria-hidden="true" />}
                    <span>{sale.medicineBillNo}</span>
                  </button>
                </td>
                <td data-label="Items" className="sales-number-cell">{sale.items}</td>
                <td data-label="Revenue" className="sales-number-cell sales-amount-cell">{money(sale.amount)}</td>
                <td data-label="Due" className={`sales-number-cell ${sale.due > 0 ? 'sales-due-cell' : ''}`}>{money(sale.due)}</td>
                <td data-label="Employee" className="sales-text-cell">{sale.employee}</td>
                <td data-label="Counter" className="sales-text-cell">{sale.counter}</td>
              </tr>
            ))}
          </tbody>
        </table>
         {sortedSales.length === 0 && <p className="sales-empty-state">{billSearch.trim() ? 'No bills match your search.' : 'No posted sales were found for today.'}</p>}
        {receiptError && <p className="sales-receipt-error" role="alert">{receiptError}</p>}
        <p className="sales-sort-hint"><ArrowDownUp aria-hidden="true" /> Click a Medicine_Bill_no to view the money receipt and download its PDF.</p>
      </div>
      </Panel>
      {receipt && <SaleReceiptModal receipt={receipt} pharmacy={pharmacy} onClose={() => setReceipt(null)} />}
    </>
  );
}

function DashboardLiveSalesPanel({ data, onOpenSales }: { data: DashboardAnalytics; onOpenSales: () => void }) {
  const [billSortDirection, setBillSortDirection] = useState<SalesSortDirection>('desc');
  const currentSales = useMemo(() => [...data.sales].sort((left, right) => {
    const result = compareMedicineBillNumbers(left.medicineBillNo, right.medicineBillNo);
    if (result !== 0) return billSortDirection === 'asc' ? result : -result;
    return String(right.id).localeCompare(String(left.id), undefined, { numeric: true });
  }), [billSortDirection, data.sales]);

  return (
    <Panel
      title="Live sales"
      icon={<Store className="h-4 w-4 text-emerald-600" />}
      className="order-4 xl:col-span-1"
      action={
        <button
          type="button"
          onClick={onOpenSales}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
        >
          View all
        </button>
      }
    >
      <div className="border-b border-slate-100 bg-emerald-50/40 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Today&apos;s live sales</p>
            <p className="mt-1 text-xl font-black text-slate-900">{money(data.liveSales.amount)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-500">{data.liveSales.transactions} transactions</p>
            <p className="mt-1 text-[10px] text-slate-400">
              {billSortDirection === 'desc' ? 'Latest bill first' : 'Ascending bill number'} · auto-refreshes every {ANALYTICS_REFRESH_INTERVAL_MS / 1000}s
            </p>
          </div>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        {currentSales.length > 0 ? (
          <table className="w-full min-w-[440px] text-left text-xs">
            <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-400 shadow-sm">
              <tr>
                <th className="px-4 py-2.5">Time</th>
                <th
                  scope="col"
                  aria-sort={billSortDirection === 'asc' ? 'ascending' : 'descending'}
                  className="px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setBillSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                    className="sales-sort-button"
                    aria-label={`Sort bill number ${billSortDirection === 'desc' ? 'ascending' : 'descending'}`}
                  >
                    <span>Bill</span>
                    {billSortDirection === 'asc'
                      ? <ChevronUp aria-hidden="true" />
                      : <ChevronDown aria-hidden="true" />}
                  </button>
                </th>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {currentSales.map((sale, index) => (
                <tr key={`${sale.id}-${index}`} className="border-t border-slate-100 hover:bg-emerald-50/40">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-slate-500">{sale.time || '—'}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{sale.medicineBillNo}</td>
                  <td className="px-3 py-2.5 text-slate-600">{sale.employee}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono font-bold text-emerald-700">{money(sale.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No posted sales were found for today.</p>
        )}
      </div>
    </Panel>
  );
}

function DailyPurchasesPage({ data }: { data: DashboardAnalytics }) {
  return (
    <Panel title="Daily purchases" icon={<PackageCheck className="h-4 w-4 text-cyan-600" />} action={<span className="text-sm font-black text-cyan-700">{money(data.dailyPurchase.amount)}</span>}>
      <div className="border-b border-slate-100 bg-cyan-50/40 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Today&apos;s purchase records</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-2xl font-black text-slate-900">{money(data.dailyPurchase.amount)}</span>
          <span className="text-xs text-slate-500">{data.dailyPurchase.transactions} invoices · {data.dailyPurchase.items} items</span>
        </div>
      </div>
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-400 shadow-sm"><tr><th className="px-5 py-3">Invoice</th><th>Supplier</th><th className="px-5 text-right">Amount</th></tr></thead>
          <tbody>{data.purchases.map((purchase) => <tr key={purchase.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-5 py-3 font-mono font-semibold">{purchase.invoice}</td><td className="py-3 text-slate-500">{purchase.supplier}</td><td className="px-5 py-3 text-right font-mono font-bold">{money(purchase.amount)}</td></tr>)}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function DetailTablePage({
  title,
  description,
  icon,
  tone,
  total,
  count,
  children,
  emptyMessage,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: string;
  total: number;
  count: number;
  children: React.ReactNode;
  emptyMessage: string;
}) {
  return (
    <Panel title={title} icon={icon} action={<span className={`text-sm font-black ${tone}`}>{money(total)}</span>}>
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{description}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-2xl font-black text-slate-900">{money(total)}</span>
          <span className="text-xs text-slate-500">{count} {count === 1 ? 'record' : 'records'}</span>
        </div>
      </div>
      {count > 0 ? (
        <div className="analytics-detail-table-wrap">
          {children}
        </div>
      ) : (
        <p className="analytics-empty-state">{emptyMessage}</p>
      )}
    </Panel>
  );
}

function DueCollectionsPage({ data }: { data: DashboardAnalytics }) {
  return (
    <DetailTablePage
      title="Daily due collections"
      description="Payments collected against previously due bills today"
      icon={<HandCoins className="h-4 w-4 text-indigo-600" />}
      tone="text-indigo-700"
      total={data.dueCollection}
      count={data.dueCollections.length}
      emptyMessage="No due-bill collections were posted today."
    >
      <table className="analytics-detail-table">
        <thead><tr><th>Time</th><th>Bill no.</th><th>Payment mode</th><th>Particulars</th><th>Operator</th><th>Counter</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {data.dueCollections.map((collection) => (
            <tr key={collection.id}>
              <td className="font-mono text-slate-500">{collection.time || '—'}</td>
              <td className="font-mono font-bold text-slate-800">{collection.medicineBillNo}</td>
              <td>{collection.paymentMode}</td>
              <td>{collection.particulars}</td>
              <td>{collection.userName}</td>
              <td>{collection.computerName}</td>
              <td className="text-right font-mono font-bold text-indigo-700">{money(collection.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DetailTablePage>
  );
}

function DailyExpensesPage({ data }: { data: DashboardAnalytics }) {
  return (
    <DetailTablePage
      title="Daily expenses"
      description="Posted expense records for today"
      icon={<WalletCards className="h-4 w-4 text-rose-600" />}
      tone="text-rose-700"
      total={data.expensesTotal}
      count={data.expenses.length}
      emptyMessage="No posted expenses were recorded today."
    >
      <table className="analytics-detail-table">
        <thead><tr><th>Time</th><th>Voucher</th><th>Expense head</th><th>Remark</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {data.expenses.map((expense) => (
            <tr key={expense.id}>
              <td className="font-mono text-slate-500">{expense.time || '—'}</td>
              <td className="font-mono font-bold text-slate-800">{expense.voucher}</td>
              <td className="font-bold text-slate-700">{expense.head}</td>
              <td>{expense.remark || '—'}</td>
              <td className="text-right font-mono font-bold text-rose-700">{money(expense.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DetailTablePage>
  );
}

function PaymentDetailsPage({ kind, date }: { kind: 'supplier' | 'employee'; date: string }) {
  const [details, setDetails] = useState<PaymentDetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const title = kind === 'supplier' ? 'Supplier payments' : 'Employee payments';
  const tone = kind === 'supplier' ? 'text-rose-700' : 'text-orange-700';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ kind });
    if (date) query.set('date', date);
    fetch(`/api/payment-details?${query.toString()}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Payment details could not be loaded.');
        return payload as PaymentDetailsResponse;
      })
      .then((payload) => {
        if (!cancelled) setDetails(payload);
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message || 'Payment details could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [date, kind]);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Loading {title.toLowerCase()}…</p>
      ) : details && (
        <DetailTablePage
          title={title}
          description={`${kind === 'supplier' ? 'Supplier and party payments' : 'Payments and transactions'} · ${details.date}`}
          icon={<CreditCard className={`h-4 w-4 ${tone}`} />}
          tone={tone}
          total={details.total}
          count={details.transactions}
          emptyMessage={`No ${kind === 'supplier' ? 'supplier or party' : 'employee'} payments were recorded on this date.`}
        >
          <table className="analytics-detail-table">
            <thead><tr><th>Time</th><th>Type</th><th>Reference</th><th>{kind === 'supplier' ? 'Supplier / party' : 'Employee'}</th><th>Payment mode</th><th>Particulars</th><th>Operator</th><th>Counter</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {details.records.map((record) => (
                <tr key={record.id}>
                  <td className="font-mono text-slate-500">{record.time || '—'}</td>
                  <td>{record.category}</td>
                  <td className="font-mono font-bold text-slate-800">{record.reference}</td>
                  <td className="font-bold text-slate-700">{record.counterparty}</td>
                  <td>{record.paymentMode}</td>
                  <td>{record.particulars || '—'}</td>
                  <td>{record.userName}</td>
                  <td>{record.computerName}</td>
                  <td className={`text-right font-mono font-bold ${tone}`}>{money(record.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailTablePage>
      )}
    </div>
  );
}

function ExpiryCashAdjustmentSection({ date }: { date: string }) {
  const [details, setDetails] = useState<ExpiryCashAdjustmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ date });
      const response = await fetch(`/api/expiry-cash-adjustments?${query.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Expiry cash adjustment details could not be loaded.');
      setDetails(payload as ExpiryCashAdjustmentsResponse);
    } catch (loadError: any) {
      setError(loadError.message || 'Expiry cash adjustment details could not be loaded.');
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  return (
    <Panel
      title="Expiry cash adjustments"
      icon={<BadgeDollarSign className="h-4 w-4 text-rose-600" />}
      className="xl:col-span-2"
      action={
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-rose-700">{cashMoney(details?.total || 0)}</span>
          <button type="button" onClick={() => void loadDetails()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-60" aria-label="Refresh expiry cash adjustment details">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Saved adjustments · {date || 'today'}</p>
        <p className="mt-1 text-xs text-slate-500">{details ? `${details.transactions} records` : 'Loading adjustment records…'}</p>
      </div>
      {error && <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">{error}</p>}
      <div className="overflow-x-auto">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading adjustment records…</p>
        ) : details?.records.length ? (
          <table className="analytics-detail-table min-w-[760px]">
            <thead><tr><th>Time</th><th>Supplier</th><th>Remark</th><th>Saved by</th><th>Computer</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {details.records.map((record: ExpiryCashAdjustment) => (
                <tr key={record.id}>
                  <td className="font-mono text-slate-500">{record.time || '—'}</td>
                  <td className="font-bold text-slate-700">{record.supplierName}</td>
                  <td>{record.remark || '—'}</td>
                  <td>{record.userName || '—'}</td>
                  <td>{record.computerName || '—'}</td>
                  <td className="text-right font-mono font-bold text-rose-700">{cashMoney(record.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No expiry cash adjustments were saved for this date.</p>
        )}
      </div>
    </Panel>
  );
}

export const AnalyticsDashboard: React.FC<{
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLogout?: () => Promise<void>;
}> = ({ user, onUserUpdated, onLogout }) => {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [page, setPage] = useState<DashboardPage>(pageFromPath);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expiryDetailsVisible, setExpiryDetailsVisible] = useState(false);
  const [pharmacy, setPharmacy] = useState<PharmacySettings>({
    name: PHARMACY_INFO.name,
    address: PHARMACY_INFO.address,
    phone: PHARMACY_INFO.phone.replace(/^Phone No\s*:\s*/i, ''),
    logoDataUrl: null,
  });
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => (
    typeof window !== 'undefined' && window.localStorage.getItem('pharmacy-theme') === 'dark' ? 'dark' : 'light'
  ));

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const analyticsResponse = await fetch('/api/analytics');
      if (analyticsResponse.ok) {
        setAnalytics(await analyticsResponse.json());
        setConnectionError(null);
      } else {
        const error = await analyticsResponse.json().catch(() => ({}));
        setAnalytics(null);
        setConnectionError(error.error || 'Live SQL Server analytics are unavailable.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    fetch('/api/settings')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Pharmacy settings could not be loaded.');
        setPharmacy(payload.pharmacy as PharmacySettings);
        setSettingsLoadError(null);
      })
      .catch((error) => setSettingsLoadError(error instanceof Error ? error.message : 'Pharmacy settings could not be loaded.'));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadData(); }, ANALYTICS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);
  useEffect(() => {
    const handlePopState = () => {
      const nextPage = pageFromPath();
      setPage(nextPage);
      if (nextPage !== 'dashboard') setExpiryDetailsVisible(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    window.localStorage.setItem('pharmacy-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const navigateTo = (nextPage: DashboardPage) => {
    const path = nextPage === 'sales'
      ? '/live-sales'
      : nextPage === 'purchases'
        ? '/daily-purchases'
        : nextPage === 'dueCollections'
          ? '/due-collections'
          : nextPage === 'expenses'
            ? '/daily-expenses'
            : nextPage === 'reports'
              ? '/reports'
              : nextPage === 'payments'
                ? '/payments'
                : nextPage === 'employeePayments'
                  ? '/employee-payments'
            : '/';
    window.history.pushState({}, '', path);
    setPage(nextPage);
    if (nextPage !== 'dashboard') setExpiryDetailsVisible(false);
    if (!window.matchMedia('(min-width: 1024px)').matches) setDrawerOpen(false);
  };

  const openExpiryCashAdjustmentDetails = () => {
    const scrollToDetails = () => {
      const section = document.getElementById('expiry-cash-adjustments');
      if (!section) return;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.focus({ preventScroll: true });
    };

    if (page !== 'dashboard') {
      navigateTo('dashboard');
      setExpiryDetailsVisible(true);
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToDetails));
      return;
    }

    const shouldShowDetails = !expiryDetailsVisible;
    setExpiryDetailsVisible(shouldShowDetails);
    if (shouldShowDetails) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToDetails));
    }
    if (!window.matchMedia('(min-width: 1024px)').matches) setDrawerOpen(false);
  };

  const saveDailySummary = async () => {
    if (!analytics) return;
    setIsSavingReport(true);
    setReportStatus(null);
    try {
      const response = await fetch('/api/reports/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: analytics.date }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Daily summary could not be saved.');
      setReportStatus({ kind: 'success', message: `Saved ${payload.report?.date || analytics.date}` });
    } catch (error: any) {
      setReportStatus({ kind: 'error', message: error.message || 'Daily summary could not be saved.' });
    } finally {
      setIsSavingReport(false);
    }
  };

  const data = analytics || {
    dailyPurchase: { amount: 0, transactions: 0, items: 0 },
    liveSales: { amount: 0, transactions: 0, items: 0 },
    paidAfterDiscount: 0,
    dueCollection: 0,
    totalCollection: 0,
    supplierPayment: { amount: 0, transactions: 0 },
    employeePayment: { amount: 0, transactions: 0 },
    expiryCashAdjustment: { amount: 0, transactions: 0 },
    inventory: { items: 0, units: 0, valuation: 0 },
    expensesTotal: 0, purchases: [], sales: [], employees: [], counters: [], expenses: [], dueCollections: [], date: '', generatedAt: '',
  };

  const maxEmployeeSales = Math.max(...data.employees.map((employee) => employee.amount), 1);
  const pageLabel = page === 'dashboard'
    ? 'Daily snapshot'
    : page === 'sales'
      ? 'Live sales counter'
      : page === 'purchases'
        ? 'Daily purchases'
        : page === 'dueCollections'
          ? 'Daily due collections'
        : page === 'reports'
          ? 'Monthly & yearly analytics'
        : page === 'payments'
          ? 'Supplier payments'
          : page === 'employeePayments'
            ? 'Employee payments'
          : 'Daily expenses';
  const updatedLabel = analytics
    ? `Last synced ${new Date(analytics.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Waiting for live data';
  const pharmacyForPdf = {
    ...PHARMACY_INFO,
    name: pharmacy.name,
    address: pharmacy.address,
    phone: pharmacy.phone,
    logoDataUrl: pharmacy.logoDataUrl,
  };
  const drawerMetrics = (
    <>
      <Metric compact label="Expire cash adjustment" value={cashMoney(data.expiryCashAdjustment.amount)} sub={`${data.expiryCashAdjustment.transactions} records`} icon={<BadgeDollarSign className="h-4 w-4 text-rose-700" />} tone="bg-rose-50" onClick={openExpiryCashAdjustmentDetails} actionLabel="Toggle expiry cash adjustment details" pressed={expiryDetailsVisible} />
      <Metric compact label="Daily expenses" value={money(data.expensesTotal)} sub={`${data.expenses.length} expense lines`} icon={<WalletCards className="h-4 w-4 text-rose-700" />} tone="bg-rose-50" onClick={() => navigateTo('expenses')} actionLabel="Open daily expenses" />
      <Metric compact label="Supplier payment" value={money(data.supplierPayment.amount)} sub={`${data.supplierPayment.transactions} payments`} icon={<CreditCard className="h-4 w-4 text-rose-700" />} tone="bg-rose-50" onClick={() => navigateTo('payments')} actionLabel="Open supplier payments" />
      <Metric compact label="Employee payment" value={money(data.employeePayment.amount)} sub={`${data.employeePayment.transactions} payments`} icon={<CreditCard className="h-4 w-4 text-orange-700" />} tone="bg-orange-50" onClick={() => navigateTo('employeePayments')} actionLabel="Open employee payments" />
    </>
  );
  return (
    <div className={`app-shell min-h-screen bg-[#f4f7f9] text-slate-900 transition-colors duration-500 ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <NavigationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        page={page}
        onNavigate={navigateTo}
        analytics={data}
        pharmacy={pharmacy}
        onPharmacyUpdated={(updated) => { setPharmacy(updated); setSettingsLoadError(null); }}
        user={user}
        onUserUpdated={onUserUpdated}
        metrics={drawerMetrics}
        updatedLabel={updatedLabel}
        reportStatus={reportStatus}
        isSavingReport={isSavingReport}
        onSaveSummary={() => void saveDailySummary()}
        onDownloadPdf={() => analytics && exportDailySummaryPdf(analytics, pharmacyForPdf)}
        theme={theme}
        onThemeToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
        onLogout={onLogout}
        settingsLoadError={settingsLoadError}
      />
      <div className="app-content">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="dashboard-header-inner mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="dashboard-header-brand flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setDrawerOpen((current) => !current)} aria-label={drawerOpen ? 'Collapse navigation drawer' : 'Expand navigation drawer'} aria-expanded={drawerOpen} className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 hover:border-teal-300 hover:text-teal-700">
              <Menu className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => navigateTo('dashboard')} className="dashboard-brand-link flex min-w-0 flex-1 items-center gap-2.5 text-left sm:gap-3" title="Open dashboard">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#25282a] shadow-sm sm:h-11 sm:w-11">
                <img src={pharmacy.logoDataUrl || brandLogo} alt={`${pharmacy.name} logo`} className="h-full w-full object-cover" />
             </div>
            <div className="dashboard-brand-copy min-w-0 flex-1">
              <h1 className="truncate text-base font-black tracking-tight text-slate-900 sm:text-xl">Pharmacy Analyst <span className="font-normal text-slate-400">& POS</span></h1>
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400 sm:text-[10px] sm:tracking-[0.16em]">{pharmacy.name} · read-only operations center · {BRAND_NAME}</p>
            </div>
            <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:flex ${connectionError ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><ShieldCheck className="h-3.5 w-3.5" /> LIVE SQL</span>
            </button>
          </div>
          <div className="dashboard-header-actions flex items-center gap-2">
              <button type="button" onClick={() => navigateTo('dashboard')} aria-current={page === 'dashboard' ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${page === 'dashboard' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700'}`} title="Open dashboard"><LayoutDashboard className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Dashboard</span></button>
             <button type="button" onClick={() => navigateTo('sales')} className={`hidden flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${page === 'sales' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'}`}><Store className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Live sales counter</span><span className="sm:hidden">Live sales</span></button>
             <button type="button" onClick={() => navigateTo('purchases')} className={`hidden flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${page === 'purchases' ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'}`}><PackageCheck className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Daily purchases</span><span className="sm:hidden">Purchases</span></button>
            <button onClick={() => void loadData()} disabled={isRefreshing} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh</button>
              {onLogout && <button type="button" onClick={() => void onLogout()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700">Sign out</button>}
             <button type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} className="theme-toggle flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
               {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
               <span className="hidden sm:inline">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
             </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main mx-auto max-w-[1800px] space-y-4 px-4 py-4 lg:px-6">
           <section className="dashboard-hero">
           <div className="dashboard-hero-glow dashboard-hero-glow-one" />
           <div className="dashboard-hero-glow dashboard-hero-glow-two" />
           <div className="dashboard-hero-content">
             <p className="dashboard-eyebrow"><Sparkles className="h-3.5 w-3.5" /> {pageLabel} <span>·</span> {data.date || 'waiting for SQL Server'}</p>
              <h2>
                 {page === 'reports'
                   ? 'Measure performance over time.'
                   : page === 'dashboard'
                  ? 'Your pharmacy, at a glance.'
                  : page === 'sales'
                    ? "Today's sales activity."
                    : page === 'purchases'
                      ? "Today's purchase activity."
                      : page === 'dueCollections'
                        ? "Today's due collections."
                      : page === 'payments'
                        ? "Today's supplier payments."
                        : page === 'employeePayments'
                          ? "Today's employee payments."
                        : "Today's expense activity."}
              </h2>
              <p className="dashboard-hero-copy">A focused view of the numbers that keep {pharmacy.name} moving.</p>
           </div>
           <div className="dashboard-sync-card">
             <div className="dashboard-sync-icon"><Activity className="h-4 w-4" /></div>
             <div>
               <p className="dashboard-sync-label">{connectionError ? 'Connection check needed' : 'Live sync active'}</p>
               <p className="dashboard-sync-detail">{updatedLabel}</p>
             </div>
             <span className={`dashboard-sync-dot ${connectionError ? 'is-warning' : ''}`} />
           </div>
         </section>

        {connectionError && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm">
            <p className="font-extrabold">Live SQL Server connection unavailable</p>
            <p className="mt-1">{connectionError}. No mock data is being displayed.</p>
          </div>
        )}

          {page === 'reports' && <HistoricalReportsDashboard pharmacy={pharmacyForPdf} />}
          {page !== 'dashboard' && page !== 'reports' && (
            page === 'sales'
              ? <LiveSalesPage data={data} pharmacy={pharmacyForPdf} />
              : page === 'purchases'
                ? <DailyPurchasesPage data={data} />
                : page === 'dueCollections'
                  ? <DueCollectionsPage data={data} />
                    : page === 'expenses'
                      ? <DailyExpensesPage data={data} />
                      : <PaymentDetailsPage key={`${page}-${data.date}`} kind={page === 'payments' ? 'supplier' : 'employee'} date={data.date} />
          )}

          {page === 'dashboard' && <div id="dashboard-top-bar" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
           <Metric label="Stock valuation" value={money(data.inventory.valuation)} sub={`${compact(data.inventory.units)} units across ${data.inventory.items} items`} icon={<Boxes className="h-5 w-5 text-violet-700" />} tone="bg-violet-50" />
          <Metric label="Daily purchase" value={money(data.dailyPurchase.amount)} sub={`${data.dailyPurchase.transactions} purchase records`} icon={<ShoppingCart className="h-5 w-5 text-cyan-700" />} tone="bg-cyan-50" onClick={() => navigateTo('purchases')} actionLabel="Open daily purchases" />
          <Metric label="Live sale" value={money(data.liveSales.amount)} sub={`${data.liveSales.transactions} transactions · ${data.liveSales.items} items`} icon={<CircleDollarSign className="h-5 w-5 text-emerald-700" />} tone="bg-emerald-50" onClick={() => navigateTo('sales')} actionLabel="Open live sales counter" />
          <Metric label="Paid after discount" value={money(data.paidAfterDiscount)} sub="Today's posted sales payments" icon={<BadgeDollarSign className="h-5 w-5 text-amber-700" />} tone="bg-amber-50" />
           <Metric label="Daily due collections" value={money(data.dueCollection)} sub="Collected against due bills today" icon={<HandCoins className="h-5 w-5 text-indigo-700" />} tone="bg-indigo-50" onClick={() => navigateTo('dueCollections')} actionLabel="Open daily due collections" />
           <Metric label="Total collection" value={money(data.totalCollection)} sub="Paid after discount + due collections + expiry cash" icon={<CircleDollarSign className="h-5 w-5 text-blue-700" />} tone="bg-blue-50" />
         </div>}

          {page === 'dashboard' && expiryDetailsVisible && <div id="expiry-cash-adjustments" tabIndex={-1} className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
            <ExpiryCashAdjustmentSection date={data.date} />
          </div>}

         {page === 'dashboard' && <div className="grid gap-4 xl:grid-cols-2">
             <Panel title="Sales by employee" icon={<BarChart3 className="h-4 w-4 text-violet-600" />} className="order-3" action={<span className="text-[10px] font-semibold text-slate-400">Revenue ranking</span>}>
              <div className="space-y-4 p-4">
                {data.employees.map((employee, index) => <div key={employee.name}><div className="mb-1.5 flex justify-between text-xs"><span className="font-bold text-slate-700"><span className="mr-2 text-slate-300">0{index + 1}</span>{employee.name}</span><span className="font-mono font-bold text-slate-800">{money(employee.amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(employee.amount / maxEmployeeSales) * 100}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{employee.transactions} transactions</p></div>)}
              </div>
              <div className="border-t border-slate-100 px-4 py-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Sales by POS terminal</p><div className="flex flex-wrap gap-2">{data.counters.map((counter) => <div key={counter.name} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] text-slate-400">{counter.name}</p><p className="text-sm font-black">{money(counter.amount)}</p><p className="text-[10px] text-slate-500">{counter.transactions} sales</p></div>)}</div></div>
            </Panel>
            <DashboardLiveSalesPanel data={data} onOpenSales={() => navigateTo('sales')} />
         </div>}
      </main>
       <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-center text-[10px] font-semibold tracking-wide text-slate-500 lg:px-6">
         {COPYRIGHT_NOTICE}
       </footer>
      </div>
    </div>
  );
};