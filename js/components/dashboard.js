/**
 * DASHBOARD VIEW - QUẢN LÝ CÔNG NỢ DOANH NGHIỆP
 * Hiển thị KPI, Biểu đồ Diễn biến Công nợ & Dòng tiền 12 Tháng, Cơ cấu Top Đối tác,
 * Bảng Ma trận Công nợ 12 Tháng (Chuẩn biểu mẫu kế toán), Phân tích Tuổi nợ và Nợ quá hạn khẩn cấp.
 */

import { BaseComponent } from './base-component.js';
import { calculateDashboardKPIs, calculateMonthlyReceivablesMatrix } from '../services/debt-engine.js';
import { ExportService } from '../services/export-service.js';
import { Toast } from './toast.js';
import { formatCurrency, formatDate, renderInvoiceStatusBadge } from '../utils/formatters.js';
import { AGING_BUCKETS } from '../config.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';

export class DashboardView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.agingChart = null;
    this.monthlyTrendChart = null;
    this.topDebtorsChart = null;
    this.selectedYear = new Date().getFullYear();
    this.partnerSearchQuery = "";
    this.matrixPartnerType = "ALL"; // "ALL" | "CUSTOMER" | "VENDOR"
    this.matrixDebtStatus = "ALL"; // "ALL" | "HAS_REMAINING" | "HAS_INCURRED"
    this.matrixSortBy = "remainingDebt"; // "remainingDebt" | "totalDebt" | "paidAmount" | "collectionRate" | "name"
    this.matrixSortOrder = "desc";
  }

  render(state) {
    const kpis = calculateDashboardKPIs(state.partners, state.invoices, state.payments);
    const matrixData = calculateMonthlyReceivablesMatrix(state.partners, state.invoices, state.payments, this.selectedYear);

    // Lọc danh sách đối tác theo phân loại đối tác
    let filteredPartners = matrixData.partnerMatrix;
    if (this.matrixPartnerType === "CUSTOMER") {
      filteredPartners = filteredPartners.filter(p => p.type === "CUSTOMER" || p.type === "BOTH");
    } else if (this.matrixPartnerType === "VENDOR") {
      filteredPartners = filteredPartners.filter(p => p.type === "VENDOR" || p.type === "BOTH");
    }

    // Lọc theo tình trạng dư nợ
    if (this.matrixDebtStatus === "HAS_REMAINING") {
      filteredPartners = filteredPartners.filter(p => (Number(p.remainingDebt) || 0) > 0);
    } else if (this.matrixDebtStatus === "HAS_INCURRED") {
      filteredPartners = filteredPartners.filter(p => (Number(p.totalDebt) || 0) > 0);
    }

    // Lọc danh sách đối tác theo thanh tìm kiếm
    const cleanSearch = this.partnerSearchQuery.trim().toLowerCase();
    if (cleanSearch) {
      filteredPartners = filteredPartners.filter(p => 
        (p.name && p.name.toLowerCase().includes(cleanSearch)) || 
        (p.code && p.code.toLowerCase().includes(cleanSearch))
      );
    }

    // Sắp xếp danh sách bảng ma trận
    filteredPartners = [...filteredPartners].sort((a, b) => {
      let valA = a[this.matrixSortBy];
      let valB = b[this.matrixSortBy];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return this.matrixSortOrder === 'desc' ? valB - valA : valA - valB;
      }
      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();
      if (strA < strB) return this.matrixSortOrder === 'desc' ? 1 : -1;
      if (strA > strB) return this.matrixSortOrder === 'desc' ? -1 : 1;
      return 0;
    });

    return `
      <!-- 1. 4 KPI Cards Grid -->
      <div class="kpi-grid">
        <!-- Phải Thu Khách Hàng -->
        <div class="kpi-card kpi-receivable">
          <div class="kpi-header">
            <span class="kpi-title">Phải Thu Khách Hàng (AR)</span>
            <div class="kpi-icon-wrap">
              <i data-lucide="arrow-down-left"></i>
            </div>
          </div>
          <div class="kpi-value font-mono amount">${formatCurrency(kpis.totalReceivable)}</div>
          <div class="kpi-footer">
            <span class="text-danger font-mono font-bold">${formatCurrency(kpis.overdueReceivable)}</span>
            <span>quá hạn</span>
          </div>
        </div>

        <!-- Phải Trả Nhà Cung Cấp -->
        <div class="kpi-card kpi-payable">
          <div class="kpi-header">
            <span class="kpi-title">Phải Trả Nhà Cung Cấp (AP)</span>
            <div class="kpi-icon-wrap">
              <i data-lucide="arrow-up-right"></i>
            </div>
          </div>
          <div class="kpi-value font-mono amount">${formatCurrency(kpis.totalPayable)}</div>
          <div class="kpi-footer">
            <span class="text-danger font-mono">${formatCurrency(kpis.overduePayable)}</span>
            <span>quá hạn</span>
          </div>
        </div>

        <!-- Thu Dự Kiến 7 Ngày Tới -->
        <div class="kpi-card kpi-forecast">
          <div class="kpi-header">
            <span class="kpi-title">Thu Dự Kiến (7 Ngày Tới)</span>
            <div class="kpi-icon-wrap">
              <i data-lucide="calendar-check"></i>
            </div>
          </div>
          <div class="kpi-value font-mono amount text-success">${formatCurrency(kpis.expectedCashIn7Days)}</div>
          <div class="kpi-footer">
            <span>Dựa trên hạn nợ các hóa đơn bán ra</span>
          </div>
        </div>

        <!-- Chi Dự Kiến 7 Ngày Tới -->
        <div class="kpi-card kpi-overdue">
          <div class="kpi-header">
            <span class="kpi-title">Chi Dự Kiến (7 Ngày Tới)</span>
            <div class="kpi-icon-wrap">
              <i data-lucide="calendar-clock"></i>
            </div>
          </div>
          <div class="kpi-value font-mono amount text-warning">${formatCurrency(kpis.expectedCashOut7Days)}</div>
          <div class="kpi-footer">
            <span>Cần chuẩn bị ngân quỹ thanh toán</span>
          </div>
        </div>
      </div>

      <!-- 2. Section: Diễn Biến & Cơ Cấu Công Nợ 12 Tháng -->
      <div class="dashboard-section">
        <div class="dashboard-section-header">
          <div class="dashboard-section-title">
            <i data-lucide="trending-up" style="color: var(--primary-600);"></i>
            <span>Diễn Biến Công Nợ & Thu Tiền Theo Tháng (${this.selectedYear})</span>
          </div>
          <div class="flex items-center gap-2">
            <span style="font-size: 0.8125rem; font-weight: 600; color: var(--text-muted);">Chọn Năm:</span>
            <select id="matrix-year-select" class="form-control" style="width: 100px; padding: var(--space-1) var(--space-2); font-weight: 700; font-size: 0.875rem;">
              ${matrixData.availableYears.map(yr => `
                <option value="${yr}" ${yr === this.selectedYear ? 'selected' : ''}>${yr}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="dashboard-charts-2col">
          <!-- Biểu Đồ Diễn Biến 12 Tháng -->
          <div class="chart-card">
            <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: var(--space-3); margin-bottom: var(--space-3);">
              <div class="card-title" style="font-size: 0.9rem;">
                <i data-lucide="line-chart" style="color: var(--primary-600);"></i>
                <span>Phát Sinh Nợ Mới vs Thu Hồi Tiền Thực Tế (12 Tháng)</span>
              </div>
            </div>
            <div class="chart-wrapper">
              <canvas id="chart-monthly-trend-canvas"></canvas>
            </div>
          </div>

          <!-- Biểu Đồ Top 10 Khách Hàng Nợ Lớn Nhất -->
          <div class="chart-card">
            <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: var(--space-3); margin-bottom: var(--space-3);">
              <div class="card-title" style="font-size: 0.9rem;">
                <i data-lucide="pie-chart" style="color: var(--primary-600);"></i>
                <span>Top Khách Hàng Có Phát Sinh Nợ Lớn Nhất</span>
              </div>
            </div>
            <div class="chart-wrapper">
              <canvas id="chart-top-debtors-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Section: Bảng Tổng Hợp Công Nợ Phải Thu 12 Tháng Theo Đối Tác (Chuẩn Kế Toán) -->
      <div class="monthly-matrix-card">
        <div class="monthly-matrix-toolbar" style="flex-wrap: wrap; gap: var(--space-3);">
          <div class="flex items-center gap-3">
            <div style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="table-2" style="color: var(--primary-600);"></i>
              <span>Bảng Tổng Hợp Công Nợ Phải Thu Năm ${this.selectedYear}</span>
              <span class="matrix-unit-badge">ĐVT: VNĐ</span>
            </div>
            <span class="badge badge-secondary font-mono" style="font-size: 0.75rem;">${filteredPartners.length} Đối Tác</span>
          </div>

          <!-- Filter Toolbar cho Bảng 12 Tháng -->
          <div class="flex items-center gap-2 flex-wrap" style="margin-left: auto;">
            <!-- 1. Lọc loại đối tác -->
            <select id="matrix-filter-type" class="form-control" style="width: 140px; height: 32px; font-size: 0.8rem;">
              <option value="ALL" ${this.matrixPartnerType === 'ALL' ? 'selected' : ''}>Tất cả đối tác</option>
              <option value="CUSTOMER" ${this.matrixPartnerType === 'CUSTOMER' ? 'selected' : ''}>Khách Hàng</option>
              <option value="VENDOR" ${this.matrixPartnerType === 'VENDOR' ? 'selected' : ''}>Nhà Cung Cấp</option>
            </select>

            <!-- 2. Lọc tình trạng nợ -->
            <select id="matrix-filter-debt" class="form-control" style="width: 155px; height: 32px; font-size: 0.8rem;">
              <option value="ALL" ${this.matrixDebtStatus === 'ALL' ? 'selected' : ''}>Tất cả tình trạng</option>
              <option value="HAS_REMAINING" ${this.matrixDebtStatus === 'HAS_REMAINING' ? 'selected' : ''}>Còn dư nợ (>0đ)</option>
              <option value="HAS_INCURRED" ${this.matrixDebtStatus === 'HAS_INCURRED' ? 'selected' : ''}>Có phát sinh nợ</option>
            </select>

            <!-- 3. Sắp xếp -->
            <select id="matrix-filter-sort" class="form-control" style="width: 165px; height: 32px; font-size: 0.8rem;">
              <option value="remainingDebt" ${this.matrixSortBy === 'remainingDebt' ? 'selected' : ''}>Còn nợ nhiều nhất</option>
              <option value="totalDebt" ${this.matrixSortBy === 'totalDebt' ? 'selected' : ''}>Tổng nợ cao nhất</option>
              <option value="paidAmount" ${this.matrixSortBy === 'paidAmount' ? 'selected' : ''}>Đã thu nhiều nhất</option>
              <option value="collectionRate" ${this.matrixSortBy === 'collectionRate' ? 'selected' : ''}>Tỷ lệ thu hồi cao nhất</option>
              <option value="name" ${this.matrixSortBy === 'name' ? 'selected' : ''}>Tên đối tác (A - Z)</option>
            </select>

            <!-- 4. Tìm kiếm tức thì -->
            <div class="search-box" style="width: 200px;">
              <i data-lucide="search"></i>
              <input type="text" id="matrix-partner-search" class="form-control" placeholder="Tìm tên/mã..." value="${escapeHtml(this.partnerSearchQuery)}" style="height: 32px;">
            </div>

            <button type="button" class="btn btn-secondary btn-sm" id="btn-export-monthly-matrix">
              <i data-lucide="file-spreadsheet"></i>
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        <div class="monthly-matrix-wrapper">
          <table class="monthly-matrix-table" id="monthly-matrix-table">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;">STT</th>
                <th style="width: 110px;">Mã ĐT</th>
                <th class="sticky-col" style="min-width: 220px;">Tên Khách Hàng</th>
                ${Array.from({ length: 12 }, (_, i) => `
                  <th style="text-align: right; min-width: 95px; width: 95px;">T${i + 1}</th>
                `).join('')}
                <th style="text-align: right; min-width: 130px; background: rgba(37, 99, 235, 0.06); color: var(--primary-700);">Tổng Nợ</th>
                <th style="text-align: right; min-width: 130px; background: rgba(16, 185, 129, 0.06); color: var(--success-700);">Đã Thu</th>
                <th style="text-align: right; min-width: 130px; background: rgba(239, 68, 68, 0.06); color: var(--danger-700);">Còn Nợ</th>
                <th style="text-align: center; width: 95px;">Thu Hồi</th>
              </tr>
            </thead>
            <tbody id="matrix-table-body">
              ${filteredPartners.length === 0 ? `
                <tr>
                  <td colspan="19" style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
                    Không tìm thấy dữ liệu công nợ phù hợp trong năm ${this.selectedYear}.
                  </td>
                </tr>
              ` : filteredPartners.map((item, idx) => {
                const recClass = item.collectionRate >= 80 ? 'recovery-high' : item.collectionRate >= 40 ? 'recovery-mid' : 'recovery-low';
                return `
                  <tr>
                    <td style="text-align: center; color: var(--text-muted);" class="font-mono">${idx + 1}</td>
                    <td class="font-mono" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.code || '-')}</td>
                    <td class="sticky-col" style="font-weight: 600;">
                      <a href="#reports" style="color: inherit; text-decoration: none;" title="Bấm để xem biên bản đối chiếu">${escapeHtml(item.name)}</a>
                    </td>
                    ${item.months.map((amt, mIdx) => `
                      <td style="text-align: right;" class="font-mono ${amt > 0 ? 'cell-has-value' : 'cell-zero'}" title="Tháng ${mIdx + 1}: ${formatCurrency(amt)}">
                        ${amt > 0 ? formatCurrency(amt, false) : '<span class="dash-zero">-</span>'}
                      </td>
                    `).join('')}
                    <td style="text-align: right; font-weight: 700; background: rgba(37, 99, 235, 0.03);" class="font-mono text-primary" title="Tổng phát sinh: ${formatCurrency(item.totalDebt)}">
                      ${formatCurrency(item.totalDebt, false)}
                    </td>
                    <td style="text-align: right; font-weight: 600; background: rgba(16, 185, 129, 0.03);" class="font-mono text-success" title="Đã thu: ${formatCurrency(item.paidAmount)}">
                      ${formatCurrency(item.paidAmount, false)}
                    </td>
                    <td style="text-align: right; font-weight: 700; background: rgba(239, 68, 68, 0.03);" class="font-mono ${item.remainingDebt > 0 ? 'text-danger' : 'text-muted'}" title="Còn nợ: ${formatCurrency(item.remainingDebt)}">
                      ${item.remainingDebt > 0 ? formatCurrency(item.remainingDebt, false) : '<span class="dash-zero">-</span>'}
                    </td>
                    <td style="text-align: center;">
                      <span class="recovery-badge ${recClass}">${item.collectionRate}%</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td style="text-align: center;">Σ</td>
                <td></td>
                <td class="sticky-col" style="font-weight: 700; color: var(--primary-700);">TỔNG CỘNG (${this.selectedYear})</td>
                ${(matrixData.grandTotals.months || Array(12).fill(0)).map((amt, mIdx) => `
                  <td style="text-align: right;" class="font-mono ${amt > 0 ? 'font-bold' : ''}" title="Tổng T${mIdx + 1}: ${formatCurrency(amt)}">
                    ${amt > 0 ? formatCurrency(amt, false) : '<span class="dash-zero">-</span>'}
                  </td>
                `).join('')}
                <td style="text-align: right; font-weight: 700; font-size: 0.875rem;" class="font-mono text-primary" title="Tổng nợ năm: ${formatCurrency(matrixData.grandTotals.totalIncurred || 0)}">
                  ${formatCurrency(matrixData.grandTotals.totalIncurred || 0, false)}
                </td>
                <td style="text-align: right; font-weight: 700; font-size: 0.875rem;" class="font-mono text-success" title="Tổng đã thu: ${formatCurrency(matrixData.grandTotals.totalPaid || 0)}">
                  ${formatCurrency(matrixData.grandTotals.totalPaid || 0, false)}
                </td>
                <td style="text-align: right; font-weight: 700; font-size: 0.875rem;" class="font-mono text-danger" title="Tổng còn nợ: ${formatCurrency(matrixData.grandTotals.totalRemaining || 0)}">
                  ${formatCurrency(matrixData.grandTotals.totalRemaining || 0, false)}
                </td>
                <td style="text-align: center;">
                  <span class="recovery-badge ${matrixData.grandTotals.overallCollectionRate >= 80 ? 'recovery-high' : matrixData.grandTotals.overallCollectionRate >= 40 ? 'recovery-mid' : 'recovery-low'}">
                    ${matrixData.grandTotals.overallCollectionRate || 0}%
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 4. Section: Tuổi Nợ & Nợ Quá Hạn Khẩn Cấp -->
      <div class="charts-grid">
        <!-- Biểu Đồ Phân Phối Tuổi Nợ -->
        <div class="chart-card">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="bar-chart-2" style="color: var(--primary-600);"></i>
              <span>Phân Tích Tuổi Nợ Khách Hàng (Aging Report)</span>
            </div>
          </div>
          <div class="chart-wrapper">
            <canvas id="chart-aging-canvas"></canvas>
          </div>
        </div>

        <!-- Top Nợ Quá Hạn Cần Đòi Gấp -->
        <div class="card">
          <div class="card-header">
            <div class="card-title text-danger">
              <i data-lucide="alert-octagon"></i>
              <span>Nợ Quá Hạn Khẩn Cấp</span>
            </div>
            <a href="#invoices" class="btn btn-secondary btn-sm">Xem tất cả</a>
          </div>

          <div class="urgent-list">
            ${kpis.urgentOverdueInvoices.length === 0 ? `
              <div style="padding: var(--space-6); text-align: center; color: var(--text-muted);">
                <i data-lucide="check-circle-2" style="width: 32px; height: 32px; color: var(--success-500); margin-bottom: 8px;"></i>
                <p>Tuyệt vời! Không có hóa đơn nào bị quá hạn.</p>
              </div>
            ` : `
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Khách Hàng</th>
                    <th class="text-right">Còn Nợ</th>
                    <th class="text-center">Quá Hạn</th>
                  </tr>
                </thead>
                <tbody>
                  ${kpis.urgentOverdueInvoices.map(inv => `
                    <tr>
                      <td>
                        <div style="font-weight: 600;">${escapeHtml(inv.partnerName)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-main); font-weight: 500;">${escapeHtml(inv.itemName || inv.title || '')}</div>
                        <div class="font-mono" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(inv.invoiceNumber)}</div>
                      </td>
                      <td class="text-right font-mono font-bold text-danger">
                        ${formatCurrency(inv.remainingAmount)}
                      </td>
                      <td class="text-center">
                        <span class="badge badge-overdue font-mono font-bold">+${inv.daysOverdue} ngày</span>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            `}
          </div>
        </div>
      </div>
    `;
  }

  afterRender(state) {
    const kpis = calculateDashboardKPIs(state.partners, state.invoices, state.payments);
    const matrixData = calculateMonthlyReceivablesMatrix(state.partners, state.invoices, state.payments, this.selectedYear);

    // 1. Năm theo dõi (Year Selector)
    const yearSelect = qs("#matrix-year-select", this.container);
    if (yearSelect) {
      yearSelect.onchange = (e) => {
        this.selectedYear = parseInt(e.target.value, 10);
        this.update(state);
      };
    }

    // 2. Lọc loại đối tác trong bảng 12 tháng
    const typeSelect = qs("#matrix-filter-type", this.container);
    if (typeSelect) {
      typeSelect.onchange = (e) => {
        this.matrixPartnerType = e.target.value;
        this.update(state);
      };
    }

    // 3. Lọc tình trạng nợ
    const debtSelect = qs("#matrix-filter-debt", this.container);
    if (debtSelect) {
      debtSelect.onchange = (e) => {
        this.matrixDebtStatus = e.target.value;
        this.update(state);
      };
    }

    // 4. Sắp xếp bảng 12 tháng
    const sortSelect = qs("#matrix-filter-sort", this.container);
    if (sortSelect) {
      sortSelect.onchange = (e) => {
        this.matrixSortBy = e.target.value;
        this.matrixSortOrder = e.target.value === 'name' ? 'asc' : 'desc';
        this.update(state);
      };
    }

    // 5. Tìm kiếm đối tác trên bảng ma trận
    const searchInput = qs("#matrix-partner-search", this.container);
    if (searchInput) {
      let searchTimer = null;
      searchInput.oninput = (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          this.partnerSearchQuery = e.target.value;
          this.update(state);
        }, 200);
      };
    }

    // 6. Nút xuất Excel Bảng 12 Tháng
    const exportBtn = qs("#btn-export-monthly-matrix", this.container);
    if (exportBtn) {
      exportBtn.onclick = () => {
        try {
          ExportService.exportMonthlyReceivablesMatrixToExcel(matrixData, this.selectedYear);
          Toast.success(`Đã xuất Bảng tổng hợp công nợ 12 tháng năm ${this.selectedYear} thành công!`);
        } catch (err) {
          Toast.error("Lỗi xuất Excel: " + err.message);
        }
      };
    }

    // 4. Biểu đồ 1: Diễn Biến Công Nợ & Thu Tiền 12 Tháng (Bar + Line)
    const monthlyTrendCanvas = qs("#chart-monthly-trend-canvas", this.container);
    if (monthlyTrendCanvas && window.Chart) {
      if (this.monthlyTrendChart) {
        this.monthlyTrendChart.destroy();
      }

      const monthLabels = matrixData.monthlySummary.map(m => m.label);
      const incurredData = matrixData.monthlySummary.map(m => m.incurred);
      const paidData = matrixData.monthlySummary.map(m => m.paid);
      const remainingData = matrixData.monthlySummary.map(m => m.remaining);

      this.monthlyTrendChart = new window.Chart(monthlyTrendCanvas, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            {
              type: 'bar',
              label: 'Phát sinh mới (Bán chịu)',
              data: incurredData,
              backgroundColor: 'rgba(37, 99, 235, 0.85)',
              hoverBackgroundColor: 'rgba(37, 99, 235, 1)',
              borderRadius: 4,
              order: 2
            },
            {
              type: 'bar',
              label: 'Đã thu tiền',
              data: paidData,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              hoverBackgroundColor: 'rgba(16, 185, 129, 1)',
              borderRadius: 4,
              order: 3
            },
            {
              type: 'line',
              label: 'Dư nợ còn lại',
              data: remainingData,
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              borderWidth: 2.5,
              pointBackgroundColor: '#f59e0b',
              pointRadius: 4,
              fill: false,
              tension: 0.3,
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 12,
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (val) => `${(val / 1000000).toLocaleString('vi-VN')} Tr`
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }

    // 5. Biểu đồ 2: Top 10 Khách Hàng Nợ Lớn Nhất (Stacked Horizontal Bar)
    const topDebtorsCanvas = qs("#chart-top-debtors-canvas", this.container);
    if (topDebtorsCanvas && window.Chart) {
      if (this.topDebtorsChart) {
        this.topDebtorsChart.destroy();
      }

      const top10 = matrixData.topDebtors.slice(0, 8); // Top 8 hiển thị gọn đẹp
      const partnerLabels = top10.map(p => p.name.length > 16 ? p.name.slice(0, 15) + '...' : p.name);
      const paidData = top10.map(p => p.paidAmount);
      const remainingData = top10.map(p => p.remainingDebt);

      this.topDebtorsChart = new window.Chart(topDebtorsCanvas, {
        type: 'bar',
        data: {
          labels: partnerLabels,
          datasets: [
            {
              label: 'Đã thanh toán',
              data: paidData,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderRadius: 4
            },
            {
              label: 'Còn nợ',
              data: remainingData,
              backgroundColor: 'rgba(239, 68, 68, 0.85)',
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                callback: (val) => `${(val / 1000000).toLocaleString('vi-VN')} Tr`
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            y: {
              stacked: true,
              grid: { display: false },
              ticks: {
                font: { size: 10.5, weight: '600' }
              }
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 12,
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
              }
            }
          }
        }
      });
    }

    // 6. Biểu Đồ Tuổi Nợ (Aging Chart)
    const agingCanvas = qs("#chart-aging-canvas", this.container);
    if (agingCanvas && window.Chart) {
      if (this.agingChart) {
        this.agingChart.destroy();
      }

      const labels = [
        AGING_BUCKETS.CURRENT.label,
        AGING_BUCKETS.OVERDUE_1_30.label,
        AGING_BUCKETS.OVERDUE_31_60.label,
        AGING_BUCKETS.OVERDUE_61_90.label,
        AGING_BUCKETS.OVERDUE_OVER_90.label
      ];

      const dataValues = [
        kpis.agingReceivable[AGING_BUCKETS.CURRENT.id] || 0,
        kpis.agingReceivable[AGING_BUCKETS.OVERDUE_1_30.id] || 0,
        kpis.agingReceivable[AGING_BUCKETS.OVERDUE_31_60.id] || 0,
        kpis.agingReceivable[AGING_BUCKETS.OVERDUE_61_90.id] || 0,
        kpis.agingReceivable[AGING_BUCKETS.OVERDUE_OVER_90.id] || 0
      ];

      const colors = [
        AGING_BUCKETS.CURRENT.color,
        AGING_BUCKETS.OVERDUE_1_30.color,
        AGING_BUCKETS.OVERDUE_31_60.color,
        AGING_BUCKETS.OVERDUE_61_90.color,
        AGING_BUCKETS.OVERDUE_OVER_90.color
      ];

      this.agingChart = new window.Chart(agingCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Số tiền nợ (VNĐ)',
            data: dataValues,
            backgroundColor: colors,
            borderRadius: 6,
            barThickness: 32
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` Số nợ: ${formatCurrency(ctx.raw)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (val) => `${(val / 1000000).toLocaleString('vi-VN')} Tr`
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }
  }

  destroy() {
    if (this.agingChart) {
      this.agingChart.destroy();
      this.agingChart = null;
    }
    if (this.monthlyTrendChart) {
      this.monthlyTrendChart.destroy();
      this.monthlyTrendChart = null;
    }
    if (this.topDebtorsChart) {
      this.topDebtorsChart.destroy();
      this.topDebtorsChart = null;
    }
  }
}

