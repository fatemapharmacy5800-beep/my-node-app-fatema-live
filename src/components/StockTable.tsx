import React, { useEffect, useMemo, useRef } from 'react';
import { Plus, Check, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { MedicineItem } from '../types';
import { sortMedicinesForDisplay } from '../utils/medicineOrdering';

interface StockTableProps {
  medicines: MedicineItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddToOrder: (medicine: MedicineItem, qty?: number) => void;
  onOpenReorderModal: (medicine: MedicineItem) => void;
  orderedMedicineIds: Set<number | string>;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

export const StockTable: React.FC<StockTableProps> = ({
  medicines,
  selectedIndex,
  onSelectIndex,
  onAddToOrder,
  onOpenReorderModal,
  orderedMedicineIds,
  isMaximized,
  onToggleMaximize,
}) => {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected row into view on arrow key navigation
  useEffect(() => {
    const selectedRow = selectedIndex >= 0 ? rowRefs.current[selectedIndex] : null;
    const scrollContainer = tableScrollRef.current;

    if (selectedRow && scrollContainer) {
      // scrollIntoView() can place an upward-selected row behind the sticky
      // table header. Move the scroll container by the exact visible overlap
      // instead, keeping the active row below the column headers.
      const containerRect = scrollContainer.getBoundingClientRect();
      const header = scrollContainer.querySelector('thead');
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const rowRect = selectedRow.getBoundingClientRect();
      const visibleTop = containerRect.top + headerHeight + 2;
      const visibleBottom = containerRect.bottom - 2;

      if (rowRect.top < visibleTop) {
        scrollContainer.scrollTop -= visibleTop - rowRect.top;
      } else if (rowRect.bottom > visibleBottom) {
        scrollContainer.scrollTop += rowRect.bottom - visibleBottom;
      }

      // Keep the active medicine row as the real focused element when the
      // user is already navigating the table. Do not steal focus from search
      // or filter controls while their result set is being recomputed.
      if (tableRef.current?.contains(document.activeElement)) {
        selectedRow?.focus({ preventScroll: true });
      }
    }
  }, [selectedIndex]);

  // Group items hierarchically: Category -> Supplier -> Subgroup
  type GroupStructure = {
    category: string;
    suppliers: {
      supplierName: string;
      subGroups: {
        subGroupName: string;
        items: { item: MedicineItem; globalIndex: number }[];
      }[];
    }[];
  };

  const groupedData = useMemo<GroupStructure[]>(() => {
    const grouped: GroupStructure[] = [];
    const categoryMap = new Map<string, Map<string, Map<string, { item: MedicineItem; globalIndex: number }[]>>>();
    const orderedMedicines = sortMedicinesForDisplay(medicines);

    orderedMedicines.forEach((item, globalIndex) => {
      const cat = item.Supplier_Cate || 'A-Grade';
      const sup = item.SName || 'Unknown Supplier';
      const sub = item.Group_Name || 'General Items';

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, new Map());
      }
      const supMap = categoryMap.get(cat)!;

      if (!supMap.has(sup)) {
        supMap.set(sup, new Map());
      }
      const subMap = supMap.get(sup)!;

      if (!subMap.has(sub)) {
        subMap.set(sub, []);
      }
      subMap.get(sub)!.push({ item, globalIndex });
    });

    // Crystal Report group order as shown in image.png tree
    const CATEGORY_ORDER = ['A-Grade', 'B-Grade', 'Broker Collections', 'Market Collection', 'Others', 'Unknown'];
    const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a);
      const idxB = CATEGORY_ORDER.indexOf(b);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    sortedCategories.forEach((cat) => {
      const supMap = categoryMap.get(cat)!;
      const suppliers: GroupStructure['suppliers'] = [];
      supMap.forEach((subMap, sup) => {
        const subGroups: GroupStructure['suppliers'][0]['subGroups'] = [];
        subMap.forEach((items, sub) => {
          subGroups.push({ subGroupName: sub, items });
        });
        suppliers.push({ supplierName: sup, subGroups });
      });
      grouped.push({ category: cat, suppliers });
    });

    return grouped;
  }, [medicines]);

  if (medicines.length === 0) {
    return (
      <div
        ref={tableRef}
        id="stock-inventory-table"
        tabIndex={0}
        onClick={() => tableRef.current?.focus()}
        className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
      >
        <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-base font-medium text-slate-700">No medicines found</p>
        <p className="text-xs text-slate-400 mt-1">Try changing your search terms or clearing active filters</p>
      </div>
    );
  }

  let rowCounter = 1;

  return (
    <div
      ref={tableRef}
      id="stock-inventory-table"
      tabIndex={0}
      onClick={() => {
        tableRef.current?.focus();
        rowRefs.current[selectedIndex]?.focus({ preventScroll: true });
      }}
      className={`bg-white border border-slate-200 shadow-xs overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 flex flex-col ${
        isMaximized
          ? 'rounded-lg h-full min-h-0'
          : 'rounded-lg lg:h-[calc(100vh-15rem)] lg:min-h-0'
      }`}
    >
      
      {/* Report Header Bar */}
      <div className="shrink-0 px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase flex items-center gap-2">
          <span>Total Medicine Stock Inventory</span>
          <span className="text-[11px] font-normal lowercase text-slate-500 font-mono">
            (click row or use ↑/↓ arrows to order)
          </span>
        </h2>
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMaximize();
            }}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 font-semibold flex items-center gap-1.5 transition-colors"
            title={isMaximized ? 'Exit full screen (Esc)' : 'Maximize inventory table'}
            aria-label={isMaximized ? 'Exit full screen' : 'Maximize inventory table'}
            aria-pressed={isMaximized}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isMaximized ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
            <span className="text-[11px]">Critical / Zero Stock</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
            <span className="text-[11px]">Reorder Needed (≤ ROL)</span>
          </span>
        </div>
      </div>

      <div ref={tableScrollRef} className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
          
          {/* Main Column Headers matching Screenshot_1.png */}
          <thead className="sticky top-0 z-30">
            <tr className="bg-cyan-800 text-white font-semibold text-[11px] select-none">
              <th className="py-2 px-2 text-center w-10 border-r border-cyan-700">#</th>
              <th className="py-2 px-3 border-r border-cyan-700">Product Name</th>
              <th className="py-2 px-2 text-right w-16 border-r border-cyan-700">Debit</th>
              <th className="py-2 px-2 text-center w-14 border-r border-cyan-700">ROL</th>
              
              {/* Store Balance (Yellow column in Screenshot_1) */}
              <th className="py-2 px-2 text-center w-24 bg-amber-500 text-slate-900 border-r border-amber-600 font-bold">
                Store. Balance
              </th>
              
              {/* Ph. Balance (Green/Teal column in Screenshot_1) */}
              <th className="py-2 px-2 text-center w-22 bg-emerald-600 text-white border-r border-emerald-700 font-bold">
                Ph. Balance
              </th>
              
              {/* Total Balance (Cyan column in Screenshot_1) */}
              <th className="py-2 px-2 text-center w-24 bg-cyan-600 text-white border-r border-cyan-700 font-bold">
                Total. Balance
              </th>

              <th className="py-2 px-2 text-right w-20 border-r border-cyan-700">Cost Price</th>
              <th className="py-2 px-2 text-right w-18 border-r border-cyan-700">M.R.P</th>
              <th className="py-2 px-2 text-center w-16 border-r border-cyan-700">Dis %</th>
              <th className="py-2 px-2 text-right w-20 border-r border-cyan-700">SaleRate</th>
              <th className="py-2 px-3 text-center w-28 bg-slate-900 text-white">Order Action</th>
            </tr>
          </thead>

          <tbody>
            {groupedData.map((catGroup) => (
              <React.Fragment key={catGroup.category}>
                
                {/* Level 1: Category Header (Cyan Bar) */}
                <tr className="bg-cyan-500 text-white font-bold select-none">
                  <td colSpan={12} className="py-1.5 px-4 text-xs tracking-wider shadow-inner">
                    {catGroup.category}
                  </td>
                </tr>

                {catGroup.suppliers.map((supGroup) => (
                  <React.Fragment key={supGroup.supplierName}>
                    
                    {/* Level 2: Supplier Header (Red Bar) */}
                    <tr className="bg-red-600 text-white font-bold select-none">
                      <td colSpan={12} className="py-1.5 px-6 text-xs tracking-wide shadow-inner">
                        {supGroup.supplierName}
                      </td>
                    </tr>

                    {supGroup.subGroups.map((subGroup) => (
                      <React.Fragment key={subGroup.subGroupName}>
                        
                        {/* Level 3: Subgroup / Brand Header */}
                        <tr className="bg-slate-100/90 text-slate-800 font-semibold border-y border-slate-200 select-none">
                          <td colSpan={12} className="py-1 px-8 text-[11px] text-cyan-900 italic">
                            • {subGroup.subGroupName}
                          </td>
                        </tr>

                        {/* Medicine Item Rows */}
                        {subGroup.items.map(({ item, globalIndex }) => {
                          const isSelected = selectedIndex === globalIndex;
                          const isOrdered = orderedMedicineIds.has(item.id);
                          const isZeroStock = item.Total_Balance === 0;
                          const isLowStock = item.Total_Balance <= item.Reorder_Level && item.Reorder_Level > 0;
                          const storeIsZero = item.Store_Balance === 0;

                          return (
                            <tr
                              key={item.id}
                              id={`stock-row-${item.id}`}
                              ref={(el) => {
                                rowRefs.current[globalIndex] = el;
                              }}
                              tabIndex={isSelected ? 0 : -1}
                              aria-selected={isSelected}
                              onFocus={() => onSelectIndex(globalIndex)}
                              onClick={() => {
                                onSelectIndex(globalIndex);
                                tableRef.current?.focus();
                              }}
                              onDoubleClick={() => onOpenReorderModal(item)}
                              className={`transition-colors cursor-pointer border-b border-slate-100 ${
                                isSelected
                                  ? 'bg-cyan-100/80 ring-2 ring-cyan-500 ring-inset font-medium'
                                  : isZeroStock
                                  ? 'bg-red-50/40 hover:bg-red-50/80'
                                  : isLowStock
                                  ? 'bg-amber-50/30 hover:bg-amber-50/70'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              {/* Row Number */}
                              <td className="py-1.5 px-2 text-center text-slate-400 font-mono text-[11px]">
                                {rowCounter++}
                              </td>

                              {/* Product Name */}
                              <td className="py-1.5 px-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectIndex(globalIndex);
                                      onOpenReorderModal(item);
                                    }}
                                    className={`text-left hover:underline focus:outline-none font-medium ${
                                      isZeroStock
                                        ? 'text-red-700 font-bold'
                                        : isLowStock
                                        ? 'text-amber-800 font-semibold'
                                        : 'text-slate-900 hover:text-cyan-800'
                                    }`}
                                    title={item.Generic_Name ? `Click to reorder | Generic: ${item.Generic_Name}${item.Item_Code ? ` | Code: ${item.Item_Code}` : ''}${item.Location ? ` | Rack: ${item.Location}` : ''}` : 'Click to reorder medicine'}
                                  >
                                    {item.Item_Name}
                                  </button>
                                  {item.Item_Code && (
                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1 rounded border border-slate-200">
                                      {item.Item_Code}
                                    </span>
                                  )}
                                  {item.Unit && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      ({item.Unit})
                                    </span>
                                  )}
                                  {item.Location && (
                                    <span className="text-[9px] text-cyan-700 font-mono bg-cyan-50 px-1 rounded border border-cyan-100" title={`Location: ${item.Location}`}>
                                      {item.Location}
                                    </span>
                                  )}
                                  {isZeroStock && (
                                    <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 font-bold">
                                      OUT
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Debit */}
                              <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                                {item.Debit > 0 ? item.Debit.toLocaleString() : '-'}
                              </td>

                              {/* ROL */}
                              <td className="py-1.5 px-2 text-center font-mono text-slate-600">
                                <span className={item.Reorder_Level > 0 ? 'font-medium' : 'text-slate-400'}>
                                  {item.Reorder_Level}
                                </span>
                              </td>

                              {/* Store. Balance (yellowish cell, pink if 0) */}
                              <td
                                className={`py-1.5 px-2 text-center font-mono font-medium ${
                                  storeIsZero ? 'bg-red-100/60 text-red-700' : 'bg-amber-50 text-slate-800'
                                }`}
                              >
                                {item.Store_Balance}
                              </td>

                              {/* Ph. Balance */}
                              <td className="py-1.5 px-2 text-center font-mono font-medium bg-emerald-50/60 text-slate-800">
                                {item.Balance}
                              </td>

                              {/* Total. Balance (Red if zero or low stock) */}
                              <td
                                className={`py-1.5 px-2 text-center font-mono font-bold ${
                                  isZeroStock
                                    ? 'text-red-600 bg-red-100/80'
                                    : isLowStock
                                    ? 'text-amber-700 bg-amber-100/60'
                                    : 'text-cyan-900 bg-cyan-50/60'
                                }`}
                              >
                                {item.Total_Balance}
                              </td>

                              {/* Cost Price */}
                              <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                {item.Cost_Price.toFixed(2)}
                              </td>

                              {/* M.R.P */}
                              <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                {item.Rate.toFixed(2)}
                              </td>

                              {/* Dis % */}
                              <td className="py-1.5 px-2 text-center font-mono text-slate-500">
                                {item.Percentage.toFixed(2)} %
                              </td>

                              {/* SaleRate */}
                              <td className="py-1.5 px-2 text-right font-mono font-semibold text-slate-800">
                                {item.SaleRate.toFixed(2)}
                              </td>

                              {/* Quick Order Button */}
                              <td className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  id={`order-btn-${item.id}`}
                                  onClick={() => onOpenReorderModal(item)}
                                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center justify-center gap-1 mx-auto transition-all shadow-2xs ${
                                    isOrdered
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-cyan-700 hover:bg-cyan-800 text-white'
                                  }`}
                                  title={isOrdered ? "Item in order list - Click to adjust order" : "Open Reorder child window to specify quantity"}
                                >
                                  {isOrdered ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      <span>In Order</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3 h-3" />
                                      <span>+ Reorder</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
