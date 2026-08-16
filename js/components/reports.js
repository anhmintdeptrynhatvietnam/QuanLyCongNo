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
import { AGING_BUCKETS, PARTNER_TYPES, INVOICE_TYPES } from '../config.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';

export class ReportsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.selectedPartnerId = "";
  }

  render(state) {
    const customers = state.partners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH);
    const now = new Date();

    // Tính toán Ma trận Tuổi nợ (Aging Matrix Data)
    const agingMatrixData = customers.map(p => {
      const partnerInvoices = state.invoices.filter(inv =>
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
        const remaining = (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0);
        totalDebt += remaining;
        const bucket = getAgingBucketKey(inv.dueDate, now);

        if (bucket === AGING_BUCKETS.CURRENT.id) current += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_1_30.id) overdue1_30 += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_31_60.id) overdue31_60 += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_61_90.id) overdue61_90 += remaining;
        else if (bucket === AGING_BUCKETS.OVERDUE_OVER_90.id) overdueOver90 += remaining;
      });

      return {
        id: p.id,
        code: p.code || p.id,
        name: p.name,
        totalDebt,
        current,
        overdue1_30,
        overdue31_60,
        overdue61_90,
        overdueOver90
      };
    }).filter(row => row.totalDebt > 0);

    // Tính tổng dòng ma trận
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
        <div class="card-header">
          <div class="card-title">
            <i data-lucide="grid" style="color: var(--primary-600);"></i>
            <span>Báo Cáo Ma Trận Tuổi Nợ Khách Hàng (Aging Matrix)</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-export-aging">
            <i data-lucide="download"></i>
            <span>Xuất Excel Ma Trận</span>
          </button>
        </div>

        <div class="table-wrapper">
          <table class="data-table aging-table">
            <thead>
              <tr>
                <th>Mã Đối Tác</th>
                <th>Tên Khách Hàng</th>
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
                    Hiện không có khoản nợ phải thu nào.
                  </td>
                </tr>
              ` : agingMatrixData.map(row => `
                <tr>
                  <td class="font-mono font-bold">${escapeHtml(row.code)}</td>
                  <td>${escapeHtml(row.name)}</td>
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
                  <td colspan="2">TỔNG CỘNG</td>
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
        <div class="card-header">
          <div class="card-title">
            <i data-lucide="file-check-2" style="color: var(--success-600);"></i>
            <span>Biên Bản Đối Chiếu Công Nợ Đối Tác</span>
          </div>

          <div class="flex gap-2">
            <select class="form-select" id="select-statement-partner" style="height: 36px;">
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

        ${selectedPartner ? this.renderStatementSheet(selectedPartner, state) : ''}
      </div>
    `;
  }

  renderStatementSheet(partner, state) {
    const invoices = state.invoices.filter(i => i.partnerId === partner.id);
    const payments = state.payments.filter(p => p.partnerId === partner.id);
    const settings = state.settings || {};

    const totalInvoiceAmount = invoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
    const totalPaidAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const finalBalance = Math.max(0, totalInvoiceAmount - totalPaidAmount);

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
            <p style="font-size: 0.85rem;">Ngày lập: ${formatDate(new Date())}</p>
          </div>
        </div>

        <div style="margin-bottom: var(--space-4); font-size: 0.9rem;">
          <p><b>Kính gửi:</b> ${escapeHtml(partner.name)}</p>
          <p><b>Mã số thuế:</b> ${escapeHtml(partner.taxCode || "-")} | <b>Điện thoại:</b> ${escapeHtml(partner.phone || "-")}</p>
          <p><b>Địa chỉ:</b> ${escapeHtml(partner.address || "-")}</p>
        </div>

        <h4 style="margin: var(--space-4) 0 var(--space-2); font-weight: 600;">1. Chi tiết Hóa đơn phát sinh:</h4>
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
            ${invoices.length === 0 ? `
              <tr><td colspan="7" class="text-center">Không phát sinh hóa đơn nào.</td></tr>
            ` : invoices.map(i => `
              <tr>
                <td class="font-mono font-bold">${escapeHtml(i.invoiceNumber)}</td>
                <td style="font-weight: 500;">${escapeHtml(i.itemName || i.title || i.notes || '-')}</td>
                <td>${formatDate(i.issueDate)}</td>
                <td>${formatDate(i.dueDate)}</td>
                <td class="text-right font-mono">${formatCurrency(i.totalAmount)}</td>
                <td class="text-right font-mono text-success">${formatCurrency(i.paidAmount)}</td>
                <td class="text-right font-mono font-bold">${formatCurrency(Math.max(0, i.totalAmount - i.paidAmount))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="background: var(--bg-surface-subtle); padding: var(--space-4); border-radius: var(--radius-md); text-align: right;">
          <span style="font-size: 1rem; font-weight: 600;">SỐ DƯ CÔNG NỢ CUỐI KỲ CẦN THANH TOÁN: </span>
          <span class="font-mono font-bold text-primary" style="font-size: 1.25rem;">${formatCurrency(finalBalance)}</span>
        </div>

        <div class="statement-signatures">
          <div class="signature-box">
            <b>ĐẠI DIỆN KHÁCH HÀNG</b>
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
    // Select partner change
    const selectPartner = qs("#select-statement-partner", this.container);
    if (selectPartner) {
      selectPartner.onchange = (e) => {
        this.selectedPartnerId = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // Print statement
    const printBtn = qs("#btn-print-statement", this.container);
    if (printBtn) {
      printBtn.onclick = () => {
        window.print();
      };
    }

    // Export Aging Matrix
    const exportAgingBtn = qs("#btn-export-aging", this.container);
    if (exportAgingBtn) {
      exportAgingBtn.onclick = () => {
        // Collect current aging data
        const now = new Date();
        const customers = stateStore.state.partners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH);
        const data = customers.map(p => {
          const invs = stateStore.state.invoices.filter(i => i.partnerId === p.id && i.type === INVOICE_TYPES.RECEIVABLE);
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
