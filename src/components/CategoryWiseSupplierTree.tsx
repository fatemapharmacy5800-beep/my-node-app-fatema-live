import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Building2,
  FileText,
  Filter,
  Layers,
  Search,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { MedicineItem, Supplier } from '../types';

interface CategoryWiseSupplierTreeProps {
  medicines: MedicineItem[];
  suppliersList?: Supplier[];
  selectedCategory: string;
  selectedSupplier: string;
  onSelectCategory: (category: string) => void;
  onSelectSupplier: (supplier: string, category?: string) => void;
  onClearFilter: () => void;
  reportName?: string;
  totalCount: number;
}

export const CategoryWiseSupplierTree: React.FC<CategoryWiseSupplierTreeProps> = ({
  medicines,
  suppliersList = [],
  selectedCategory,
  selectedSupplier,
  onSelectCategory,
  onSelectSupplier,
  onClearFilter,
  reportName = 'MedicineItems - RealStockWithStore.rpt',
  totalCount,
}) => {
  // Master category ordering matching Crystal Report navigation tree
  const CATEGORY_ORDER = ['A-Grade', 'B-Grade', 'Broker Collections', 'Market Collection', 'Others', 'Unknown'];

  // Track expanded state for categories and root
  const [rootExpanded, setRootExpanded] = useState<boolean>(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'A-Grade': true,
    'B-Grade': true,
    'Broker Collections': true,
    'Market Collection': true,
    'Others': true,
    'Unknown': false,
  });

  const [filterText, setFilterText] = useState<string>('');

  // Group suppliers and their item counts under each category
  const treeData = useMemo(() => {
    const catMap = new Map<string, Map<string, { count: number; totalStock: number; id?: number }>>();

    // 1. Seed categories and suppliers from database Suppliers table if provided
    if (suppliersList && suppliersList.length > 0) {
      suppliersList.forEach((sup) => {
        const cat = sup.Supplier_Cate || 'Unknown';
        const name = sup.SName || 'Unknown Supplier';
        if (!catMap.has(cat)) {
          catMap.set(cat, new Map());
        }
        const supMap = catMap.get(cat)!;
        if (!supMap.has(name)) {
          supMap.set(name, { count: 0, totalStock: 0, id: sup.Supplier_ID });
        }
      });
    }

    // 2. Count actual stock medicines per category & supplier
    medicines.forEach((med) => {
      const cat = med.Supplier_Cate || 'Unknown';
      const sup = med.SName || 'Unknown Supplier';

      if (!catMap.has(cat)) {
        catMap.set(cat, new Map());
      }
      const supMap = catMap.get(cat)!;

      if (!supMap.has(sup)) {
        supMap.set(sup, { count: 0, totalStock: 0, id: med.Supplier_ID });
      }
      const supEntry = supMap.get(sup)!;
      supEntry.count += 1;
      supEntry.totalStock += med.Total_Balance || 0;
    });

    // Sort categories according to CATEGORY_ORDER
    const sortedCats = Array.from(catMap.keys()).sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a);
      const idxB = CATEGORY_ORDER.indexOf(b);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    return sortedCats.map((cat) => {
      const supMap = catMap.get(cat)!;
      // Sort suppliers alphabetically
      const suppliers = Array.from(supMap.entries())
        .map(([name, data]) => ({
          name,
          itemCount: data.count,
          totalStock: data.totalStock,
          id: data.id,
        }))
        .filter((supplier) => supplier.itemCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

      const totalItemsInCat = suppliers.reduce((sum, s) => sum + s.itemCount, 0);

      return {
        categoryName: cat,
        totalItems: totalItemsInCat,
        suppliers,
      };
    }).filter((category) => category.suppliers.length > 0);
  }, [medicines, suppliersList]);

  // Toggle category expand/collapse
  const toggleCategory = (catName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // Expand all / Collapse all helper
  const handleExpandAll = () => {
    const updated: Record<string, boolean> = {};
    treeData.forEach((c) => {
      updated[c.categoryName] = true;
    });
    setExpandedCategories(updated);
    setRootExpanded(true);
  };

  const handleCollapseAll = () => {
    const updated: Record<string, boolean> = {};
    treeData.forEach((c) => {
      updated[c.categoryName] = false;
    });
    setExpandedCategories(updated);
  };

  const isAnyFilterActive = Boolean(selectedCategory || selectedSupplier);

  return (
    <aside
      id="crystal-report-left-panel"
      className="w-full md:w-72 lg:w-80 shrink-0 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col h-full overflow-hidden select-none"
    >
      {/* Panel Top Header */}
      <div className="bg-slate-50/80 px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-cyan-700 shrink-0" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">
            Report Navigation
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExpandAll}
            className="text-[10px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50"
            title="Expand All Nodes"
          >
            + All
          </button>
          <button
            onClick={handleCollapseAll}
            className="text-[10px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50"
            title="Collapse All Nodes"
          >
            - All
          </button>
        </div>
      </div>

      {/* Quick Search inside Tree */}
      <div className="p-2 border-b border-slate-100 bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Quick find supplier..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs border border-slate-200 rounded bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Tree View Navigation Container matching Crystal Report Tree */}
      <div className="flex-1 overflow-y-auto p-2 font-sans text-xs text-slate-800 space-y-1">
        
        {/* Root Node: Report (.rpt) */}
        <div className="group">
          <div
            onClick={() => {
              setRootExpanded(!rootExpanded);
              onClearFilter();
            }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors ${
              !selectedCategory && !selectedSupplier
                ? 'bg-cyan-50 text-cyan-900 font-semibold'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
            title="Click to view all items across all suppliers and categories"
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                setRootExpanded(!rootExpanded);
              }}
              className="text-slate-400 hover:text-slate-700 w-4 h-4 flex items-center justify-center shrink-0 cursor-pointer"
            >
              {rootExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>

            <FileText className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
            <span className="truncate text-[11px] font-medium font-mono text-slate-900">
              {reportName}
            </span>
            <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-full font-mono">
              {totalCount}
            </span>
          </div>

          {/* Categories & Suppliers Children List */}
          {rootExpanded && (
            <div className="ml-4 pl-2 border-l border-slate-200 space-y-1 mt-1">
              {treeData.map((cat) => {
                const isCatSelected = selectedCategory === cat.categoryName && !selectedSupplier;
                const isCatExpanded = expandedCategories[cat.categoryName] ?? true;

                // Filter suppliers if search query entered
                const filteredSuppliers = filterText
                  ? cat.suppliers.filter((s) =>
                      s.name.toLowerCase().includes(filterText.toLowerCase())
                    )
                  : cat.suppliers;

                // Don't render category if search filter is active and has no matches
                if (filterText && filteredSuppliers.length === 0) {
                  return null;
                }

                return (
                  <div key={cat.categoryName} className="space-y-0.5">
                    {/* Category Level Node */}
                    <div
                      onClick={() => onSelectCategory(cat.categoryName)}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors group/cat ${
                        isCatSelected
                          ? 'bg-cyan-600 text-white font-semibold shadow-xs'
                          : selectedCategory === cat.categoryName
                          ? 'bg-cyan-100/60 text-cyan-900 font-medium'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                      title={`Filter by category: ${cat.categoryName} (${cat.totalItems} items)`}
                    >
                      {/* +/- toggle button matching Crystal Reports */}
                      <button
                        type="button"
                        onClick={(e) => toggleCategory(cat.categoryName, e)}
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] leading-none shrink-0 ${
                          isCatSelected
                            ? 'border-cyan-300 bg-cyan-700 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {isCatExpanded ? '−' : '+'}
                      </button>

                      {isCatExpanded ? (
                        <FolderOpen
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isCatSelected ? 'text-white' : 'text-amber-500'
                          }`}
                        />
                      ) : (
                        <Folder
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isCatSelected ? 'text-white' : 'text-amber-500'
                          }`}
                        />
                      )}

                      <span className="truncate text-xs font-semibold">
                        {cat.categoryName}
                      </span>

                      <span
                        className={`ml-auto text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          isCatSelected
                            ? 'bg-cyan-700 text-white'
                            : 'text-slate-400 bg-slate-100'
                        }`}
                      >
                        {cat.suppliers.length}
                      </span>
                    </div>

                    {/* Supplier Children Level */}
                    {isCatExpanded && (
                      <div className="ml-4 pl-2 border-l border-dashed border-slate-200 space-y-0.5 mt-0.5">
                        {filteredSuppliers.map((sup) => {
                          const isSupSelected = selectedSupplier === sup.name;

                          return (
                            <div
                              key={sup.name}
                              onClick={() => onSelectSupplier(sup.name, cat.categoryName)}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors text-[11px] ${
                                isSupSelected
                                  ? 'bg-red-600 text-white font-semibold shadow-xs'
                                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                              }`}
                              title={`${sup.name} • ${sup.itemCount} medicines`}
                            >
                              <Building2
                                className={`w-3 h-3 shrink-0 ${
                                  isSupSelected ? 'text-white' : 'text-slate-400'
                                }`}
                              />
                              <span className="truncate flex-1">
                                {sup.name}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1 py-0.2 rounded shrink-0 ${
                                  isSupSelected
                                    ? 'bg-red-700 text-white'
                                    : 'text-slate-400 bg-slate-50'
                                }`}
                              >
                                {sup.itemCount}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Panel Footer: Clear & Active Filter Status */}
      <div className="p-2.5 bg-slate-50/90 border-t border-slate-200 text-xs text-slate-600">
        <div className="flex items-center justify-between gap-1">
          <div className="truncate">
            {selectedSupplier ? (
              <span className="text-[11px] font-medium text-red-700 truncate block">
                Supplier: <strong className="text-slate-900">{selectedSupplier}</strong>
              </span>
            ) : selectedCategory ? (
              <span className="text-[11px] font-medium text-cyan-800 truncate block">
                Category: <strong className="text-slate-900">{selectedCategory}</strong>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                All suppliers active
              </span>
            )}
          </div>

          {isAnyFilterActive && (
            <button
              onClick={onClearFilter}
              className="text-[11px] font-medium text-cyan-700 hover:text-cyan-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-colors shrink-0"
              title="Reset category & supplier filter to view all"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
