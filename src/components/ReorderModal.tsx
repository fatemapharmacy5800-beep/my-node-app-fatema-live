import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Minus,
  AlertCircle,
  Check,
  Building2,
  Package,
  Layers,
  ShoppingBag,
  TrendingDown,
  Trash2,
  DollarSign,
  Tag,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { MedicineItem, OrderItem } from '../types';

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: MedicineItem | null;
  existingOrderItem?: OrderItem | null;
  onConfirmOrder: (medicine: MedicineItem, qty: number, notes?: string) => void;
  onRemoveFromOrder?: (medicineId: number | string) => void;
  onOpenOrderDrawer?: () => void;
  totalOrderItemsCount?: number;
}

export const ReorderModal: React.FC<ReorderModalProps> = ({
  isOpen,
  onClose,
  medicine,
  existingOrderItem,
  onConfirmOrder,
  onRemoveFromOrder,
  onOpenOrderDrawer,
  totalOrderItemsCount = 0,
}) => {
  const [qty, setQty] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize values when medicine or existing item changes
  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    if (medicine) {
      if (existingOrderItem) {
        setQty(existingOrderItem.orderQty);
        setNotes(existingOrderItem.notes || '');
      } else {
        // Calculate smart suggested reorder quantity based on ROL deficit
        const deficit = Math.max(0, medicine.Reorder_Level - medicine.Total_Balance);
        const suggested = deficit > 0 ? deficit : Math.max(1, medicine.Reorder_Level > 0 ? medicine.Reorder_Level : 5);
        setQty(suggested);
        setNotes('');
      }

      // Auto focus quantity input after short timeout
      focusTimer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }

    return () => {
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [medicine, existingOrderItem, isOpen]);

  // Keyboard shortcut listener for Enter and Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, qty, notes, medicine]);

  if (!isOpen || !medicine) return null;

  const handleQtyChange = (val: number) => {
    const valid = Math.max(1, Math.min(99999, Math.floor(val)));
    setQty(isNaN(valid) ? 1 : valid);
  };

  const handleConfirm = () => {
    if (!medicine || qty <= 0) return;
    onConfirmOrder(medicine, qty, notes.trim());
    onClose();
  };

  const handleRemove = () => {
    if (!medicine || !onRemoveFromOrder) return;
    onRemoveFromOrder(medicine.id);
    onClose();
  };

  const isLowStock = medicine.Total_Balance <= medicine.Reorder_Level && medicine.Reorder_Level > 0;
  const isZeroStock = medicine.Total_Balance === 0;
  const deficit = Math.max(0, medicine.Reorder_Level - medicine.Total_Balance);

  // Calculated monetary figures
  const unitCost = medicine.Cost_Price;
  const lineTotalCost = qty * unitCost;
  const unitMRP = medicine.Rate;
  const lineTotalMRP = qty * unitMRP;
  const estimatedProfit = lineTotalMRP - lineTotalCost;
  const profitMarginPct = lineTotalMRP > 0 ? (estimatedProfit / lineTotalMRP) * 100 : 0;

  return (
    <div
      id="reorder-child-window-modal"
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4"
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Child Window Container */}
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col my-auto transition-all transform animate-scale-in">
        
        {/* Window Title Bar */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white">
                  Reorder Medicine Specification
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {existingOrderItem ? 'In Current Order' : 'New Order'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Configure exact order quantities and packaging for purchase slip
              </p>
            </div>
          </div>
          <button
            id="close-reorder-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close child window (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[calc(85vh-7rem)] overflow-y-auto">
          
          {/* Medicine Header Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {medicine.Item_Name}
                  </h2>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-200">
                    {medicine.Unit || 'Pkt'}
                  </span>
                  {medicine.Item_Code && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      Code: {medicine.Item_Code}
                    </span>
                  )}
                </div>

                {medicine.Generic_Name && (
                  <p className="text-xs text-slate-600 font-medium">
                    <span className="text-slate-400">Generic:</span> {medicine.Generic_Name}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {medicine.SName}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-700 border border-slate-200 text-[11px]">
                    Category: {medicine.Supplier_Cate}
                  </span>
                  {medicine.Location && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1 text-[11px] text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-100">
                        <MapPin className="w-3 h-3" />
                        Rack: {medicine.Location}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className="shrink-0 sm:text-right">
                {isZeroStock ? (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-100 text-red-800 text-xs font-bold border border-red-200">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Out of Stock</span>
                  </div>
                ) : isLowStock ? (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>Low Stock (Below ROL)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200">
                    <Check className="w-3.5 h-3.5" />
                    <span>In Stock</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Current Stock Inventory Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="block text-[11px] text-slate-500 font-medium">Store Balance</span>
              <span className="text-lg font-mono font-bold text-slate-800">
                {medicine.Store_Balance}
              </span>
              <span className="block text-[10px] text-slate-400">qryStore_Item_Balance</span>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="block text-[11px] text-slate-500 font-medium">Ph. Balance</span>
              <span className="text-lg font-mono font-bold text-slate-800">
                {medicine.Balance}
              </span>
              <span className="block text-[10px] text-slate-400">Pharmacy Counter</span>
            </div>

            <div className={`p-2.5 rounded-lg border ${
              isZeroStock
                ? 'border-red-300 bg-red-50/50'
                : isLowStock
                ? 'border-amber-300 bg-amber-50/50'
                : 'border-cyan-300 bg-cyan-50/40'
            }`}>
              <span className="block text-[11px] text-slate-700 font-semibold">Total Stock</span>
              <span className={`text-lg font-mono font-bold ${
                isZeroStock ? 'text-red-700' : isLowStock ? 'text-amber-800' : 'text-cyan-900'
              }`}>
                {medicine.Total_Balance}
              </span>
              <span className="block text-[10px] text-slate-500">Available units</span>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between">
                <span className="block text-[11px] text-slate-500 font-medium">Reorder Level (ROL)</span>
                {deficit > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1 rounded">
                    -{deficit}
                  </span>
                )}
              </div>
              <span className="text-lg font-mono font-bold text-slate-800">
                {medicine.Reorder_Level}
              </span>
              <span className="block text-[10px] text-slate-400">Safety Threshold</span>
            </div>
          </div>

          {/* Quantity Selector Section */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-cyan-600" />
                <span>Specify Reorder Quantity</span>
              </label>

              {deficit > 0 && (
                <button
                  type="button"
                  onClick={() => handleQtyChange(deficit)}
                  className="text-xs font-semibold text-red-700 hover:text-red-900 bg-red-100/70 hover:bg-red-200/70 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fill Deficit ({deficit} {medicine.Unit || 'Pkt'})</span>
                </button>
              )}
            </div>

            {/* Stepper with Large Input */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleQtyChange(qty - 10)}
                className="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-mono text-xs font-bold transition-colors"
                title="Minus 10"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => handleQtyChange(qty - 1)}
                className="p-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Minus 1"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="relative w-36">
                <input
                  ref={inputRef}
                  type="number"
                  min="1"
                  max="99999"
                  value={qty}
                  onChange={(e) => handleQtyChange(parseInt(e.target.value, 10))}
                  className="w-full text-center text-2xl font-bold font-mono py-1.5 px-2 bg-white border-2 border-cyan-500 rounded-lg shadow-inner focus:outline-none focus:ring-3 focus:ring-cyan-500/20 text-slate-900"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                  {medicine.Unit || 'Pkt'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleQtyChange(qty + 1)}
                className="p-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Plus 1"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleQtyChange(qty + 10)}
                className="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-mono text-xs font-bold transition-colors"
                title="Plus 10"
              >
                +10
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center justify-center flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 mr-1">Quick Presets:</span>
              {[1, 5, 10, 20, 50, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleQtyChange(preset)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-medium transition-colors ${
                    qty === preset
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing & Commercial Valuation */}
          <div className="bg-cyan-50/50 border border-cyan-200/80 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 border-b border-cyan-100 pb-2">
              <span>Unit Purchase / Cost Price:</span>
              <span className="font-mono font-semibold text-slate-900">
                Tk. {unitCost.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 border-b border-cyan-100 pb-2">
              <span>M.R.P Rate:</span>
              <span className="font-mono text-slate-700">
                Tk. {unitMRP.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 border-b border-cyan-100 pb-2">
              <span>Applied Discount:</span>
              <span className="font-mono text-emerald-700 font-semibold">
                {medicine.Percentage.toFixed(1)}% ({medicine.Disc_Pct === 0 ? 'Retail Disc' : 'Item Disc'})
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="block text-xs font-bold text-slate-800">
                  Estimated Line Total Payable:
                </span>
                <span className="block text-[11px] text-slate-500">
                  {qty} {medicine.Unit || 'Pkt'} × Tk. {unitCost.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold font-mono text-cyan-800">
                  Tk. {lineTotalCost.toFixed(2)}
                </span>
                {lineTotalMRP > lineTotalCost && (
                  <span className="block text-[10px] text-emerald-700 font-semibold">
                    Est. Margin: Tk. {estimatedProfit.toFixed(2)} ({profitMarginPct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Order Instruction / Special Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Order Note / Batch Instruction (Optional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Need expiry > 2027, urgent delivery, original carton pack..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white text-slate-800"
            />
          </div>

        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {existingOrderItem && onRemoveFromOrder && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Remove this medicine from order"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}

            {onOpenOrderDrawer && totalOrderItemsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOrderDrawer();
                }}
                className="text-xs text-slate-600 hover:text-slate-900 underline font-medium"
              >
                View Full Order Slip ({totalOrderItemsCount} items)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors shadow-2xs"
            >
              Cancel (Esc)
            </button>

            <button
              id="confirm-reorder-btn"
              type="button"
              onClick={handleConfirm}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>
                {existingOrderItem ? `Update Order (${qty} ${medicine.Unit || 'Pkt'})` : `Add to Order (${qty} ${medicine.Unit || 'Pkt'})`}
              </span>
              <kbd className="hidden sm:inline-block bg-cyan-800/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-200">
                ↵ Enter
              </kbd>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
