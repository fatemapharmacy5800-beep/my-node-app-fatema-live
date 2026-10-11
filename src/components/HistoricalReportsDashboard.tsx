import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Database,
  Download,
  LoaderCircle,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import type { HistoricalReport, HistoricalReportMetric, HistoricalReportView } from '../types';
import { exportHistoricalReportPdf } from '../utils/pdfExport';
import type { PharmacyPdfInfo } from '../utils/pdfExport';

const money = (value: number) => `৳${Math.round(value).toLocaleString()}`;
const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(Date.UTC(2024, index, 1))));

function ReportMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`rounded-lg p-2 ${tone}`}><TrendingUp className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function TrendChart({ trend }: { trend: HistoricalReportMetric[] }) {
  const width = 820;
  const height = 285;
  const chartTop = 22;
  const chartBottom = 228;
  const chartHeight = chartBottom - chartTop;
  const chartLeft = 38;
  const chartRight = 796;
  const maxValue = Math.max(...trend.flatMap((item) => [item.totalRevenue, item.totalCollections, item.totalPurchases, item.totalExpiryCashAdjustments]), 1);
  const slot = (chartRight - chartLeft) / Math.max(trend.length, 1);
  const barWidth = Math.min(16, Math.max(4, slot / 4));
  const labelStep = trend.length > 18 ? Math.ceil(trend.length / 12) : 1;

  if (!trend.length) {
    return <div className="flex h-64 items-center justify-center px-6 text-sm text-slate-500">No saved daily reports were found for this period.</div>;
  }

  return (
    <div className="overflow-x-auto px-2 pb-3 pt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[680px] w-full" role="img" aria-label="Revenue, collections, purchases, and expiry cash adjustments trend">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = chartBottom - fraction * chartHeight;
          return <line key={fraction} x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 4" />;
        })}
        {trend.map((item, index) => {
          const x = chartLeft + index * slot + slot / 2;
          const values = [
            { value: item.totalRevenue, color: '#0e7490', offset: -barWidth * 1.5 },
            { value: item.totalCollections, color: '#7c3aed', offset: -barWidth * 0.5 },
            { value: item.totalPurchases, color: '#f59e0b', offset: barWidth * 0.5 },
            { value: item.totalExpiryCashAdjustments, color: '#e11d48', offset: barWidth * 1.5 },
          ];
          return (
            <g key={`${item.period}-${index}`}>
              {values.map(({ value, color, offset }) => {
                const barHeight = (value / maxValue) * chartHeight;
                return <rect key={color} x={x + offset - barWidth / 2} y={chartBottom - barHeight} width={barWidth} height={Math.max(0, barHeight)} rx="2" fill={color}><title>{`${item.label}: ${money(value)}`}</title></rect>;
              })}
              {index % labelStep === 0 && <text x={x} y={248} textAnchor="middle" fill="#64748b" fontSize="10">{item.label}</text>}
            </g>
          );
        })}
        <line x1={chartLeft} x2={chartRight} y1={chartBottom} y2={chartBottom} stroke="#94a3b8" />
      </svg>
      <div className="flex flex-wrap justify-center gap-4 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-cyan-700" /> Revenue</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-violet-600" /> Collections</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Purchases</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-600" /> Expiry cash adjustments</span>
      </div>
    </div>
  );
}

function formatReportError(response: Response, payload: { error?: string }) {
  return payload.error || (response.status === 503
    ? 'UserAuthDB historical reports are unavailable.'
    : 'Historical report could not be loaded.');
}

