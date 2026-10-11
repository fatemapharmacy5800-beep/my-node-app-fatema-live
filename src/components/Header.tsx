import React from 'react';
import { Database, RefreshCw, Volume2, VolumeX, FileText, ShoppingCart, Settings, ShieldCheck, PanelLeft, PanelLeftClose } from 'lucide-react';
import { DatabaseStatus, OrderItem } from '../types';
import { PHARMACY_INFO } from '../sampleData';

interface HeaderProps {
  dbStatus: DatabaseStatus;
  isSyncing: boolean;
  onManualSync: () => void;
  syncCountdown: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  orderItems: OrderItem[];
  onOpenOrder: () => void;
  onExportStockPdf: () => void;
  onOpenConfig: () => void;
  isLeftPanelOpen?: boolean;
  onToggleLeftPanel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  dbStatus,
  isSyncing,
  onManualSync,
  syncCountdown,
  soundEnabled,
  onToggleSound,
  orderItems,
  onOpenOrder,
  onExportStockPdf,
  onOpenConfig,
  isLeftPanelOpen = true,
  onToggleLeftPanel,
}) => {
  const totalOrderUnits = orderItems.reduce((acc, curr) => acc + curr.orderQty, 0);
  const minutes = Math.floor(syncCountdown / 60);
  const seconds = syncCountdown % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Pharmacy Identity Branding */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-cyan-700 text-white rounded-lg flex items-center justify-center font-bold text-xl tracking-wider shadow-sm select-none shrink-0">
              {PHARMACY_INFO.logoInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 tracking-tight">
                  {PHARMACY_INFO.name}
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
                  SQL Server 2000 Read-Only
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <span>{PHARMACY_INFO.address}</span>
                <span>•</span>
                <span className="font-medium text-slate-700">{PHARMACY_INFO.phone}</span>
              </p>
            </div>
          </div>

          {/* Status Indicators & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Live Green Beeping Indicator */}
            <div
              id="db-indicator-badge"
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-slate-50 border-slate-200 text-xs font-medium text-slate-700 shadow-xs select-none"
              title={dbStatus.connected ? 'Connected to live SQL Server' : 'Running in Standalone Preview mode (Ready for local SQL Server 2000)'}
            >
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-xs shadow-emerald-500/50"></span>
              </div>
              <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                {dbStatus.connected ? 'DB Online' : 'Database Ready'}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-mono text-[11px]" title="Auto stock sync in 5 minutes">
                Sync in {timeFormatted}
              </span>
            </div>

            {/* Sync Now Button */}
            <button
              id="sync-now-btn"
              onClick={onManualSync}
              disabled={isSyncing}
              className={`p-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-1.5 text-xs font-medium ${
                isSyncing ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              title="Trigger 5-minute stock inventory sync immediately"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>

            {/* Sound Beep Toggle */}
            <button
              id="sound-toggle-btn"
              onClick={onToggleSound}
              className={`p-2 rounded-md border text-xs font-medium transition-colors flex items-center gap-1 ${
                soundEnabled
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
              title={soundEnabled ? 'Sync audio chime enabled (Click to mute)' : 'Sync audio chime muted (Click to enable)'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{soundEnabled ? 'Beep On' : 'Mute'}</span>
            </button>

            {/* Database & Standalone Setup Guide */}
            <button
              id="db-config-modal-btn"
              onClick={onOpenConfig}
              className="p-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Database connection settings & SQL Server 2000 setup guide"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden md:inline">DB Config</span>
            </button>

            {/* Left Panel Toggle (Crystal Report Hierarchy) */}
            {onToggleLeftPanel && (
              <button
                id="toggle-left-panel-btn"
                onClick={onToggleLeftPanel}
                className={`p-2 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isLeftPanelOpen
                    ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
                title={isLeftPanelOpen ? 'Hide category-wise supplier left panel' : 'Show category-wise supplier left panel'}
              >
                {isLeftPanelOpen ? <PanelLeftClose className="w-3.5 h-3.5 text-cyan-700" /> : <PanelLeft className="w-3.5 h-3.5 text-slate-600" />}
                <span className="hidden lg:inline">{isLeftPanelOpen ? 'Tree Panel' : 'Tree Panel'}</span>
              </button>
            )}

            {/* Export Stock PDF (Crystal Reports Format) */}
            <button
              id="export-stock-pdf-btn"
              onClick={onExportStockPdf}
              className="px-3 py-1.5 rounded-md border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              title="Export Stock Report PDF matching Crystal Report format"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-700" />
              <span>Stock PDF</span>
            </button>

            {/* Current Order Drawer Button */}
            <button
              id="view-order-cart-btn"
              onClick={onOpenOrder}
              className="px-3.5 py-1.5 rounded-md bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
              title="Open current medicine order list"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Order List</span>
              {orderItems.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-400 text-slate-900 text-[10px] font-bold rounded-full">
                  {orderItems.length}
                </span>
              )}
            </button>

          </div>
        </div>
      </div>
    </header>
  );
};
