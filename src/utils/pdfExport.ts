import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DashboardAnalytics, HistoricalReport, MedicineItem, OrderSlip, SaleReceipt } from '../types';
import { PHARMACY_INFO } from '../sampleData';

export type PharmacyPdfInfo = typeof PHARMACY_INFO & { logoDataUrl?: string | null };

function addPharmacyLogo(doc: jsPDF, pharmacy: PharmacyPdfInfo, x: number, y: number, size: number) {
  if (!pharmacy.logoDataUrl) return false;
  const format = pharmacy.logoDataUrl.startsWith('data:image/png;') ? 'PNG' : 'JPEG';
  doc.addImage(pharmacy.logoDataUrl, format, x, y, size, size);
  return true;
}

// Generate Purchase Order PDF for supplier
export function exportOrderSlipPdf(order: OrderSlip, pharmacy = PHARMACY_INFO) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Box
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 12, pageWidth - 28, 30, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 12, pageWidth - 28, 30, 'S');

  // Pharmacy Logo Block
  doc.setFillColor(14, 116, 144);
  doc.roundedRect(18, 16, 16, 16, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(pharmacy.logoInitials, 26, 26.5, { align: 'center' });

  // Pharmacy Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(pharmacy.name, 38, 21);

  // Pharmacy Subtitle & Phone
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(pharmacy.address, 38, 27);
  doc.text(pharmacy.phone, 38, 33);

  // Order Title Badge
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(14, 116, 144);
  doc.text('PURCHASE ORDER SLIP', pageWidth - 20, 22, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`PO No: ${order.orderNumber}`, pageWidth - 20, 28, { align: 'right' });
  doc.text(`Date: ${order.orderDate}`, pageWidth - 20, 33, { align: 'right' });

  // Supplier Information Banner
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 46, pageWidth - 28, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`SUPPLIER: ${order.supplierName.toUpperCase()}`, 18, 53);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Category: ${order.supplierCategory || 'Standard Distributor'} | Total Items: ${order.items.length}`, 18, 58);

  // Table of Items without Cur. Stock, ROL, or Dis % as requested
  const tableData = order.items.map((item, idx) => {
    const med = item.medicine;
    return [
      String(idx + 1),
      med.Item_Name,
      med.Unit || 'Pkt',
      String(item.orderQty),
      med.Cost_Price.toFixed(2),
      med.Rate.toFixed(2),
      item.subtotal.toFixed(2),
    ];
  });

  autoTable(doc, {
    startY: 64,
    head: [
      ['SL', 'Product Name', 'Unit', 'Order Qty', 'Cost Price', 'M.R.P', 'Line Total (Tk)'],
    ],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  // Footer / Totals block
  const finalY = (doc as any).lastAutoTable?.finalY || 180;
  
  doc.setFillColor(241, 245, 249);
  doc.rect(pageWidth - 94, finalY + 6, 80, 24, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(pageWidth - 94, finalY + 6, 80, 24, 'S');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Total Order Units:`, pageWidth - 90, finalY + 13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${order.totalQty}`, pageWidth - 18, finalY + 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Total MRP Value:`, pageWidth - 90, finalY + 19);
  doc.setFont('helvetica', 'bold');
  doc.text(`Tk. ${order.totalMRP.toFixed(2)}`, pageWidth - 18, finalY + 19, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(14, 116, 144);
  doc.text(`Est. Total Payable:`, pageWidth - 90, finalY + 26);
  doc.text(`Tk. ${order.totalAmount.toFixed(2)}`, pageWidth - 18, finalY + 26, { align: 'right' });

  // Notes section
  if (order.notes) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Order Instructions / Notes:', 14, finalY + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(order.notes, 14, finalY + 18, { maxWidth: pageWidth - 115 });
  }

  // Signature Block
  const sigY = Math.max(finalY + 45, 240);
  if (sigY < 275) {
    doc.setDrawColor(148, 163, 184);
    doc.line(20, sigY, 70, sigY);
    doc.line(pageWidth - 70, sigY, pageWidth - 20, sigY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Prepared By (Store Admin)', 45, sigY + 5, { align: 'center' });
    doc.text('Authorized Signature / Pharmacist', pageWidth - 45, sigY + 5, { align: 'center' });
  }

  doc.save(`Order_${order.orderNumber}_${order.supplierName.replace(/\s+/g, '_')}.pdf`);
}

