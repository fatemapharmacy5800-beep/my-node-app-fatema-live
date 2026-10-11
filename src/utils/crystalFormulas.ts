/**
 * Crystal Report Formula Implementations for Fatema Pharmacy
 *
 * Formula: @Supplier_Cate
 * if {Suppliers.Post_Code} = "B" then
 *   "B-Grade"
 * else if {Suppliers.Post_Code} = "A" then
 *   "A-Grade"
 * else if {Suppliers.Post_Code} = "M" then
 *   "Market Collection"
 * else if {Suppliers.Post_Code} = "F" then
 *   "Broker Collections"
 * else if {Suppliers.Post_Code} = "X" then
 *   "Others"
 * else
 *   "Unknown" // Recommended fallback if no conditions match
 */

export type SupplierCategory =
  | 'B-Grade'
  | 'A-Grade'
  | 'Market Collection'
  | 'Broker Collections'
  | 'Others'
  | 'Unknown';

export function getSupplierCategory(postCode?: string | null): SupplierCategory {
  const code = (postCode || '').trim().toUpperCase();

  if (code === 'B') {
    return 'B-Grade';
  } else if (code === 'A') {
    return 'A-Grade';
  } else if (code === 'M') {
    return 'Market Collection';
  } else if (code === 'F') {
    return 'Broker Collections';
  } else if (code === 'X') {
    return 'Others';
  } else {
    return 'Unknown';
  }
}

/**
 * Formula: @Persentage
 * if {items.Disc_Pct} = 0 then
 *   {Suppliers.Retail_Discount}
 * else
 *   {items.Disc_Pct}
 */
export function getPercentage(discPct: number = 0, retailDiscount: number = 0): number {
  const p = discPct === 0 ? retailDiscount : discPct;
  return Number(p.toFixed(2));
}

/**
 * Formula: @SaleRate
 * {items.Rate} - ({@Persentage} / 100 * {items.Rate})
 */
export function getSaleRate(rate: number = 0, percentage: number = 0): number {
  const saleRate = rate - ((percentage / 100) * rate);
  return Number(saleRate.toFixed(2));
}

/**
 * View Definition: qryStore_Item_Balance
 * 
 * SELECT 
 *   dbo.Items.Item_ID, 
 *   SUM(ISNULL(dbo.qryStore_Transaction_Sum_Posted.Received_Qty_Sum - dbo.qryStore_Transaction_Sum_Posted.Delivered_Qty_Sum, 0)) AS Store_Balance
 * FROM dbo.Items 
 * LEFT OUTER JOIN dbo.qryStore_Transaction_Sum_Posted 
 *   ON dbo.Items.Item_ID = dbo.qryStore_Transaction_Sum_Posted.Item_ID
 * GROUP BY dbo.Items.Item_ID
 */
export function calculateStoreBalance(receivedQtySum: number = 0, deliveredQtySum: number = 0): number {
  return Number((receivedQtySum - deliveredQtySum).toFixed(2));
}

/**
 * Natural sorting order for categories matching Crystal Report hierarchy
 */
export const CATEGORY_DISPLAY_ORDER: SupplierCategory[] = [
  'A-Grade',
  'B-Grade',
  'Broker Collections',
  'Market Collection',
  'Others',
  'Unknown',
];
