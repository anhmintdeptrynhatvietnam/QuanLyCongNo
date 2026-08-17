/**
 * DEBT ACCOUNTING ENGINE - QUẢN LÝ CÔNG NỢ
 * "Bộ não" tính toán nghiệp vụ kế toán thuần túy (Pure Accounting Logic).
 * Hoàn toàn độc lập với UI, phục vụ tính toán chính xác số dư nợ, tuổi nợ, cấn trừ và dòng tiền.
 */

import { INVOICE_STATUS, INVOICE_TYPES, AGING_BUCKETS, PARTNER_TYPES } from '../config.js';

/**
 * Tính toán trạng thái chính xác của hóa đơn dựa trên số tiền và hạn nợ
 * @param {Object} invoice
 * @param {Date} [referenceDate=new Date()]
 * @returns {string} Trạng thái: PAID | PARTIAL | OVERDUE | UNPAID
 */
export function calculateInvoiceStatus(invoice, referenceDate = new Date()) {
  const total = Number(invoice.totalAmount) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const remaining = total - paid;

  if (remaining <= 0) {
    return INVOICE_STATUS.PAID;
  }

  // Nếu còn nợ, kiểm tra ngày đến hạn (dueDate)
  if (invoice.dueDate) {
    const due = new Date(invoice.dueDate);
    const today = new Date(referenceDate);
    // Bỏ qua phần giờ phút để so sánh ngày
    due.setHours(23, 59, 59, 999);
    today.setHours(0, 0, 0, 0);

    if (today > due) {
      return INVOICE_STATUS.OVERDUE;
    }
  }

  return paid > 0 ? INVOICE_STATUS.PARTIAL : INVOICE_STATUS.UNPAID;
}

/**
 * Tính số ngày quá hạn (hoặc số ngày còn lại đến hạn)
 * @param {string|Date} dueDate
 * @param {Date} [referenceDate=new Date()]
 * @returns {number} Số ngày (>0 là đã quá hạn N ngày, <=0 là còn trong hạn)
 */
export function calculateDaysOverdue(dueDate, referenceDate = new Date()) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const ref = new Date(referenceDate);
  due.setHours(0, 0, 0, 0);
  ref.setHours(0, 0, 0, 0);

  const diffTime = ref.getTime() - due.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Xác định nhóm tuổi nợ (Aging Bucket) cho một hóa đơn
 * @param {string|Date} dueDate
 * @param {Date} [referenceDate=new Date()]
 * @returns {string} ID nhóm tuổi nợ (CURRENT, OVERDUE_1_30, OVERDUE_31_60, OVERDUE_61_90, OVERDUE_OVER_90)
 */
export function getAgingBucketKey(dueDate, referenceDate = new Date()) {
  const days = calculateDaysOverdue(dueDate, referenceDate);
  if (days <= 0) return AGING_BUCKETS.CURRENT.id;
  if (days <= 30) return AGING_BUCKETS.OVERDUE_1_30.id;
  if (days <= 60) return AGING_BUCKETS.OVERDUE_31_60.id;
  if (days <= 90) return AGING_BUCKETS.OVERDUE_61_90.id;
  return AGING_BUCKETS.OVERDUE_OVER_90.id;
}

/**
 * Tính toán lại toàn bộ số dư nợ của các Đối Tác (Khách hàng & Nhà cung cấp)
 * @param {Array} partners
 * @param {Array} invoices
 * @returns {Array} Danh sách đối tác đã được cập nhật số dư mới nhất
 */
export function recalculatePartnerBalances(partners = [], invoices = []) {
  const now = new Date();
  const partnerMap = new Map();

  // Khởi tạo accumulator cho từng đối tác
  partners.forEach(partner => {
    partnerMap.set(partner.id, {
      ...partner,
      totalReceivable: 0, // Phải thu còn lại
      totalPayable: 0,    // Phải trả còn lại
      overdueReceivable: 0,
      overduePayable: 0,
      invoiceCount: 0
    });
  });

  // Quét qua danh sách hóa đơn
  invoices.forEach(inv => {
    const partner = partnerMap.get(inv.partnerId);
    if (!partner) return;

    const remaining = Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
    if (remaining <= 0) return; // Đã trả hết thì không tính vào nợ hiện tại

    const isOverdue = calculateDaysOverdue(inv.dueDate, now) > 0;
    partner.invoiceCount++;

    if (inv.type === INVOICE_TYPES.RECEIVABLE) {
      partner.totalReceivable += remaining;
      if (isOverdue) partner.overdueReceivable += remaining;
    } else if (inv.type === INVOICE_TYPES.PAYABLE) {
      partner.totalPayable += remaining;
      if (isOverdue) partner.overduePayable += remaining;
    }
  });

  return Array.from(partnerMap.values());
}

