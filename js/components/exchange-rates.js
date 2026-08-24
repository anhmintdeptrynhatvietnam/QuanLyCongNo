/**
 * EXCHANGE RATES VIEW - TỶ GIÁ THEO NGÀY
 *
 * Nhập tỷ giá từ file Excel "TH TỈ GIÁ", xem theo tháng và sửa tay từng ngày.
 * Dữ liệu này là nền cho Bảng kê chi tiết cước quốc tế: mỗi dòng bảng kê quy đổi
 * KRW sang VND theo tỷ giá của đúng ngày chuyển hàng.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { ExchangeRateService } from '../services/exchange-rate-service.js';
import { Toast } from './toast.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';
import { formatDate, toInputDateFormat } from '../utils/formatters.js';

export class ExchangeRatesView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.selectedMonth = null;
  }

  /** Tháng đang xem, mặc định là tháng mới nhất có dữ liệu, nếu chưa có thì tháng hiện tại */
  resolveMonth(state) {
    const months = ExchangeRateService.availableMonths(state.exchangeRates);
    if (this.selectedMonth && (months.includes(this.selectedMonth) || months.length === 0)) {
      return this.selectedMonth;
    }
    return months[0] || toInputDateFormat(new Date()).slice(0, 7);
  }

  render(state) {
    const rates = state.exchangeRates || [];
    const months = ExchangeRateService.availableMonths(rates);
    const month = this.resolveMonth(state);
    const monthRates = ExchangeRateService.listByMonth(rates, month);
    const missingInMonth = monthRates.filter(r => !r.krwToVnd).length;

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <i data-lucide="arrow-left-right" style="color: var(--primary-600);"></i>
            <span>Tỷ Giá Ngoại Tệ Theo Ngày</span>
          </div>
          <div class="flex items-center" style="gap: var(--space-2);">
            <input type="file" id="input-import-rates" accept=".xlsx,.xls" style="display: none;">
            <button class="btn btn-primary btn-sm" id="btn-trigger-import-rates">
              <i data-lucide="upload"></i>
              <span>Nhập Từ File Excel</span>
            </button>
          </div>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--space-4);">
          File nguồn không có dòng tiêu đề. Hệ thống đọc theo vị trí cột:
          <b>cột B</b> = ngày, <b>cột D</b> = tỷ giá KRW→VND, <b>cột E</b> = tỷ giá USD→VND.
          Những ngày đã có sẵn mà chưa điền tỷ giá sẽ được bỏ qua.
        </div>

        ${rates.length === 0 ? `
          <div class="empty-state" style="text-align: center; padding: var(--space-8) var(--space-4);">
            <i data-lucide="calendar-off" style="width: 40px; height: 40px; color: var(--text-muted);"></i>
            <div style="font-weight: 600; margin-top: var(--space-3);">Chưa có dữ liệu tỷ giá</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: var(--space-1);">
              Nhập file <b>TH TỈ GIÁ</b> để bắt đầu. Chưa có tỷ giá thì chưa lập được bảng kê cước quốc tế.
            </div>
          </div>
        ` : `
          <div class="flex justify-between items-center" style="margin-bottom: var(--space-3); flex-wrap: wrap; gap: var(--space-3);">
            <div class="flex items-center" style="gap: var(--space-2);">
              <label class="form-label" style="margin: 0;">Tháng</label>
              <select class="form-control" id="select-rate-month" style="width: auto; min-width: 140px;">
                ${months.map(m => `
                  <option value="${m}" ${m === month ? 'selected' : ''}>${this.formatMonthLabel(m)}</option>
                `).join('')}
              </select>
              <span style="font-size: 0.8rem; color: var(--text-muted);">
                ${monthRates.length} ngày · tổng ${rates.length} bản ghi
              </span>
            </div>

            ${missingInMonth > 0 ? `
              <div style="font-size: 0.8rem; color: var(--warning-600); font-weight: 500;">
                <i data-lucide="alert-triangle" style="width: 14px; height: 14px; vertical-align: -2px;"></i>
                ${missingInMonth} ngày trong tháng này thiếu tỷ giá KRW
              </div>
            ` : ''}
          </div>

          <div style="overflow-x: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 130px;">Ngày</th>
                  <th style="width: 160px;">KRW → VND</th>
                  <th style="width: 180px;">USD → VND</th>
                  <th style="width: 110px;">Nguồn</th>
                  <th style="width: 70px;"></th>
                </tr>
              </thead>
              <tbody>
                ${monthRates.map(r => this.renderRow(r)).join('')}
              </tbody>
            </table>
          </div>

          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: var(--space-3);">
            Sửa trực tiếp trong ô rồi rời khỏi ô để lưu. Ô nhập nhận số thập phân (VD: 18.19).
          </div>
        `}
      </div>
    `;
  }

  /** Nhãn tháng dạng "06/2026" */
  formatMonthLabel(yearMonth) {
    const [y, m] = yearMonth.split('-');
    return `${m}/${y}`;
  }

  /**
   * Bỏ nhiễu dấu phẩy động khi hiển thị.
   * Excel lưu 18.19 thành 18.190000000000001; đưa nguyên vào value của input thì
   * người dùng thấy đúng chuỗi đó, và blur một cái là lưu lại luôn con số rác.
   */
  displayRate(value) {
    if (value === null || value === undefined || value === "") return "";
    return String(Number(Number(value).toFixed(4)));
  }

  renderRow(rate) {
    const missing = !rate.krwToVnd;
    return `
      <tr data-date="${rate.date}"${missing ? ' class="rate-row-missing"' : ''}>
        <td style="font-weight: 500;">${formatDate(rate.date)}</td>
        <td>
          <input type="number" step="0.01" min="0" class="form-control decimal-input${missing ? ' is-missing' : ''}"
                 data-field="krwToVnd" data-date="${rate.date}"
                 value="${this.displayRate(rate.krwToVnd)}" placeholder="—">
        </td>
        <td>
          <input type="number" step="1" min="0" class="form-control decimal-input"
                 data-field="usdToVnd" data-date="${rate.date}"
                 value="${this.displayRate(rate.usdToVnd)}" placeholder="—">
        </td>
        <td>
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            ${rate.source === 'MANUAL' ? 'Sửa tay' : 'File Excel'}
          </span>
        </td>
        <td>
          <button class="btn btn-icon btn-sm btn-delete-rate" data-date="${rate.date}" title="Xóa tỷ giá ngày ${escapeHtml(formatDate(rate.date))}">
            <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger-600);"></i>
          </button>
        </td>
      </tr>
    `;
  }

  afterRender(state) {
    const triggerBtn = qs("#btn-trigger-import-rates", this.container);
    const fileInput = qs("#input-import-rates", this.container);

    if (triggerBtn && fileInput) {
      triggerBtn.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this.handleImport(file);
        e.target.value = "";
      };
    }

    const monthSelect = qs("#select-rate-month", this.container);
    if (monthSelect) {
      monthSelect.onchange = (e) => {
        this.selectedMonth = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // Sửa tay: chỉ lưu khi rời ô để không ghi lại state sau mỗi ký tự
    qsa("input[data-field]", this.container).forEach(input => {
      input.onchange = () => this.handleInlineEdit(input);
    });

    qsa(".btn-delete-rate", this.container).forEach(btn => {
      btn.onclick = () => {
        const date = btn.dataset.date;
        if (confirm(`Xóa tỷ giá ngày ${formatDate(date)}?`)) {
          stateStore.deleteExchangeRate(date);
          Toast.info(`Đã xóa tỷ giá ngày ${formatDate(date)}.`);
        }
      };
    });
  }

  handleInlineEdit(input) {
    const date = input.dataset.date;
    const field = input.dataset.field;
    const raw = input.value.trim();
    const value = raw === "" ? null : Number(raw);

    if (raw !== "" && (!Number.isFinite(value) || value <= 0)) {
      Toast.warning("Tỷ giá phải là số lớn hơn 0.");
      this.mount(stateStore.state);
      return;
    }

    stateStore.upsertExchangeRate(date, { [field]: value });
  }

  async handleImport(file) {
    try {
      const result = await ExchangeRateService.parseFromExcel(file);
      const { added, updated } = stateStore.importExchangeRates(result.rates);

      let msg = `Đã nhập ${result.rates.length} dòng tỷ giá (${added} thêm mới, ${updated} cập nhật).`;
      if (result.skipped > 0) msg += ` Bỏ qua ${result.skipped} ngày chưa điền tỷ giá.`;
      // Dùng Toast.show để đặt được thời gian hiển thị: tham số thứ 2 của
      // Toast.success là tiêu đề, không phải duration
      Toast.show(msg, "success", "Nhập tỷ giá", 6000);

      if (result.rejected.length > 0) {
        const detail = result.rejected
          .slice(0, 5)
          .map(r => `dòng ${r.excelRow} (${r.date}): ${r.reason}`)
          .join('; ');
        Toast.show(
          `${result.rejected.length} dòng bị loại vì tỷ giá ngoài khoảng hợp lệ — ${detail}` +
          (result.rejected.length > 5 ? ' …' : ''),
          "warning",
          "Dòng bị loại",
          12000
        );
      }
    } catch (err) {
      Toast.show(err.message || "Không nhập được file tỷ giá.", "error", "Lỗi nhập tỷ giá", 12000);
    }
  }
}
