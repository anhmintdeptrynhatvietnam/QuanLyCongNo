/**
 * DASHBOARD VIEW - QUẢN LÝ CÔNG NỢ
 * Hiển thị 4 KPI Cards nợ, Biểu đồ phân tích tuổi nợ Chart.js, Danh sách nợ quá hạn khẩn cấp.
 */

import { BaseComponent } from './base-component.js';
import { calculateDashboardKPIs } from '../services/debt-engine.js';
import { formatCurrency, formatDate, renderInvoiceStatusBadge } from '../utils/formatters.js';
import { AGING_BUCKETS } from '../config.js';
import { qs, escapeHtml } from '../utils/dom.js';

export class DashboardView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.agingChart = null;
  }

  render(state) {
    const kpis = calculateDashboardKPIs(state.partners, state.invoices, state.payments);

    return `
      <!-- 4 KPI Cards Grid -->
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

      <!-- Charts & Visuals Grid -->
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
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(inv.invoiceNumber)}</div>
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
    const canvas = qs("#chart-aging-canvas");

    if (canvas && window.Chart) {
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

      this.agingChart = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Số tiền nợ (VNĐ)',
            data: dataValues,
            backgroundColor: colors,
            borderRadius: 6,
            barThickness: 36
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Số nợ: ${formatCurrency(ctx.raw)}`
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
  }
}