/**
 * Tự động phân bổ thanh toán theo phương pháp FIFO (Hóa đơn cũ nợ trước trả trước)
 * @param {string} partnerId
 * @param {number} paymentAmount
 * @param {string} invoiceType - RECEIVABLE | PAYABLE
 * @param {Array} invoices
 * @returns {Array} Danh sách allocation: [{ invoiceId, invoiceNumber, amount }]
 */
export function autoAllocatePaymentFIFO(partnerId, paymentAmount, invoiceType, invoices = []) {
  let remainingPayment = Math.max(0, Number(paymentAmount) || 0);
  const allocations = [];

  // Lọc các hóa đơn còn nợ của đối tác này và sắp xếp theo ngày phát sinh tăng dần (cũ nhất trước)
  const candidateInvoices = invoices
    .filter(inv => inv.partnerId === partnerId && inv.type === invoiceType)
    .filter(inv => ((Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)) > 0)
    .sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());

  for (const inv of candidateInvoices) {
    if (remainingPayment <= 0) break;
    const invRemaining = (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0);
    const allocated = Math.min(remainingPayment, invRemaining);

    allocations.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: allocated
    });

    remainingPayment -= allocated;
  }

  return allocations;
}

/**
 * Tính toán các chỉ số KPI & Báo cáo tổng hợp cho Dashboard
 * @param {Array} partners
 * @param {Array} invoices
 * @param {Array} payments
 * @returns {Object}
 */
export function calculateDashboardKPIs(partners = [], invoices = [], payments = []) {
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let totalReceivable = 0;
  let totalPayable = 0;
  let overdueReceivable = 0;
  let overduePayable = 0;
  let expectedCashIn7Days = 0;
  let expectedCashOut7Days = 0;

  // Bảng phân bổ tuổi nợ (Aging Report) cho Phải thu
  const agingReceivable = {
    [AGING_BUCKETS.CURRENT.id]: 0,
    [AGING_BUCKETS.OVERDUE_1_30.id]: 0,
    [AGING_BUCKETS.OVERDUE_31_60.id]: 0,
    [AGING_BUCKETS.OVERDUE_61_90.id]: 0,
    [AGING_BUCKETS.OVERDUE_OVER_90.id]: 0
  };

  const urgentOverdueInvoices = [];

  invoices.forEach(inv => {
    const remaining = Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
    if (remaining <= 0) return;

    const daysOverdue = calculateDaysOverdue(inv.dueDate, now);
    const isOverdue = daysOverdue > 0;
    const bucketKey = getAgingBucketKey(inv.dueDate, now);

    if (inv.type === INVOICE_TYPES.RECEIVABLE) {
      totalReceivable += remaining;
      agingReceivable[bucketKey] = (agingReceivable[bucketKey] || 0) + remaining;

      if (isOverdue) {
        overdueReceivable += remaining;
        urgentOverdueInvoices.push({
          ...inv,
          remainingAmount: remaining,
          daysOverdue
        });
      } else if (inv.dueDate) {
        const dueDate = new Date(inv.dueDate);
        if (dueDate >= now && dueDate <= next7Days) {
          expectedCashIn7Days += remaining;
        }
      }
    } else if (inv.type === INVOICE_TYPES.PAYABLE) {
      totalPayable += remaining;
      if (isOverdue) {
        overduePayable += remaining;
      } else if (inv.dueDate) {
        const dueDate = new Date(inv.dueDate);
        if (dueDate >= now && dueDate <= next7Days) {
          expectedCashOut7Days += remaining;
        }
      }
    }
  });

  // Sắp xếp nợ quá hạn khẩn cấp (nợ lâu nhất và số tiền lớn nhất lên đầu)
  urgentOverdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue || b.remainingAmount - a.remainingAmount);

  return {
    totalReceivable,
    totalPayable,
    overdueReceivable,
    overduePayable,
    expectedCashIn7Days,
    expectedCashOut7Days,
    agingReceivable,
    urgentOverdueInvoices: urgentOverdueInvoices.slice(0, 5) // Lấy top 5 nợ khẩn cấp
  };
}

/**
 * Tổng hợp ma trận công nợ 12 tháng theo đối tác (Chuẩn biểu mẫu kế toán doanh nghiệp)
 * @param {Array} partners 
 * @param {Array} invoices 
 * @param {Array} payments 
 * @param {number} [targetYear=2026] 
 * @returns {Object} { year, availableYears, monthlySummary, partnerMatrix, topDebtors, grandTotals }
 */
