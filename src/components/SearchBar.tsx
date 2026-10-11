import React, { useRef, useEffect } from 'react';
import { Search, AlertTriangle, XCircle, Filter, CornerDownLeft, ArrowUpDown } from 'lucide-react';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedCategory: string;
  onCategoryChange: (val: string) => void;
  categories: string[];
  selectedSupplier: string;
  onSupplierChange: (val: string) => void;
  onNavigateToItems: () => void;
  onNavigateToSupplier: () => void;
  onNavigateToSearch: () => void;
  suppliers: string[];
  lowStockOnly: boolean;
  onToggleLowStock: () => void;
  zeroStockOnly: boolean;
  onToggleZeroStock: () => void;
  totalFiltered: number;
  totalCount: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  selectedSupplier,
  onSupplierChange,
  onNavigateToItems,
  onNavigateToSupplier,
  onNavigateToSearch,
  suppliers,
  lowStockOnly,
  onToggleLowStock,
  zeroStockOnly,
  onToggleZeroStock,
  totalFiltered,
  totalCount,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs mb-4">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            id="medicine-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                onNavigateToItems();
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onNavigateToSupplier();
              }
            }}
            placeholder="Type medicine name, generic name, or code (e.g., Freedom, Savlon, Ace)... Press '/' to focus"
            className="w-full pl-9 pr-14 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white text-slate-800 placeholder-slate-400 transition-colors"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5 rounded bg-slate-200"
            >
              Clear
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-block text-[11px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
              /
            </kbd>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          
          {/* Supplier Dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              id="supplier-filter-select"
              value={selectedSupplier}
              onChange={(e) => onSupplierChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  onNavigateToSearch();
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  onNavigateToItems();
                }
              }}
              className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">All Suppliers ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier Category Dropdown */}
          <select
            id="category-filter-select"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Low Stock (<= ROL) Toggle */}
          <button
            id="filter-low-stock-btn"
            onClick={onToggleLowStock}
            className={`px-2.5 py-1.5 rounded-md border font-semibold flex items-center gap-1.5 transition-colors ${
              lowStockOnly
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Low Stock (ROL)</span>
          </button>

          {/* Zero Stock Toggle */}
          <button
            id="filter-zero-stock-btn"
            onClick={onToggleZeroStock}
            className={`px-2.5 py-1.5 rounded-md border font-semibold flex items-center gap-1.5 transition-colors ${
              zeroStockOnly
                ? 'bg-red-100 border-red-300 text-red-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>0 Stock</span>
          </button>

        </div>
      </div>

      {/* Helper Bar with Keyboard Shortcuts & Counter */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-700">
            Showing {totalFiltered} of {totalCount} medicines
          </span>
          {(lowStockOnly || zeroStockOnly || searchQuery || selectedSupplier || selectedCategory) && (
            <span className="text-cyan-700 font-medium">
              (Filtered results active)
            </span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-3 text-slate-500 font-mono text-[11px]">
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-600">↑ / ↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-600">Enter</kbd>
            <span>Add to Order</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-600">Ctrl + P</kbd>
            <span>Print / PDF</span>
          </span>
        </div>
      </div>
    </div>
  );
};
