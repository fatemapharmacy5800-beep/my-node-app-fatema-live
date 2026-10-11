import { MedicineItem } from '../types';

const CATEGORY_ORDER = ['A-Grade', 'B-Grade', 'Broker Collections', 'Market Collection', 'Others', 'Unknown'];

function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/**
 * Keeps the visual report order and keyboard order identical.
 * Medicines are grouped first, then follow their numeric Item_ID rather than
 * an alphabetical Item_Name order.
 */
export function compareMedicinesForDisplay(a: MedicineItem, b: MedicineItem): number {
  const categoryDifference = categoryRank(a.Supplier_Cate || 'Unknown') - categoryRank(b.Supplier_Cate || 'Unknown');
  if (categoryDifference !== 0) return categoryDifference;

  const supplierDifference = (a.SName || '').localeCompare(b.SName || '');
  if (supplierDifference !== 0) return supplierDifference;

  const groupDifference = (a.Group_Name || 'General Items').localeCompare(b.Group_Name || 'General Items');
  if (groupDifference !== 0) return groupDifference;

  const itemIdA = Number.isFinite(Number(a.Item_ID)) ? Number(a.Item_ID) : Number.MAX_SAFE_INTEGER;
  const itemIdB = Number.isFinite(Number(b.Item_ID)) ? Number(b.Item_ID) : Number.MAX_SAFE_INTEGER;
  if (itemIdA !== itemIdB) return itemIdA - itemIdB;

  return a.Item_Name.localeCompare(b.Item_Name);
}

export function sortMedicinesForDisplay(medicines: MedicineItem[]): MedicineItem[] {
  return [...medicines].sort(compareMedicinesForDisplay);
}