export interface MedicineItem {
  id: number | string;
  Item_ID: number;
  Item_Name: string;
  Item_Code?: string;
  Catagory_Id?: number;
  Category_Name?: string;
  Item_Type?: string | number;
  Specimen?: string;
  Rate: number; // M.R.P (money)
  Making_Time?: string;
  Purchase_Rate?: number; // (money)
  Comments?: string;
  Reorder_Level: number; // ROL (int)
  Balance: number; // Ph. Balance (money)
  VAT?: boolean;
  Inv_Rep_Type?: number;
  Generic_Name?: string; // (varchar 255)
  Unit?: string; // (varchar 50)
  Service_Charge?: boolean;
  OB?: number;
  OB_Date?: string;
  Debit: number; // (int)
  Credit?: number;
  Flexible_Rate?: boolean;
  Barcode?: string; // (varchar 150)
  Location?: string; // (varchar 50)
  Expire_Date?: string; // (datetime)
  Group_Test?: boolean;
  Supplier_ID?: number;
  Cost_Price: number; // (money)
  OB_Exp_Qty?: number;
  OB_SDate_Qty?: number;
  Disc_Pct: number; // (money)
  Audit_Balance?: number;
  Manu_ID?: number;

  // Joined from Suppliers table & Store Balance View
  Store_Balance: number;
  Total_Balance: number; // Formula: Balance + Store_Balance
  Retail_Discount: number;
  Percentage: number; // Formula: items.Disc_Pct === 0 ? Suppliers.Retail_Discount : items.Disc_Pct
  SaleRate: number; // Formula: Rate - (Percentage / 100 * Rate)
  SName: string; // Supplier Name (e.g. ACI - Consumer Brands)
  Post_Code?: string;
  Supplier_Cate: string; // "A-Grade" | "B-Grade" | "Market Collection" | "Broker Collections" | "Others" | "Unknown"
  Group_Name?: string; // Sub-brand or category like Freedom, Savlon, Mother & Baby Care
}

export interface Supplier {
  Supplier_ID: number;
  SName: string;
  Contact_Person?: string;
  Contact_Person_Designation?: string;
  Address?: string;
  City?: string;
  Post_Code?: string; // B, A, M, F, X
  Supplier_Cate: string; // Formula evaluated: "A-Grade" | "B-Grade" | "Market Collection" | "Broker Collections" | "Others" | "Unknown"
  StateOrProvince?: string;
  Country?: string;
  Phone?: string;
  Email?: string;
  Favorite?: boolean;
  OB?: number;
  Retail_Discount?: number;
  Wholesale_Discount?: number;
  itemCount?: number;
}

export interface OrderItem {
  medicine: MedicineItem;
  orderQty: number;
  unitPrice: number; // Cost_Price or SaleRate
  subtotal: number;
  notes?: string;
}

export interface OrderSlip {
  orderNumber: string;
  orderDate: string;
  supplierName: string;
  supplierCategory?: string;
  items: OrderItem[];
  totalQty: number;
  totalAmount: number;
  totalMRP: number;
  notes: string;
}

export interface DatabaseStatus {
  connected: boolean;
  mode: 'mssql' | 'unavailable';
  server: string;
  database: string;
  port: number;
  lastSync: string;
  recordCount: number;
  errorMessage?: string;
}

export interface AnalyticsSale {
  id: number | string;
  time: string;
  medicineBillNo: string;
  amount: number;
  due: number;
  items: number;
  employee: string;
  counter: string;
  payment: string;
}

export interface SaleReceiptItem {
  id: number | string;
  name: string;
  qty: number;
  rate: number;
  amount: number;
  itemDiscount: number;
  netAmount: number;
}

export interface SaleReceipt {
  id: number | string;
  medicineBillNo: string;
  date: string;
  time: string;
  customer: string;
  employee: string;
  counter: string;
  paymentMode: string;
  items: SaleReceiptItem[];
  grossSubtotal: number;
  itemDiscount: number;
  billDiscount: number;
  netPayable: number;
  totalPaid: number;
  due: number;
}

export interface AnalyticsPurchase {
  id: number | string;
  time: string;
  invoice: string;
  supplier: string;
  amount: number;
  items: number;
  status: string;
}

export interface AnalyticsEmployee {
  name: string;
  transactions: number;
  amount: number;
}

export interface AnalyticsCounter {
  name: string;
  transactions: number;
  amount: number;
}

export interface AnalyticsExpense {
  id: number | string;
  head: string;
  voucher: string;
  amount: number;
  remark: string;
  time: string;
}

export interface AnalyticsDueCollection {
  id: number | string;
  time: string;
  medicineBillNo: string;
  amount: number;
  paymentMode: string;
  particulars: string;
  userName: string;
  computerName: string;
}

export interface PaymentDetailRecord {
  id: number | string;
  time: string;
  category: string;
  reference: string;
  counterparty: string;
  paymentMode: string;
  particulars: string;
  userName: string;
  computerName: string;
  amount: number;
}

export interface PaymentDetailsResponse {
  date: string;
  total: number;
  transactions: number;
  records: PaymentDetailRecord[];
}

export interface ExpiryCashAdjustment {
  id: number;
  date: string;
  time: string;
  supplierId: number;
  supplierName: string;
  amount: number;
  remark: string;
  userName: string;
  computerName: string;
}

export interface ExpiryCashAdjustmentsResponse {
  date: string;
  total: number;
  transactions: number;
  records: ExpiryCashAdjustment[];
}

export interface DashboardAnalytics {
  generatedAt: string;
  date: string;
  dailyPurchase: { amount: number; transactions: number; items: number };
  liveSales: { amount: number; transactions: number; items: number };
  paidAfterDiscount: number;
  dueCollection: number;
  totalCollection: number;
  supplierPayment: { amount: number; transactions: number };
  employeePayment: { amount: number; transactions: number };
  expiryCashAdjustment: { amount: number; transactions: number };
  inventory: { items: number; units: number; valuation: number };
  expensesTotal: number;
  purchases: AnalyticsPurchase[];
  sales: AnalyticsSale[];
  employees: AnalyticsEmployee[];
  counters: AnalyticsCounter[];
  expenses: AnalyticsExpense[];
  dueCollections: AnalyticsDueCollection[];
}

export type DashboardPage =
  | 'dashboard'
  | 'reports'
  | 'sales'
  | 'purchases'
  | 'dueCollections'
  | 'expenses'
  | 'payments'
  | 'employeePayments';

export interface PharmacySettings {
  name: string;
  address: string;
  phone: string;
  logoDataUrl: string | null;
}

export type HistoricalReportView = 'daily' | 'monthly' | 'yearly';

export interface HistoricalReportMetric {
  period: string;
  label: string;
  totalRevenue: number;
  totalPurchases: number;
  totalExpenses: number;
  totalCollections: number;
  totalExpiryCashAdjustments: number;
  totalSupplierPayments: number;
  totalEmployeePayments: number;
  inventoryValuation: number;
  netAfterPayments: number;
  salesTransactions: number;
  purchaseTransactions: number;
  daysReported: number;
}

export interface HistoricalReport {
  view: HistoricalReportView;
  compare: boolean;
  year: number;
  month?: number;
  label: string;
  generatedAt: string;
  source: 'UserAuthDB.dbo.DailySummaryReports';
  summary: HistoricalReportMetric;
  trend: HistoricalReportMetric[];
  availableYears: number[];
}