export function calculateMonthlyReceivablesMatrix(partners = [], invoices = [], payments = [], targetYear = new Date().getFullYear()) {
  const currentYear = Number(targetYear) || new Date().getFullYear();
  
  // Thu thập danh sách các năm có phát sinh dữ liệu
  const yearsSet = new Set([currentYear]);
  invoices.forEach(inv => {
    if (inv.issueDate) {
      const yr = new Date(inv.issueDate).getFullYear();
      if (!isNaN(yr)) yearsSet.add(yr);
    }
  });
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // Khởi tạo mảng 12 tháng tổng hợp
  const monthlySummary = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `T${i + 1}`,
    fullLabel: `Tháng ${i + 1}`,
    incurred: 0,
    paid: 0,
    remaining: 0,
    invoiceCount: 0,
    collectionRate: 0
  }));

  // Lọc đối tác khách hàng
  const customerPartners = partners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH || !p.type);

  // Map ma trận theo đối tác
  const partnerMap = new Map();
  customerPartners.forEach(p => {
    partnerMap.set(p.id, {
      id: p.id,
      code: p.code || p.id,
      name: p.name,
      months: Array(12).fill(0),
      totalDebt: 0,
      paidAmount: 0,
      remainingDebt: 0,
      collectionRate: 0,
      invoiceCount: 0
    });
  });

  // Quét hóa đơn phải thu trong năm
  invoices.forEach(inv => {
    if (inv.type !== INVOICE_TYPES.RECEIVABLE) return;
    if (!inv.issueDate) return;

    const invDate = new Date(inv.issueDate);
    if (isNaN(invDate.getTime())) return;
    if (invDate.getFullYear() !== currentYear) return;

    const mIdx = invDate.getMonth(); // 0-11
    const totalAmt = Number(inv.totalAmount) || 0;
    const paidAmt = Math.min(Number(inv.paidAmount) || 0, totalAmt);

    // Cập nhật thống kê tháng
    monthlySummary[mIdx].incurred += totalAmt;
    monthlySummary[mIdx].paid += paidAmt;
    monthlySummary[mIdx].remaining += Math.max(0, totalAmt - paidAmt);
    monthlySummary[mIdx].invoiceCount += 1;

    // Cập nhật ma trận đối tác
    let partnerRow = partnerMap.get(inv.partnerId);
    if (!partnerRow) {
      partnerRow = {
        id: inv.partnerId || `P-${Date.now().toString(36)}`,
        code: inv.partnerName,
        name: inv.partnerName || "Khách hàng vãng lai",
        months: Array(12).fill(0),
        totalDebt: 0,
        paidAmount: 0,
        remainingDebt: 0,
        collectionRate: 0,
        invoiceCount: 0
      };
      partnerMap.set(partnerRow.id, partnerRow);
    }

    partnerRow.months[mIdx] += totalAmt;
    partnerRow.totalDebt += totalAmt;
    partnerRow.paidAmount += paidAmt;
    partnerRow.remainingDebt += Math.max(0, totalAmt - paidAmt);
    partnerRow.invoiceCount += 1;
  });

  // Tính tỷ lệ thu hồi cho từng tháng
  monthlySummary.forEach(m => {
    m.collectionRate = m.incurred > 0 ? Math.round((m.paid / m.incurred) * 100) : (m.paid > 0 ? 100 : 0);
  });

  // Tính tỷ lệ thu hồi cho từng đối tác
  const partnerMatrix = Array.from(partnerMap.values())
    .map(p => ({
      ...p,
      collectionRate: p.totalDebt > 0 ? Math.round((p.paidAmount / p.totalDebt) * 100) : (p.paidAmount > 0 ? 100 : 0)
    }))
    .filter(p => p.totalDebt > 0 || p.remainingDebt > 0)
    .sort((a, b) => b.remainingDebt - a.remainingDebt || b.totalDebt - a.totalDebt);

  // Top 10 đối tác nợ lớn nhất
  const topDebtors = partnerMatrix.slice(0, 10);

  // Grand Totals
  const grandTotals = {
    year: currentYear,
    months: monthlySummary.map(m => m.incurred),
    totalIncurred: monthlySummary.reduce((sum, m) => sum + m.incurred, 0),
    totalPaid: monthlySummary.reduce((sum, m) => sum + m.paid, 0),
    totalRemaining: monthlySummary.reduce((sum, m) => sum + m.remaining, 0),
    overallCollectionRate: 0
  };
  grandTotals.overallCollectionRate = grandTotals.totalIncurred > 0 
    ? Math.round((grandTotals.totalPaid / grandTotals.totalIncurred) * 100) 
    : 0;

  return {
    year: currentYear,
    availableYears,
    monthlySummary,
    partnerMatrix,
    topDebtors,
    grandTotals
  };
}

