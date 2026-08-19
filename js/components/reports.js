/**
 * REPORTS & RECONCILIATION VIEW - QUẢN LÝ CÔNG NỢ
 * Ma trận Phân tích Tuổi Nợ (Aging Matrix) và Biên bản đối chiếu công nợ chi tiết từng đối tác.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { ExportService } from '../services/export-service.js';
import { Toast } from './toast.js';
import { formatCurrency, formatDate, toInputDateFormat } from '../utils/formatters.js';
import { calculateDaysOverdue, getAgingBucketKey } from '../services/debt-engine.js';
import { AGING_BUCKETS, PARTNER_TYPES, INVOICE_TYPES, PAYMENT_TYPES } from '../config.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';
import { isDateInRange, sortDataList, getPresetDateRange, DATE_PRESETS } from '../utils/filter-helpers.js';

export class ReportsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.selectedPartnerId = "";
    
    // Bộ lọc Ma Trận Tuổi Nợ
    this.agingFilterState = {
      partnerType: "CUSTOMER_ONLY", // "CUSTOMER_ONLY" | "ALL_PARTNERS" | "VENDOR_ONLY"
      overdueCondition: "ALL_DEBT", // "ALL_DEBT" | "HAS_OVERDUE" | "OVERDUE_30" | "OVERDUE_60" | "OVERDUE_90"
      searchQuery: "",
      sortBy: "totalDebt",
      sortOrder: "desc"
    };

    // Bộ lọc Biên Bản Đối Chiếu
    this.statementFilterState = {
      datePreset: "all",
      fromDate: "",
      toDate: ""
    };
  }

  render(state) {
    const now = new Date();

    // 1. Phân loại danh sách đối tác theo bộ lọc Ma trận tuổi nợ
    let targetPartners = state.partners || [];
    if (this.agingFilterState.partnerType === "CUSTOMER_ONLY") {
      targetPartners = targetPartners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH);
    } else if (this.agingFilterState.partnerType === "VENDOR_ONLY") {
      targetPartners = targetPartners.filter(p => p.type === PARTNER_TYPES.VENDOR || p.type === PARTNER_TYPES.BOTH);
    }

    // 2. Tính toán Ma trận Tuổi nợ (Aging Matrix Data)
    let agingMatrixData = targetPartners.map(p => {
      const partnerInvoices = (state.invoices || []).filter(inv =>
        inv.partnerId === p.id &&
        inv.type === INVOICE_TYPES.RECEIVABLE &&
        ((Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)) > 0
      );

      let current = 0;
      let overdue1_30 = 0;
      let overdue31_60 = 0;
      let overdue61_90 = 0;
      let overdueOver90 = 0;
      let totalDebt = 0;

      partnerInvoices.forEach(inv => {
        const remaining = Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
        totalDebt += remaining;
        const bucket = getAgingBucketKey(inv.dueDate, now);

        if (bucket === AGING_BUCKETS.CURRENT.id) current += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_1_30.id) overdue1_30 += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_31_60.id) overdue31_60 += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_61_90.id) overdue61_90 += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_OVER_90.id) overdueOver90 += remaining;
      });

      const totalOverdue = overdue1_30 + overdue31_60 + overdue61_90 + overdueOver90;

      return {
        id: p.id,
        code: p.code || p.id,
        name: p.name,
        type: p.type,
        totalDebt,
        totalOverdue,
        current,
        overdue1_30,
        overdue31_60,
        overdue61_90,
        overdueOver90
      };
    }).filter(row => row.totalDebt > 0);

    // 3. Lọc theo Mức độ Quá Hạn
    if (this.agingFilterState.overdueCondition === "HAS_OVERDUE") {
      agingMatrixData = agingMatrixData.filter(r => r.totalOverdue > 0);
    } else if (this.agingFilterState.overdueCondition === "OVERDUE_30") {
      agingMatrixData = agingMatrixData.filter(r => (r.overdue31_60 + r.overdue61_90 + r.overdueOver90) > 0);
    } else if (this.agingFilterState.overdueCondition === "OVERDUE_60") {
      agingMatrixData = agingMatrixData.filter(r => (r.overdue61_90 + r.overdueOver90) > 0);
    } else if (this.agingFilterState.overdueCondition === "OVERDUE_90") {
      agingMatrixData = agingMatrixData.filter(r => r.overdueOver90 > 0);
    }

    // 4. Lọc theo Tìm kiếm trong Ma trận
    const searchQ = (this.agingFilterState.searchQuery || "").trim().toLowerCase();
    if (searchQ) {
      agingMatrixData = agingMatrixData.filter(r =>
        (r.name && r.name.toLowerCase().includes(searchQ)) ||
        (r.code && r.code.toLowerCase().includes(searchQ))
      );
    }

    // 5. Sắp xếp Ma trận
    agingMatrixData = sortDataList(agingMatrixData, this.agingFilterState.sortBy, this.agingFilterState.sortOrder);

    // 6. Tính tổng các cột ma trận
    const totals = agingMatrixData.reduce((acc, row) => {
      acc.totalDebt += row.totalDebt;
      acc.current += row.current;
      acc.overdue1_30 += row.overdue1_30;
      acc.overdue31_60 += row.overdue31_60;
      acc.overdue61_90 += row.overdue61_90;
      acc.overdueOver90 += row.overdueOver90;
      return acc;
    }, { totalDebt: 0, current: 0, overdue1_30: 0, overdue31_60: 0, overdue61_90: 0, overdueOver90: 0 });

    const selectedPartner = state.partners.find(p => p.id === this.selectedPartnerId) || state.partners[0];

    return `
      <!-- Section 1: Ma Trận Tuổi Nợ (Aging Matrix) -->
      <div class="card" style="margin-bottom: var(--space-6);">
        <div class="card-header" style="flex-wrap: wrap; gap: var(--space-3);">
          <div class="card-title">
            <i data-lucide="grid" style="color: var(--primary-600);"></i>
            <span>Báo Cáo Ma Trận Tuổi Nợ Đối Tác (Aging Matrix)</span>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn btn-secondary btn-sm" id="btn-export-aging">
              <i data-lucide="download"></i>
              <span>Xuất Excel Ma Trận</span>
            </button>
          </div>
        </div>

        <!-- Filter Bar cho Ma Trận Tuổi Nợ -->
        <div style="padding: var(--space-3) var(--space-4); background: var(--bg-surface-subtle); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
          <!-- 1. Phân loại đối tác -->
          <div class="flex items-center gap-1">
            <span style="font-size: 0.775rem; font-weight: 600; color: var(--text-muted);">Đối tác:</span>
            <select class="form-select" id="aging-filter-partner-type" style="height: 32px; font-size: 0.8rem; width: 150px;">
              <option value="CUSTOMER_ONLY" ${this.agingFilterState.partnerType === 'CUSTOMER_ONLY' ? 'selected' : ''}>Khách hàng & 2 chiều</option>
              <option value="ALL_PARTNERS" ${this.agingFilterState.partnerType === 'ALL_PARTNERS' ? 'selected' : ''}>Tất cả đối tác</option>
              <option value="VENDOR_ONLY" ${this.agingFilterState.partnerType === 'VENDOR_ONLY' ? 'selected' : ''}>Nhà cung cấp</option>
            </select>
          </div>

          <!-- 2. Mức độ quá hạn -->
          <div class="flex items-center gap-1">
            <span style="font-size: 0.775rem; font-weight: 600; color: var(--text-muted);">Tình trạng nợ:</span>
            <select class="form-select" id="aging-filter-condition" style="height: 32px; font-size: 0.8rem; width: 170px;">
              <option value="ALL_DEBT" ${this.agingFilterState.overdueCondition === 'ALL_DEBT' ? 'selected' : ''}>Tất cả có dư nợ</option>
              <option value="HAS_OVERDUE" ${this.agingFilterState.overdueCondition === 'HAS_OVERDUE' ? 'selected' : ''}>Có nợ quá hạn (>0d)</option>
              <option value="OVERDUE_30" ${this.agingFilterState.overdueCondition === 'OVERDUE_30' ? 'selected' : ''}>Quá hạn > 30 ngày</option>
              <option value="OVERDUE_60" ${this.agingFilterState.overdueCondition === 'OVERDUE_60' ? 'selected' : ''}>Quá hạn > 60 ngày</option>
              <option value="OVERDUE_90" ${this.agingFilterState.overdueCondition === 'OVERDUE_90' ? 'selected' : ''}>Quá hạn khẩn cấp (>90d)</option>
            </select>
          </div>

          <!-- 3. Sắp xếp -->
          <div class="flex items-center gap-1">
            <span style="font-size: 0.775rem; font-weight: 600; color: var(--text-muted);">Sắp xếp:</span>
            <select class="form-select" id="aging-filter-sort-by" style="height: 32px; font-size: 0.8rem; width: 160px;">
              <option value="totalDebt" ${this.agingFilterState.sortBy === 'totalDebt' ? 'selected' : ''}>Tổng nợ giảm dần</option>
              <option value="overdueOver90" ${this.agingFilterState.sortBy === 'overdueOver90' ? 'selected' : ''}>Nợ >90d giảm dần</option>
              <option value="current" ${this.agingFilterState.sortBy === 'current' ? 'selected' : ''}>Nợ trong hạn giảm dần</option>
              <option value="name" ${this.agingFilterState.sortBy === 'name' ? 'selected' : ''}>Tên đối tác (A - Z)</option>
            </select>
          </div>

          <!-- 4. Tìm kiếm tức thì trong ma trận -->
          <div class="filter-search-box" style="margin-left: auto; max-width: 240px;">
            <i data-lucide="search"></i>
            <input type="text" class="filter-search-input" id="aging-filter-search" placeholder="Tìm tên/mã đối tác..." value="${escapeHtml(this.agingFilterState.searchQuery)}" style="height: 32px;">
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table aging-table">
            <thead>
              <tr>
                <th>Mã Đối Tác</th>
                <th>Tên Khách Hàng / Đối Tác</th>
                <th class="text-right">Tổng Nợ (VNĐ)</th>
                <th class="text-right aging-current">Trong Hạn (0d)</th>
                <th class="text-right aging-1-30">Quá Hạn 1-30d</th>
                <th class="text-right aging-31-60">Quá Hạn 31-60d</th>
                <th class="text-right aging-61-90">Quá Hạn 61-90d</th>
                <th class="text-right aging-over-90">Quá Hạn >90d</th>
              </tr>
            </thead>
            <tbody>
              ${agingMatrixData.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
                    Không tìm thấy khoản nợ nào phù hợp với bộ lọc ma trận.
                  </td>
                </tr>
              ` : agingMatrixData.map(row => `
                <tr>
                  <td class="font-mono font-bold">${escapeHtml(row.code)}</td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(row.name)}</div>
                  </td>
                  <td class="text-right font-mono font-bold">${formatCurrency(row.totalDebt)}</td>
                  <td class="text-right font-mono aging-current">${row.current > 0 ? formatCurrency(row.current) : '-'}</td>
                  <td class="text-right font-mono aging-1-30">${row.overdue1_30 > 0 ? formatCurrency(row.overdue1_30) : '-'}</td>
                  <td class="text-right font-mono aging-31-60">${row.overdue31_60 > 0 ? formatCurrency(row.overdue31_60) : '-'}</td>
                  <td class="text-right font-mono aging-61-90">${row.overdue61_90 > 0 ? formatCurrency(row.overdue61_90) : '-'}</td>
                  <td class="text-right font-mono aging-over-90">${row.overdueOver90 > 0 ? formatCurrency(row.overdueOver90) : '-'}</td>
                </tr>
              `).join("")}
            </tbody>
            ${agingMatrixData.length > 0 ? `
              <tfoot>
                <tr style="background: var(--bg-surface-subtle); font-weight: 700; border-top: 2px solid var(--border-strong);">
                  <td colspan="2">TỔNG CỘNG (${agingMatrixData.length} Đối Tác)</td>
                  <td class="text-right font-mono text-primary font-bold">${formatCurrency(totals.totalDebt)}</td>
                  <td class="text-right font-mono aging-current">${formatCurrency(totals.current)}</td>
                  <td class="text-right font-mono aging-1-30">${formatCurrency(totals.overdue1_30)}</td>
                  <td class="text-right font-mono aging-31-60">${formatCurrency(totals.overdue31_60)}</td>
                  <td class="text-right font-mono aging-61-90">${formatCurrency(totals.overdue61_90)}</td>
                  <td class="text-right font-mono aging-over-90">${formatCurrency(totals.overdueOver90)}</td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
      </div>

      <!-- Section 2: Biên Bản Đối Chiếu Công Nợ Chi Tiết (Printable Statement) -->
      <div class="card">
        <div class="card-header" style="flex-wrap: wrap; gap: var(--space-3);">
          <div class="card-title">
            <i data-lucide="file-check-2" style="color: var(--success-600);"></i>
            <span>Biên Bản Đối Chiếu Công Nợ Chi Tiết Đối Tác</span>
          </div>

          <div class="flex gap-2 items-center flex-wrap">
            <select class="form-select" id="select-statement-partner" style="height: 36px; min-width: 240px;">
              ${state.partners.map(p => `
                <option value="${p.id}" ${selectedPartner && selectedPartner.id === p.id ? 'selected' : ''}>
                  ${escapeHtml(p.name)} (${p.code || p.id})
                </option>
              `).join("")}
            </select>
            <button class="btn btn-primary btn-sm" id="btn-print-statement">
              <i data-lucide="printer"></i>
              <span>In Biên Bản (PDF)</span>
            </button>
          </div>
        </div>

        <!-- Bộ lọc thời gian cho Biên bản đối chiếu -->
        <div style="padding: var(--space-3) var(--space-4); background: var(--bg-surface-subtle); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
          <span style="font-size: 0.775rem; font-weight: 600; color: var(--text-muted);"><i data-lucide="calendar" style="width: 13px; height: 13px; vertical-align: middle;"></i> Kỳ Đối Chiếu:</span>
          
          <div class="filter-date-group" style="max-width: 320px;">
            <input type="date" class="filter-field-control filter-date-input" id="statement-filter-from-date" value="${this.statementFilterState.fromDate}">
            <span style="color: var(--text-muted);">-</span>
            <input type="date" class="filter-field-control filter-date-input" id="statement-filter-to-date" value="${this.statementFilterState.toDate}">
          </div>

          <div class="date-presets-row" style="margin-top: 0;">
            ${DATE_PRESETS.map(p => `
              <button type="button" class="preset-btn ${this.statementFilterState.datePreset === p.id ? 'active' : ''}" data-statement-preset="${p.id}">
                ${p.label}
              </button>
            `).join('')}
          </div>
        </div>

        ${selectedPartner ? this.renderStatementSheet(selectedPartner, state) : ''}
      </div>
    `;
  }

  renderStatementSheet(partner, state) {
    const allPartnerInvoices = (state.invoices || []).filter(i => i.partnerId === partner.id);
    const allPartnerPayments = (state.payments || []).filter(p => p.partnerId === partner.id);
    const settings = state.settings || {};

    const { fromDate, toDate } = this.statementFilterState;

    // 1. Tính số dư đầu kỳ (Trước fromDate nếu có)
    let openingBalance = 0;
    let periodInvoices = allPartnerInvoices;
    let periodPayments = allPartnerPayments;

    if (fromDate) {
      const priorInvoices = allPartnerInvoices.filter(i => (i.issueDate || '') < fromDate);
      const priorPayments = allPartnerPayments.filter(p => (p.paymentDate || '') < fromDate);

      const priorInvTotal = priorInvoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
      const priorPayTotal = priorPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      openingBalance = Math.max(0, priorInvTotal - priorPayTotal);

      // Phát sinh trong kỳ
      periodInvoices = allPartnerInvoices.filter(i => isDateInRange(i.issueDate, fromDate, toDate));
      periodPayments = allPartnerPayments.filter(p => isDateInRange(p.paymentDate, fromDate, toDate));
    } else if (toDate) {
      periodInvoices = allPartnerInvoices.filter(i => isDateInRange(i.issueDate, '', toDate));
      periodPayments = allPartnerPayments.filter(p => isDateInRange(p.paymentDate, '', toDate));
    }

    const totalPeriodInvoice = periodInvoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
    const totalPeriodPayment = periodPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const closingBalance = Math.max(0, openingBalance + totalPeriodInvoice - totalPeriodPayment);

    return `
      <div class="statement-sheet" id="statement-print-area">
        <div class="statement-company-info">
          <div>
            <h3 style="font-weight: 700; text-transform: uppercase;">${escapeHtml(settings.companyName || "TÊN CÔNG TY")}</h3>
            <p style="font-size: 0.85rem;">MST: ${escapeHtml(settings.companyTaxCode || "-")} | SĐT: ${escapeHtml(settings.companyPhone || "-")}</p>
            <p style="font-size: 0.85rem;">Đ/c: ${escapeHtml(settings.companyAddress || "-")}</p>
          </div>
          <div class="text-right">
            <h2 style="font-weight: 700; color: var(--primary-700);">BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ</h2>
            <p style="font-size: 0.85rem;">Ngày in: ${formatDate(new Date())}</p>
            ${fromDate || toDate ? `
              <p style="font-size: 0.85rem; color: var(--primary-700); font-weight: 600;">
                Kỳ: ${fromDate ? formatDate(fromDate) : 'Đầu kỳ'} → ${toDate ? formatDate(toDate) : 'Hiện tại'}
              </p>
            ` : ''}
          </div>
        </div>

        <div style="margin-bottom: var(--space-4); font-size: 0.9rem;">
          <p><b>Kính gửi:</b> ${escapeHtml(partner.name)}</p>
          <p><b>Mã số thuế:</b> ${escapeHtml(partner.taxCode || "-")} | <b>Điện thoại:</b> ${escapeHtml(partner.phone || "-")}</p>
          <p><b>Địa chỉ:</b> ${escapeHtml(partner.address || "-")}</p>
        </div>

        <!-- Bảng Tóm Tắt Số Dư Đầu Kỳ & Phát Sinh -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4);">
          <div style="background: var(--bg-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-main);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">DƯ NỢ ĐẦU KỲ</div>
            <div class="font-mono font-bold" style="font-size: 1.1rem; color: var(--text-main);">${formatCurrency(openingBalance)}</div>
          </div>

          <div style="background: rgba(59, 130, 246, 0.05); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid rgba(59, 130, 246, 0.2);">
            <div style="font-size: 0.75rem; color: var(--primary-700); font-weight: 600;">PHÁT SINH TĂNG (HÓA ĐƠN)</div>
            <div class="font-mono font-bold text-primary" style="font-size: 1.1rem;">+${formatCurrency(totalPeriodInvoice)}</div>
          </div>

          <div style="background: rgba(16, 185, 129, 0.05); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid rgba(16, 185, 129, 0.2);">
            <div style="font-size: 0.75rem; color: var(--success-700); font-weight: 600;">PHÁT SINH GIẢM (ĐÃ TRẢ)</div>
            <div class="font-mono font-bold text-success" style="font-size: 1.1rem;">-${formatCurrency(totalPeriodPayment)}</div>
          </div>

          <div style="background: rgba(239, 68, 68, 0.05); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid rgba(239, 68, 68, 0.2);">
            <div style="font-size: 0.75rem; color: var(--danger-700); font-weight: 600;">DƯ NỢ CUỐI KỲ</div>
            <div class="font-mono font-bold text-danger" style="font-size: 1.1rem;">${formatCurrency(closingBalance)}</div>
          </div>
        </div>

        <h4 style="margin: var(--space-4) 0 var(--space-2); font-weight: 600;">1. Chi tiết Hóa đơn phát sinh trong kỳ:</h4>
        <table class="data-table" style="margin-bottom: var(--space-4);">
          <thead>
            <tr>
              <th>Số Hóa Đơn</th>
              <th>Hàng Hóa / Dịch Vụ</th>
              <th>Ngày Lập</th>
              <th>Hạn Nợ</th>
              <th class="text-right">Số Tiền (VNĐ)</th>
              <th class="text-right">Đã Trả (VNĐ)</th>
              <th class="text-right">Còn Nợ (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            ${periodInvoices.length === 0 ? `
              <tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: var(--space-4);">Không phát sinh hóa đơn nào trong kỳ đối chiếu này.</td></tr>
            ` : periodInvoices.map(i => `
              <tr>
                <td class="font-mono font-bold">${escapeHtml(i.invoiceNumber)}</td>
                <td style="font-weight: 500;">${escapeHtml(i.itemName || i.title || i.notes || '-')}</td>
                <td>${formatDate(i.issueDate)}</td>
                <td>${formatDate(i.dueDate)}</td>
                <td class="text-right font-mono">${formatCurrency(i.totalAmount)}</td>
                <td class="text-right font-mono text-success">${formatCurrency(i.paidAmount)}</td>
                <td class="text-right font-mono font-bold">${formatCurrency(Math.max(0, (Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0)))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <h4 style="margin: var(--space-4) 0 var(--space-2); font-weight: 600;">2. Chi tiết Chứng từ thanh toán trong kỳ:</h4>
        <table class="data-table" style="margin-bottom: var(--space-4);">
          <thead>
            <tr>
              <th>Số Chứng Từ</th>
              <th>Loại Chứng Từ</th>
              <th>Ngày Thanh Toán</th>
              <th>Hình Thức</th>
              <th>Ghi Chú / Ngân Hàng</th>
              <th class="text-right">Số Tiền (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            ${periodPayments.length === 0 ? `
              <tr><td colspan="6" class="text-center" style="color: var(--text-muted); padding: var(--space-4);">Không phát sinh chứng từ thanh toán nào trong kỳ đối chiếu này.</td></tr>
            ` : periodPayments.map(p => `
              <tr>
                <td class="font-mono font-bold">${escapeHtml(p.paymentNumber)}</td>
                <td>${escapeHtml(p.voucherType || p.type)}</td>
                <td>${formatDate(p.paymentDate)}</td>
                <td>${p.paymentMethod === 'CASH' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</td>
                <td>${escapeHtml(p.notes || p.bankName || '-')}</td>
                <td class="text-right font-mono font-bold text-success">${formatCurrency(p.amount)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="background: var(--bg-surface-subtle); padding: var(--space-4); border-radius: var(--radius-md); text-align: right; margin-top: var(--space-4);">
          <span style="font-size: 1rem; font-weight: 600;">SỐ DƯ CÔNG NỢ CUỐI KỲ CẦN THANH TOÁN: </span>
          <span class="font-mono font-bold text-primary" style="font-size: 1.3rem;">${formatCurrency(closingBalance)}</span>
        </div>

        <div class="statement-signatures">
          <div class="signature-box">
            <b>ĐẠI DIỆN KHÁCH HÀNG / ĐỐI TÁC</b>
            <span>(Ký, ghi rõ họ tên và đóng dấu)</span>
          </div>
          <div class="signature-box">
            <b>ĐẠI DIỆN BÊN BÁN (KẾ TOÁN TRƯỞNG)</b>
            <span>(Ký, ghi rõ họ tên và đóng dấu)</span>
          </div>
        </div>
      </div>
    `;
  }

  afterRender(state) {
    // 1. Ma trận tuổi nợ: Chọn phân loại đối tác
    const agingPartnerTypeSelect = qs("#aging-filter-partner-type", this.container);
    if (agingPartnerTypeSelect) {
      agingPartnerTypeSelect.onchange = (e) => {
        this.agingFilterState.partnerType = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 2. Ma trận tuổi nợ: Chọn tình trạng quá hạn
    const agingConditionSelect = qs("#aging-filter-condition", this.container);
    if (agingConditionSelect) {
      agingConditionSelect.onchange = (e) => {
        this.agingFilterState.overdueCondition = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 3. Ma trận tuổi nợ: Chọn tiêu chí sắp xếp
    const agingSortSelect = qs("#aging-filter-sort-by", this.container);
    if (agingSortSelect) {
      agingSortSelect.onchange = (e) => {
        this.agingFilterState.sortBy = e.target.value;
        this.agingFilterState.sortOrder = e.target.value === "name" ? "asc" : "desc";
        this.mount(stateStore.state);
      };
    }

    // 4. Ma trận tuổi nợ: Tìm kiếm tức thì
    const agingSearchInput = qs("#aging-filter-search", this.container);
    if (agingSearchInput) {
      let debounceTimer = null;
      agingSearchInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.agingFilterState.searchQuery = e.target.value;
          this.mount(stateStore.state);
        }, 200);
      };
    }

    // 5. Biên bản đối chiếu: Chọn đối tác
    const selectPartner = qs("#select-statement-partner", this.container);
    if (selectPartner) {
      selectPartner.onchange = (e) => {
        this.selectedPartnerId = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 6. Biên bản đối chiếu: Chọn khoảng ngày
    const stmtFromDate = qs("#statement-filter-from-date", this.container);
    const stmtToDate = qs("#statement-filter-to-date", this.container);
    const handleStmtDateChange = () => {
      this.statementFilterState.fromDate = stmtFromDate ? stmtFromDate.value : "";
      this.statementFilterState.toDate = stmtToDate ? stmtToDate.value : "";
      this.statementFilterState.datePreset = "custom";
      this.mount(stateStore.state);
    };
    if (stmtFromDate) stmtFromDate.onchange = handleStmtDateChange;
    if (stmtToDate) stmtToDate.onchange = handleStmtDateChange;

    // 7. Biên bản đối chiếu: Date Presets
    qsa("[data-statement-preset]", this.container).forEach(btn => {
      btn.onclick = () => {
        const preset = btn.dataset.statementPreset;
        this.statementFilterState.datePreset = preset;
        const range = getPresetDateRange(preset);
        this.statementFilterState.fromDate = range.fromDate;
        this.statementFilterState.toDate = range.toDate;
        this.mount(stateStore.state);
      };
    });

    // 8. In biên bản
    const printBtn = qs("#btn-print-statement", this.container);
    if (printBtn) {
      printBtn.onclick = () => {
        window.print();
      };
    }

    // 9. Export Aging Matrix
    const exportAgingBtn = qs("#btn-export-aging", this.container);
    if (exportAgingBtn) {
      exportAgingBtn.onclick = () => {
        const now = new Date();
        const customers = stateStore.state.partners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH);
        const data = customers.map(p => {
          const invs = (stateStore.state.invoices || []).filter(i => i.partnerId === p.id && i.type === INVOICE_TYPES.RECEIVABLE);
          let current = 0, o1 = 0, o31 = 0, o61 = 0, o91 = 0, total = 0;
          invs.forEach(inv => {
            const rem = Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
            total += rem;
            const b = getAgingBucketKey(inv.dueDate, now);
            if (b === AGING_BUCKETS.CURRENT.id) current += rem;
            else if (b === AGING_BUCKETS.OVERDUE_1_30.id) o1 += rem;
            else if (b === AGING_BUCKETS.OVERDUE_31_60.id) o31 += rem;
            else if (b === AGING_BUCKETS.OVERDUE_61_90.id) o61 += rem;
            else o91 += rem;
          });
          return {
            code: p.code || p.id,
            name: p.name,
            totalDebt: total,
            current,
            overdue1_30: o1,
            overdue31_60: o31,
            overdue61_90: o61,
            overdueOver90: o91
          };
        }).filter(r => r.totalDebt > 0);

        ExportService.exportAgingMatrixToExcel(data);
        Toast.success("Đã xuất file Excel Ma Trận Tuổi Nợ!");
      };
    }
  }
}
