import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus, Minus, Download, Printer, ShoppingBag, Send, Edit3 } from 'lucide-react';
import { OrderItem, MedicineItem } from '../types';
import { PHARMACY_INFO } from '../sampleData';

interface OrderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orderItems: OrderItem[];
  onUpdateQty: (medicineId: number | string, qty: number) => void;
  onRemoveItem: (medicineId: number | string) => void;
  onClearOrder: () => void;
  onExportPdf: () => void;
  onPrintPos: () => void;
  orderNotes: string;
  onOrderNotesChange: (notes: string) => void;
  supplierFilter: string;
  onSupplierFilterChange: (supplier: string) => void;
  onOpenReorderModal?: (medicine: MedicineItem) => void;
}

export const OrderDrawer: React.FC<OrderDrawerProps> = ({
  isOpen,
  onClose,
  orderItems,
  onUpdateQty,
  onRemoveItem,
  onClearOrder,
  onExportPdf,
  onPrintPos,
  orderNotes,
  onOrderNotesChange,
  supplierFilter,
  onSupplierFilterChange,
  onOpenReorderModal,
}) => {
  // Filter items by supplier if selected
  const availableSuppliers = Array.from(new Set(orderItems.map((item) => item.medicine.SName)));
  const displayedItems = supplierFilter
    ? orderItems.filter((i) => i.medicine.SName === supplierFilter)
    : orderItems;

  useEffect(() => {
    if (supplierFilter && !availableSuppliers.includes(supplierFilter)) {
      onSupplierFilterChange('');
    }
  }, [availableSuppliers.join('|'), onSupplierFilterChange, supplierFilter]);

  if (!isOpen) return null;

  const totalUnits = displayedItems.reduce((acc, curr) => acc + curr.orderQty, 0);
  const totalCost = displayedItems.reduce((acc, curr) => acc + curr.subtotal, 0);
  const totalMRP = displayedItems.reduce((acc, curr) => acc + curr.orderQty * curr.medicine.Rate, 0);
  const estimatedMargin = totalMRP > 0 ? ((totalMRP - totalCost) / totalMRP) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-cyan-400" />
              <div>
                <h2 className="text-base font-bold tracking-tight">Medicine Purchase Order</h2>
                <p className="text-xs text-slate-400">
                  {orderItems.length} items selected for distributor order
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Supplier filter if multiple suppliers in order */}
          {availableSuppliers.length > 1 && (
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Filter Order By Supplier:</span>
              <select
                value={supplierFilter}
                onChange={(e) => onSupplierFilterChange(e.target.value)}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-800 font-medium"
              >
                <option value="">All Suppliers ({availableSuppliers.length})</option>
                {availableSuppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Item List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {displayedItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-base font-medium text-slate-600">Your order list is empty</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Select medicines from the stock inventory using mouse clicks, or use the ↑/↓ arrow keys and press Enter.
                </p>
              </div>
            ) : (
              displayedItems.map((item) => {
                const med = item.medicine;
                return (
                  <div
                    key={med.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenReorderModal && onOpenReorderModal(med)}
                          className="text-sm font-bold text-slate-900 truncate hover:text-cyan-700 hover:underline text-left"
                          title="Click to open child window & adjust specifications"
                        >
                          {med.Item_Name}
                        </button>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 shrink-0">
                          {med.Unit || 'Pkt'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supplier: <span className="font-medium text-slate-700">{med.SName}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600">
                        <span>Stock: <strong className={med.Total_Balance <= med.Reorder_Level ? 'text-red-600' : 'text-slate-800'}>{med.Total_Balance}</strong></span>
                        <span>•</span>
                        <span>Cost: <strong>Tk. {med.Cost_Price.toFixed(2)}</strong></span>
                        <span>•</span>
                        <span>M.R.P: <strong>Tk. {med.Rate.toFixed(2)}</strong></span>
                      </div>
                      {item.notes && (
                        <div className="mt-1 text-[10px] text-cyan-800 bg-cyan-50/80 px-2 py-0.5 rounded border border-cyan-100 font-medium">
                          Note: {item.notes}
                        </div>
                      )}
                    </div>

                    {/* Quantity & Controls */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                      {onOpenReorderModal && (
                        <button
                          type="button"
                          onClick={() => onOpenReorderModal(med)}
                          className="p-1.5 text-cyan-700 hover:bg-cyan-50 rounded-md transition-colors border border-cyan-200"
                          title="Open reorder child window to adjust specifications"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="flex items-center border border-slate-300 rounded-md bg-white shadow-2xs">
                        <button
                          onClick={() => onUpdateQty(med.id, item.orderQty - 1)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors rounded-l-md"
                          title="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.orderQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            onUpdateQty(med.id, isNaN(val) ? 1 : val);
                          }}
                          className="w-12 text-center text-xs font-bold text-slate-800 focus:outline-none py-1"
                        />
                        <button
                          onClick={() => onUpdateQty(med.id, item.orderQty + 1)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors rounded-r-md"
                          title="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-right min-w-[75px]">
                        <span className="block text-xs font-bold text-slate-900">
                          Tk. {item.subtotal.toFixed(2)}
                        </span>
                        <span className="block text-[10px] text-slate-400">Subtotal</span>
                      </div>

                      <button
                        onClick={() => onRemoveItem(med.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Order Notes Field */}
            {displayedItems.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Order Instructions / Remarks (Printed on PDF):
                </label>
                <textarea
                  value={orderNotes}
                  onChange={(e) => onOrderNotesChange(e.target.value)}
                  placeholder="e.g. Please deliver by tomorrow morning, check batch expiry date..."
                  rows={2}
                  className="w-full p-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800"
                />
              </div>
            )}
          </div>

          {/* Drawer Footer & Order Summary */}
          {displayedItems.length > 0 && (
            <div className="p-6 bg-slate-50 border-t border-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
                <div className="p-2 bg-white rounded border border-slate-200 shadow-2xs">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Total Items</span>
                  <span className="text-sm font-bold text-slate-800">{displayedItems.length}</span>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200 shadow-2xs">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Total Units</span>
                  <span className="text-sm font-bold text-slate-800">{totalUnits}</span>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200 shadow-2xs">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Total MRP</span>
                  <span className="text-sm font-bold text-slate-800">Tk. {totalMRP.toFixed(0)}</span>
                </div>
                <div className="p-2 bg-cyan-50 rounded border border-cyan-200 shadow-2xs">
                  <span className="block text-[10px] text-cyan-800 uppercase font-semibold">Est. Total Cost</span>
                  <span className="text-sm font-bold text-cyan-900">Tk. {totalCost.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={onClearOrder}
                  className="w-full sm:w-auto px-3.5 py-2.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-slate-400" />
                  <span>Clear List</span>
                </button>

                <button
                  id="export-order-pdf-btn"
                  onClick={onExportPdf}
                  className="w-full sm:flex-1 px-4 py-2.5 rounded-md bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Purchase Order (PDF)</span>
                </button>

                <button
                  id="print-pos-receipt-btn"
                  onClick={onPrintPos}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                  title="Print a compact receipt on a 58mm or 80mm POS printer"
                >
                  <Printer className="w-4 h-4" />
                  <span>POS Print</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {createPortal(
        /* Keep the print-only DOM outside #root so the rest of the app
           cannot add hidden inventory pages to the print job. */
        <section className="pos-print-receipt" aria-hidden="true">
          <h1>{PHARMACY_INFO.name}</h1>
          <p>{PHARMACY_INFO.address}</p>
          <p>{PHARMACY_INFO.phone}</p>
          <div className="pos-receipt-rule" />
          <p className="pos-receipt-title">MEDICINE PURCHASE ORDER</p>
          <p>{new Date().toLocaleString('en-GB')}</p>
          {supplierFilter && <p>Supplier: {supplierFilter}</p>}
          <div className="pos-receipt-rule" />
          {displayedItems.map((item) => (
            <div className="pos-receipt-item" key={item.medicine.id}>
              {item.medicine.Item_Name} - {item.orderQty} BOX
            </div>
          ))}
          <div className="pos-receipt-rule" />
          <div className="pos-receipt-total">
            <span>Total Items: {displayedItems.length} | Total Boxes: {totalUnits}</span>
          </div>
          {orderNotes && <p className="pos-receipt-notes">Note: {orderNotes}</p>}
          <p className="pos-receipt-thanks">Thank you</p>
        </section>,
        document.body,
      )}
    </div>
  );
};