export const HistoricalReportsDashboard: React.FC<{ pharmacy: PharmacyPdfInfo }> = ({ pharmacy }) => {
  const today = new Date();
  const [view, setView] = useState<HistoricalReportView>('monthly');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [date, setDate] = useState(today.toISOString().slice(0, 10));
  const [compare, setCompare] = useState(false);
  const [report, setReport] = useState<HistoricalReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ view });
    if (view === 'daily') params.set('date', date);
    else params.set('year', String(year));
    if (view === 'monthly') params.set('month', String(month));
    if (view === 'yearly' && compare) params.set('compare', 'true');
    return params.toString();
  }, [compare, date, month, view, year]);

  const loadReport = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/reports/analytics?${query}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatReportError(response, payload));
      setReport(payload as HistoricalReport);
      setError(null);
    } catch (loadError: any) {
      setReport(null);
      setError(loadError.message || 'Historical report could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadReport(); }, [query]);

  const summary = report?.summary;
  const periodLabel = report?.label || 'Saved report period';
  const trendDescription = view === 'monthly'
    ? 'Daily totals in the selected month'
    : view === 'yearly' && compare
      ? 'Annual comparison across all saved years'
      : view === 'yearly'
        ? 'Monthly totals in the selected year'
        : 'Selected daily snapshot';

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-700"><Database className="h-3.5 w-3.5" /> UserAuthDB analytical reports</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Monthly &amp; yearly performance</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">Aggregated only from saved daily snapshots. Inventory valuation is the last reported snapshot in the selected period.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadReport()} disabled={isLoading} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh</button>
            <button type="button" onClick={() => report && exportHistoricalReportPdf(report, pharmacy)} disabled={!report || isLoading} className="flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Download {view === 'yearly' ? 'Yearly' : view === 'monthly' ? 'Monthly' : 'Daily'} PDF</button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">View
            <select value={view} onChange={(event) => { const next = event.target.value as HistoricalReportView; setView(next); if (next !== 'yearly') setCompare(false); }} className="min-w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800">
              <option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </label>
          {view === 'daily' && <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Report date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800" />
          </label>}
          {view !== 'daily' && !compare && <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Year
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="min-w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800">
              {(report?.availableYears.length ? report.availableYears : [year]).map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}
            </select>
          </label>}
          {view === 'monthly' && <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Month
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="min-w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800">
              {monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>}
          {view === 'yearly' && <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /> Compare all years</label>}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"><strong>Report unavailable.</strong> {error}</div>}
      {isLoading && <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-sm font-semibold text-slate-500 shadow-sm"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading saved report data…</div>}
      {!isLoading && report && (
        <>
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{view === 'yearly' && compare ? 'Comparative overview' : view} report</p><h3 className="text-lg font-black text-slate-900">{periodLabel}</h3></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700">{report.summary.daysReported} days reported</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7 2xl:grid-cols-8">
            <ReportMetric label="Total revenue" value={money(summary?.totalRevenue || 0)} detail={`${summary?.salesTransactions || 0} sales transactions`} tone="bg-cyan-50 text-cyan-700" />
            <ReportMetric label="Total collections" value={money(summary?.totalCollections || 0)} detail="Paid sales + due collections + expiry cash" tone="bg-violet-50 text-violet-700" />
            <ReportMetric label="Expiry cash adjustments" value={money(summary?.totalExpiryCashAdjustments || 0)} detail="Saved adjustment totals" tone="bg-rose-50 text-rose-700" />
            <ReportMetric label="Expenses" value={money(summary?.totalExpenses || 0)} detail="Saved expense totals" tone="bg-rose-50 text-rose-700" />
            <ReportMetric label="Supplier payments" value={money(summary?.totalSupplierPayments || 0)} detail="Outgoing supplier & party payments" tone="bg-red-50 text-red-700" />
            <ReportMetric label="Employee payments" value={money(summary?.totalEmployeePayments || 0)} detail="Outgoing employee payments" tone="bg-orange-50 text-orange-700" />
            <ReportMetric label="Net after payments" value={money(summary?.netAfterPayments || 0)} detail="Collections less expenses and payments" tone="bg-emerald-50 text-emerald-700" />
            <ReportMetric label="Inventory valuation" value={money(summary?.inventoryValuation || 0)} detail="Ending snapshot in period" tone="bg-amber-50 text-amber-700" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.7fr)]">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3"><h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700"><BarChart3 className="h-4 w-4 text-cyan-700" /> {trendDescription}</h3><span className="text-[10px] font-semibold text-slate-400">{report.source}</span></div><TrendChart trend={report.trend} /></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700"><CalendarDays className="h-4 w-4 text-violet-600" /> Report details</h3><dl className="mt-4 divide-y divide-slate-100 text-xs"><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Purchases</dt><dd className="font-black text-slate-800">{money(summary?.totalPurchases || 0)}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Purchase transactions</dt><dd className="font-black text-slate-800">{summary?.purchaseTransactions || 0}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Trend points</dt><dd className="font-black text-slate-800">{report.trend.length}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Generated</dt><dd className="font-black text-slate-800">{new Date(report.generatedAt).toLocaleString()}</dd></div></dl></div>
          </div>
        </>
      )}
    </section>
  );
};