// Generate Stock Report PDF matching Crystal Report from Screenshot_1.png
export function exportStockReportPdf(medicines: MedicineItem[], pharmacy = PHARMACY_INFO) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.text(pharmacy.name, pageWidth / 2, 14, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('times', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(pharmacy.address, pageWidth / 2, 19, { align: 'center' });
  doc.text(pharmacy.phone, pageWidth / 2, 23.5, { align: 'center' });

  // FP Logo in blue box on top right
  doc.setFillColor(14, 116, 144);
  doc.rect(pageWidth - 30, 10, 14, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(pharmacy.logoInitials, pageWidth - 23, 19, { align: 'center' });

  // Report Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont('times', 'bold');
  doc.text(pharmacy.reportTitle, pageWidth / 2, 30, { align: 'center' });

  // Group by Supplier Category -> Supplier Name
  const tableRows: any[] = [];
  let recordCounter = 1;

  // Find unique supplier categories sorted by Crystal Report hierarchy
  const CATEGORY_ORDER = ['A-Grade', 'B-Grade', 'Broker Collections', 'Market Collection', 'Others', 'Unknown'];
  const categories = Array.from(new Set(medicines.map((m) => m.Supplier_Cate || 'A-Grade'))).sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
  });

  categories.forEach((cat) => {
    // Group Header 1: Category (Cyan bar)
    tableRows.push([
      {
        content: cat,
        colSpan: 11,
        styles: {
          fillColor: [6, 182, 212], // cyan
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10,
        },
      },
    ]);

    const catMeds = medicines.filter((m) => (m.Supplier_Cate || 'A-Grade') === cat);
    const suppliers = Array.from(new Set(catMeds.map((m) => m.SName)));

    suppliers.forEach((sup) => {
      // Group Header 2: Supplier Name (Red bar)
      tableRows.push([
        {
          content: sup,
          colSpan: 11,
          styles: {
            fillColor: [220, 38, 38], // red
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9.5,
          },
        },
      ]);

      const supMeds = catMeds.filter((m) => m.SName === sup);
      const subGroups = Array.from(new Set(supMeds.map((m) => m.Group_Name || 'General')));

      subGroups.forEach((group) => {
        // Group Header 3: Subgroup e.g. Freedom, Savlon
        tableRows.push([
          {
            content: group,
            colSpan: 11,
            styles: {
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
              fontStyle: 'bold',
              fontSize: 8.5,
            },
          },
        ]);

        const groupMeds = supMeds.filter((m) => (m.Group_Name || 'General') === group);
        groupMeds.forEach((item) => {
          const isZeroStock = item.Total_Balance === 0;
          const isLowStock = item.Total_Balance <= item.Reorder_Level;

          tableRows.push([
            String(recordCounter++),
            item.Item_Name,
            String(item.Debit),
            String(item.Reorder_Level),
            String(item.Store_Balance),
            String(item.Balance),
            {
              content: String(item.Total_Balance),
              styles: {
                textColor: isZeroStock || isLowStock ? [220, 38, 38] : [15, 23, 42],
                fontStyle: isZeroStock || isLowStock ? 'bold' : 'normal',
              },
            },
            item.Cost_Price.toFixed(2),
            item.Rate.toFixed(2),
            `${item.Percentage.toFixed(2)} %`,
            item.SaleRate.toFixed(2),
          ]);
        });
      });
    });
  });

  autoTable(doc, {
    startY: 34,
    head: [
      ['#', 'Product Name', 'Debit', 'ROL', 'Store. Balance', 'Ph. Balance', 'Total. Balance', 'Cost Price', 'M.R.P', 'Dis %', 'SaleRate'],
    ],
    body: tableRows,
    theme: 'plain',
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 68, halign: 'left' },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 24, halign: 'center' },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 20, halign: 'right' },
      9: { cellWidth: 18, halign: 'center' },
      10: { cellWidth: 22, halign: 'right' },
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    margin: { left: 10, right: 10 },
  });

  doc.save(`Medicine_Stock_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportSaleReceiptPdf(receipt: SaleReceipt, pharmacy: PharmacyPdfInfo = PHARMACY_INFO) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const formatMoney = (value: number) => `Tk. ${value.toFixed(2)}`;

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 12, pageWidth - 28, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const hasLogo = addPharmacyLogo(doc, pharmacy, 18, 17, 16);
  doc.text(pharmacy.name, hasLogo ? 38 : 20, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(pharmacy.address, hasLogo ? 38 : 20, 28);
  doc.text(pharmacy.phone, hasLogo ? 38 : 20, 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MONEY RECEIPT', pageWidth - 20, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Bill No: ${receipt.medicineBillNo}`, pageWidth - 20, 29, { align: 'right' });
  doc.text(`${receipt.date} ${receipt.time}`.trim(), pageWidth - 20, 35, { align: 'right' });

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(`Customer: ${receipt.customer}`, 18, 49);
  doc.text(`Employee: ${receipt.employee}`, 18, 55);
  doc.text(`Counter: ${receipt.counter}`, pageWidth - 18, 49, { align: 'right' });
  doc.text(`Payment: ${receipt.paymentMode}`, pageWidth - 18, 55, { align: 'right' });

  autoTable(doc, {
    startY: 62,
    head: [['#', 'Item', 'Qty', 'Rate', 'Amount']],
    body: receipt.items.map((item, index) => [
      String(index + 1),
      item.name,
      item.qty.toString(),
      item.rate.toFixed(2),
      item.netAmount.toFixed(2),
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 120;
  const summaryX = pageWidth - 94;
  doc.setFillColor(241, 245, 249);
  doc.rect(summaryX, finalY + 7, 80, 42, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(summaryX, finalY + 7, 80, 42, 'S');
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Gross subtotal:', summaryX + 4, finalY + 15);
  doc.text('Item discount:', summaryX + 4, finalY + 22);
  doc.text('Bill discount:', summaryX + 4, finalY + 29);
  doc.text('Total paid:', summaryX + 4, finalY + 43);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(formatMoney(receipt.grossSubtotal), pageWidth - 18, finalY + 15, { align: 'right' });
  doc.text(formatMoney(receipt.itemDiscount), pageWidth - 18, finalY + 22, { align: 'right' });
  doc.text(formatMoney(receipt.billDiscount), pageWidth - 18, finalY + 29, { align: 'right' });
  doc.setTextColor(14, 116, 144);
  doc.text('Net payable:', summaryX + 4, finalY + 36);
  doc.text(formatMoney(receipt.netPayable), pageWidth - 18, finalY + 36, { align: 'right' });
  doc.setTextColor(30, 41, 59);
  doc.text(formatMoney(receipt.totalPaid), pageWidth - 18, finalY + 43, { align: 'right' });
  doc.setTextColor(receipt.due > 0 ? 180 : 22, receipt.due > 0 ? 83 : 101, receipt.due > 0 ? 9 : 52);
  doc.text(`Due: ${formatMoney(receipt.due)}`, pageWidth - 18, finalY + 55, { align: 'right' });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Thank you for your purchase.', pageWidth / 2, finalY + 70, { align: 'center' });
  doc.save(`Money_Receipt_${receipt.medicineBillNo.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
}

export function exportDailySummaryPdf(report: DashboardAnalytics, pharmacy: PharmacyPdfInfo = PHARMACY_INFO) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const moneyValue = (value: number) => `Tk. ${value.toFixed(2)}`;

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 12, pageWidth - 28, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const hasLogo = addPharmacyLogo(doc, pharmacy, 18, 19, 16);
  doc.text(pharmacy.name, hasLogo ? 38 : 20, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(pharmacy.address, hasLogo ? 38 : 20, 29);
  doc.text(pharmacy.phone, hasLogo ? 38 : 20, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('DAILY SUMMARY', pageWidth - 20, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Report date: ${report.date}`, pageWidth - 20, 30, { align: 'right' });
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, pageWidth - 20, 36, { align: 'right' });

  const rows = [
    ['Daily purchases', moneyValue(report.dailyPurchase.amount), `${report.dailyPurchase.transactions} invoices · ${report.dailyPurchase.items} items`],
    ['Live sales', moneyValue(report.liveSales.amount), `${report.liveSales.transactions} transactions · ${report.liveSales.items} items`],
    ['Paid after discount', moneyValue(report.paidAfterDiscount), 'Posted sales payments'],
    ['Due collections', moneyValue(report.dueCollection), 'Collected against due bills'],
    ['Total collection', moneyValue(report.totalCollection), 'Sales payments + due collections + expiry cash'],
    ['Expire Cash Adjustment', moneyValue(report.expiryCashAdjustment?.amount || 0), `${report.expiryCashAdjustment?.transactions || 0} adjustment records`],
    ['Daily expenses', moneyValue(report.expensesTotal), `${report.expenses.length} expense records`],
    ['Inventory valuation', moneyValue(report.inventory.valuation), `${report.inventory.items} items · ${report.inventory.units.toFixed(2)} units`],
  ];

  autoTable(doc, {
    startY: 50,
    head: [['Summary metric', 'Amount', 'Details']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [14, 116, 144], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 38, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 'auto' } },
    margin: { left: 14, right: 14 },
  });

  let nextY = ((doc as any).lastAutoTable?.finalY || 100) + 10;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Sales performance', 14, nextY);
  autoTable(doc, {
    startY: nextY + 4,
    head: [['Employee', 'Transactions', 'Revenue']],
    body: report.employees.map((employee) => [employee.name, String(employee.transactions), moneyValue(employee.amount)]),
    theme: 'striped',
    headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  nextY = ((doc as any).lastAutoTable?.finalY || nextY + 20) + 9;
  doc.setFontSize(11);
  doc.text('POS counter performance', 14, nextY);
  autoTable(doc, {
    startY: nextY + 4,
    head: [['Counter', 'Transactions', 'Revenue']],
    body: report.counters.map((counter) => [counter.name, String(counter.transactions), moneyValue(counter.amount)]),
    theme: 'striped',
    headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Generated from HDMS operational records and saved expiry cash adjustments.', 14, 286);
  doc.save(`Daily_Summary_${report.date}.pdf`);
}

export function exportHistoricalReportPdf(report: HistoricalReport, pharmacy: PharmacyPdfInfo = PHARMACY_INFO) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const moneyValue = (value: number) => `Tk. ${value.toFixed(2)}`;
  const title = report.compare ? 'YEARLY COMPARATIVE ANALYTICS' : `${report.view.toUpperCase()} ANALYTICAL REPORT`;

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 12, pageWidth - 28, 31, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const hasLogo = addPharmacyLogo(doc, pharmacy, 18, 19, 16);
  doc.text(pharmacy.name, hasLogo ? 38 : 20, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(pharmacy.address, hasLogo ? 38 : 20, 29);
  doc.text(pharmacy.phone, hasLogo ? 38 : 20, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, pageWidth - 20, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(report.label, pageWidth - 20, 30, { align: 'right' });
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, pageWidth - 20, 36, { align: 'right' });

  const summary = report.summary;
  autoTable(doc, {
    startY: 50,
    head: [['Revenue', 'Collections', 'Expire cash adjustments', 'Expenses', 'Supplier payments', 'Employee payments', 'Net after payments', 'Purchases', 'Inventory valuation', 'Days reported']],
    body: [[
      moneyValue(summary.totalRevenue),
      moneyValue(summary.totalCollections),
      moneyValue(summary.totalExpiryCashAdjustments),
      moneyValue(summary.totalExpenses),
      moneyValue(summary.totalSupplierPayments),
      moneyValue(summary.totalEmployeePayments),
      moneyValue(summary.netAfterPayments),
      moneyValue(summary.totalPurchases),
      moneyValue(summary.inventoryValuation),
      String(summary.daysReported),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [14, 116, 144], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 41, 59], halign: 'right' },
  });

  const rows = report.trend.map((item) => [
    item.label,
    moneyValue(item.totalRevenue),
    moneyValue(item.totalCollections),
    moneyValue(item.totalExpiryCashAdjustments),
    moneyValue(item.totalExpenses),
    moneyValue(item.totalSupplierPayments),
    moneyValue(item.totalEmployeePayments),
    moneyValue(item.netAfterPayments),
    moneyValue(item.totalPurchases),
    moneyValue(item.inventoryValuation),
    String(item.daysReported),
  ]);
  autoTable(doc, {
    startY: ((doc as any).lastAutoTable?.finalY || 78) + 10,
    head: [['Period', 'Revenue', 'Collections', 'Expire cash adjustments', 'Expenses', 'Supplier payments', 'Employee payments', 'Net after payments', 'Purchases', 'Inventory valuation', 'Days']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    styles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], halign: 'right' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Net after payments = collections − expenses − supplier payments − employee payments. Expiry adjustments are included in collections and shown separately for reference; inventory uses the last snapshot.', 14, 200, { maxWidth: pageWidth - 28 });
  doc.save(`${report.compare ? 'Yearly_Comparative' : `${report.view[0].toUpperCase()}${report.view.slice(1)}`}_Analytical_Report_${report.year}.pdf`);
}
