/**
 * PAYMENTS VIEW - QUẢN LÝ CÔNG NỢ
 * Quản lý Chứng từ Thu - Chi & Chuyển khoản Ngân hàng:
 * - Tiền mặt: Phiếu Thu (PT) & Phiếu Chi (PC)
 * - Ngân hàng: Ủy Nhiệm Thu / Báo Có (UNT) & Ủy Nhiệm Chi (UNC)
 * - Khớp nợ tự động FIFO và In biểu mẫu chứng từ chuẩn Bộ Tài Chính / Ngân hàng.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { VoucherTemplates } from '../services/voucher-templates.js';
import { formatCurrency, formatDate, toInputDateFormat, parseCurrency, formatCurrencyNumber } from '../utils/formatters.js';
import { 
  PAYMENT_TYPES, 
  PAYMENT_METHODS, 
  PAYMENT_METHOD_LABELS, 
  VOUCHER_TYPES, 
  VOUCHER_TYPE_LABELS, 
  VOUCHER_TYPE_PREFIXES, 
  INVOICE_TYPES,
  getVoucherType 
} from '../config.js';
import { autoAllocatePaymentFIFO } from '../services/debt-engine.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';
import { isDateInRange, isAmountInRange, countActiveFilters, sortDataList, getPresetDateRange, DATE_PRESETS } from '../utils/filter-helpers.js';

export class PaymentsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.defaultFilterState = {
      voucherType: "ALL",
      direction: "ALL", // "ALL" | "RECEIPT" | "PAYMENT"
      paymentMethod: "ALL",
      partnerId: "ALL",
      datePreset: "all",
      fromDate: "",
      toDate: "",
      minAmount: "",
      maxAmount: "",
      sortBy: "paymentDate",
      sortOrder: "desc",
      searchQuery: "",
      isAdvancedOpen: false
    };
    this.filterState = { ...this.defaultFilterState };
  }

  render(state) {
    let filteredPayments = state.payments || [];

    // 1. Lọc theo Loại chứng từ
    if (this.filterState.voucherType !== "ALL") {
      filteredPayments = filteredPayments.filter(p => {
        const vType = p.voucherType || getVoucherType(p.type, p.paymentMethod);
        return vType === this.filterState.voucherType;
      });
    }

    // 2. Lọc theo Chiều giao dịch (Thu / Chi)
    if (this.filterState.direction !== "ALL") {
      filteredPayments = filteredPayments.filter(p => {
        const isReceipt = p.type === PAYMENT_TYPES.RECEIPT || p.type === "RECEIPT";
        return this.filterState.direction === "RECEIPT" ? isReceipt : !isReceipt;
      });
    }

    // 3. Lọc theo Hình thức thanh toán
    if (this.filterState.paymentMethod !== "ALL") {
      filteredPayments = filteredPayments.filter(p => p.paymentMethod === this.filterState.paymentMethod);
    }

    // 4. Lọc theo Đối tác
    if (this.filterState.partnerId !== "ALL") {
      filteredPayments = filteredPayments.filter(p => p.partnerId === this.filterState.partnerId);
    }

    // 5. Lọc theo Khoảng ngày (Ngày lập chứng từ)
    if (this.filterState.fromDate || this.filterState.toDate) {
      filteredPayments = filteredPayments.filter(p =>
        isDateInRange(p.paymentDate, this.filterState.fromDate, this.filterState.toDate)
      );
    }

    // 6. Lọc theo Khoảng số tiền
    if (this.filterState.minAmount !== "" || this.filterState.maxAmount !== "") {
      filteredPayments = filteredPayments.filter(p =>
        isAmountInRange(p.amount || 0, this.filterState.minAmount, this.filterState.maxAmount)
      );
    }

    // 7. Lọc theo tìm kiếm
    const effectiveSearch = (this.filterState.searchQuery || state.searchQuery || "").trim().toLowerCase();
    if (effectiveSearch) {
      filteredPayments = filteredPayments.filter(p =>
        (p.paymentNumber && p.paymentNumber.toLowerCase().includes(effectiveSearch)) ||
        (p.partnerName && p.partnerName.toLowerCase().includes(effectiveSearch)) ||
        (p.notes && p.notes.toLowerCase().includes(effectiveSearch)) ||
        (p.bankName && p.bankName.toLowerCase().includes(effectiveSearch)) ||
        (p.bankAccount && p.bankAccount.toLowerCase().includes(effectiveSearch))
      );
    }

    // 8. Sắp xếp danh sách
    filteredPayments = sortDataList(filteredPayments, this.filterState.sortBy, this.filterState.sortOrder);

    const countByType = {
      pt: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.RECEIPT_CASH).length,
      unt: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.RECEIPT_BANK).length,
      pc: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.PAYMENT_CASH).length,
      unc: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.PAYMENT_BANK).length
    };

    const activeFilterCount = countActiveFilters(this.filterState, this.defaultFilterState);
    const selectedPartner = state.partners.find(p => p.id === this.filterState.partnerId);

    return `
      <!-- Modern Filter Card -->
      <div class="filter-card">
        <div class="filter-toolbar">
          <div class="filter-left">
            <!-- Quick Voucher Pills -->
            <button class="btn btn-sm ${this.filterState.voucherType === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="ALL">
              Tất Cả (${state.payments.length})
            </button>
            <button class="btn btn-sm ${this.filterState.voucherType === VOUCHER_TYPES.RECEIPT_CASH ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.RECEIPT_CASH}">
              <span class="badge-dot" style="background: var(--success-600);"></span>
              Phiếu Thu (${countByType.pt})
            </button>
            <button class="btn btn-sm ${this.filterState.voucherType === VOUCHER_TYPES.RECEIPT_BANK ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.RECEIPT_BANK}">
              <span class="badge-dot" style="background: var(--info-600);"></span>
              Ủy Nhiệm Thu (${countByType.unt})
            </button>
            <button class="btn btn-sm ${this.filterState.voucherType === VOUCHER_TYPES.PAYMENT_CASH ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.PAYMENT_CASH}">
              <span class="badge-dot" style="background: var(--warning-600);"></span>
              Phiếu Chi (${countByType.pc})
            </button>
            <button class="btn btn-sm ${this.filterState.voucherType === VOUCHER_TYPES.PAYMENT_BANK ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.PAYMENT_BANK}">
              <span class="badge-dot" style="background: var(--primary-700);"></span>
              Ủy Nhiệm Chi (${countByType.unc})
            </button>

            <!-- Search box in toolbar -->
            <div class="filter-search-box">
              <i data-lucide="search"></i>
              <input type="text" class="filter-search-input" id="pay-filter-search" placeholder="Tìm số CT, đối tác, ngân hàng..." value="${escapeHtml(this.filterState.searchQuery)}">
            </div>
          </div>

          <div class="filter-right">
            <!-- Nút bật/tắt bộ lọc nâng cao -->
            <button class="filter-btn-toggle ${this.filterState.isAdvancedOpen ? 'active' : ''}" id="btn-toggle-pay-filter">
              <i data-lucide="sliders-horizontal"></i>
              <span>Bộ Lọc Nâng Cao</span>
              ${activeFilterCount > 0 ? `<span class="filter-badge-count">${activeFilterCount}</span>` : ''}
            </button>

            ${activeFilterCount > 0 ? `
              <button class="filter-btn-reset" id="btn-reset-pay-filter" title="Xóa tất cả bộ lọc về mặc định">
                <i data-lucide="rotate-ccw"></i>
                <span>Đặt Lại</span>
              </button>
            ` : ''}

            <div class="flex gap-2 flex-wrap">
              <!-- Nhóm Nút Thu Tiền -->
              <button class="btn btn-success btn-sm" id="btn-add-receipt-cash" title="Thu tiền mặt tại quỹ">
                <i data-lucide="arrow-down-left"></i>
                <span>+ Phiếu Thu</span>
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-add-receipt-bank" style="color: var(--info-700); border-color: var(--info-500);" title="Lập Ủy nhiệm thu tiền qua ngân hàng">
                <i data-lucide="building-2"></i>
                <span>+ Lập UNT</span>
              </button>

              <!-- Nhóm Nút Chi Tiền -->
              <button class="btn btn-warning btn-sm" id="btn-add-payment-cash" title="Chi tiền mặt tại quỹ">
                <i data-lucide="arrow-up-right"></i>
                <span>+ Phiếu Chi</span>
              </button>
              <button class="btn btn-primary btn-sm" id="btn-add-payment-bank" title="Ủy nhiệm chi ngân hàng thanh toán cho đối tác">
                <i data-lucide="send"></i>
                <span>+ Lập UNC</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Khung Bộ Lọc Nâng Cao (Collapsible Drawer) -->
        <div class="filter-drawer ${this.filterState.isAdvancedOpen ? 'open' : ''}" id="pay-filter-drawer">
          <div class="filter-grid">
            <!-- 1. Chiều giao dịch -->
            <div class="filter-field">
              <label class="filter-field-label">Chiều Giao Dịch</label>
              <select class="filter-field-control" id="pay-filter-direction">
                <option value="ALL" ${this.filterState.direction === 'ALL' ? 'selected' : ''}>Tất cả chiều giao dịch</option>
                <option value="RECEIPT" ${this.filterState.direction === 'RECEIPT' ? 'selected' : ''}>📥 Thu Tiền (Bán hàng / Thu nợ)</option>
                <option value="PAYMENT" ${this.filterState.direction === 'PAYMENT' ? 'selected' : ''}>📤 Chi Tiền (Mua hàng / Trả nợ)</option>
              </select>
            </div>

            <!-- 2. Chọn Đối tác -->
            <div class="filter-field">
              <label class="filter-field-label">Đối Tác Giao Dịch</label>
              <select class="filter-field-control" id="pay-filter-partner">
                <option value="ALL">-- Tất cả đối tác --</option>
                ${state.partners.map(p => `
                  <option value="${p.id}" ${this.filterState.partnerId === p.id ? 'selected' : ''}>
                    ${escapeHtml(p.name)} (${p.code || p.id})
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- 3. Lọc theo Khoảng ngày -->
            <div class="filter-field" style="grid-column: span 2;">
              <label class="filter-field-label">Ngày Lập Chứng Từ</label>
              <div class="filter-date-group">
                <input type="date" class="filter-field-control filter-date-input" id="pay-filter-from-date" value="${this.filterState.fromDate}">
                <span style="color: var(--text-muted);">-</span>
                <input type="date" class="filter-field-control filter-date-input" id="pay-filter-to-date" value="${this.filterState.toDate}">
              </div>

              <!-- Quick Date Presets -->
              <div class="date-presets-row">
                ${DATE_PRESETS.map(p => `
                  <button type="button" class="preset-btn ${this.filterState.datePreset === p.id ? 'active' : ''}" data-pay-preset="${p.id}">
                    ${p.label}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- 4. Khoảng số tiền (Min - Max) -->
            <div class="filter-field">
              <label class="filter-field-label">Số Tiền Giao Dịch (VNĐ)</label>
              <div style="display: flex; gap: var(--space-2); align-items: center;">
                <input type="number" class="filter-field-control" id="pay-filter-min-amount" placeholder="Tối thiểu" value="${this.filterState.minAmount}">
                <span style="color: var(--text-muted);">-</span>
                <input type="number" class="filter-field-control" id="pay-filter-max-amount" placeholder="Tối đa" value="${this.filterState.maxAmount}">
              </div>
            </div>

            <!-- 5. Tiêu chí sắp xếp -->
            <div class="filter-field">
              <label class="filter-field-label">Sắp Xếp Theo</label>
              <select class="filter-field-control" id="pay-filter-sort-by">
                <option value="paymentDate" ${this.filterState.sortBy === 'paymentDate' ? 'selected' : ''}>Ngày lập chứng từ</option>
                <option value="amount" ${this.filterState.sortBy === 'amount' ? 'selected' : ''}>Số tiền thanh toán</option>
                <option value="paymentNumber" ${this.filterState.sortBy === 'paymentNumber' ? 'selected' : ''}>Số chứng từ</option>
              </select>
            </div>

            <!-- 6. Thứ tự sắp xếp -->
            <div class="filter-field">
              <label class="filter-field-label">Thứ Tự</label>
              <select class="filter-field-control" id="pay-filter-sort-order">
                <option value="desc" ${this.filterState.sortOrder === 'desc' ? 'selected' : ''}>Mới nhất / Lớn nhất trước</option>
                <option value="asc" ${this.filterState.sortOrder === 'asc' ? 'selected' : ''}>Cũ nhất / Nhỏ nhất trước</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Filter Active Chips Summary Bar -->
        ${activeFilterCount > 0 ? `
          <div class="filter-summary-bar">
            <span class="filter-summary-label"><i data-lucide="filter" style="width: 12px; height: 12px;"></i> Đang lọc:</span>
            ${this.filterState.voucherType !== 'ALL' ? `
              <span class="filter-chip">
                Loại CT: ${
                  this.filterState.voucherType === VOUCHER_TYPES.RECEIPT_CASH ? 'Phiếu Thu' :
                  this.filterState.voucherType === VOUCHER_TYPES.RECEIPT_BANK ? 'Ủy Nhiệm Thu' :
                  this.filterState.voucherType === VOUCHER_TYPES.PAYMENT_CASH ? 'Phiếu Chi' : 'Ủy Nhiệm Chi'
                }
                <span class="filter-chip-remove" data-clear-key="voucherType">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.direction !== 'ALL' ? `
              <span class="filter-chip">
                Chiều: ${this.filterState.direction === 'RECEIPT' ? 'Thu Tiền' : 'Chi Tiền'}
                <span class="filter-chip-remove" data-clear-key="direction">&times;</span>
              </span>
            ` : ''}
            ${selectedPartner ? `
              <span class="filter-chip">
                Đối tác: ${escapeHtml(selectedPartner.name)}
                <span class="filter-chip-remove" data-clear-key="partnerId">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.fromDate || this.filterState.toDate ? `
              <span class="filter-chip">
                Ngày: ${formatDate(this.filterState.fromDate) || '...'} → ${formatDate(this.filterState.toDate) || '...'}
                <span class="filter-chip-remove" data-clear-key="dateRange">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.minAmount !== '' || this.filterState.maxAmount !== '' ? `
              <span class="filter-chip">
                Tiền: ${formatCurrency(this.filterState.minAmount || 0)} - ${this.filterState.maxAmount ? formatCurrency(this.filterState.maxAmount) : '∞'}
                <span class="filter-chip-remove" data-clear-key="amountRange">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.searchQuery ? `
              <span class="filter-chip">
                Tìm kiếm: "${escapeHtml(this.filterState.searchQuery)}"
                <span class="filter-chip-remove" data-clear-key="searchQuery">&times;</span>
              </span>
            ` : ''}
            <span class="font-mono text-muted" style="margin-left: auto; font-size: 0.725rem;">
              Hiển thị <b>${filteredPayments.length}</b> / ${state.payments.length} chứng từ
            </span>
          </div>
        ` : ''}
      </div>

      <!-- Payments Table -->
      <div class="table-container">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 120px;">Số Chứng Từ</th>
                <th style="width: 170px;">Loại Chứng Từ</th>
                <th>Đối Tác Giao Dịch</th>
                <th style="width: 110px;">Ngày Lập</th>
                <th style="width: 130px;">Hình Thức</th>
                <th class="text-right" style="width: 140px;">Số Tiền</th>
                <th>Hóa Đơn Cấn Trừ</th>
                <th class="text-center" style="width: 100px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPayments.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <i data-lucide="receipt" style="width: 32px; height: 32px; margin-bottom: 8px; color: var(--text-muted); opacity: 0.5;"></i>
                    <p>Không có chứng từ thanh toán nào phù hợp bộ lọc.</p>
                    ${activeFilterCount > 0 ? `
                      <button class="btn btn-secondary btn-sm" id="btn-reset-pay-empty" style="margin-top: 8px;">
                        <i data-lucide="rotate-ccw"></i>
                        <span>Xóa Bộ Lọc</span>
                      </button>
                    ` : ''}
                  </td>
                </tr>
              ` : filteredPayments.map(p => {
                const isReceipt = p.type === PAYMENT_TYPES.RECEIPT || p.type === "RECEIPT";
                const isCash = p.paymentMethod === PAYMENT_METHODS.CASH || p.paymentMethod === "CASH";
                const voucherType = p.voucherType || getVoucherType(p.type, p.paymentMethod);
                const allocations = p.allocations || [];

                let badgeHtml = '';
                let numColor = 'var(--text-main)';

                if (voucherType === VOUCHER_TYPES.RECEIPT_CASH) {
                  badgeHtml = `<span class="badge badge-paid"><i data-lucide="banknote" style="width: 12px; height: 12px;"></i> Phiếu Thu (PT)</span>`;
                  numColor = 'var(--success-600)';
                } else if (voucherType === VOUCHER_TYPES.RECEIPT_BANK) {
                  badgeHtml = `<span class="badge" style="background: rgba(14, 165, 233, 0.12); color: #0369a1; border: 1px solid rgba(14, 165, 233, 0.25);"><i data-lucide="building-2" style="width: 12px; height: 12px;"></i> Ủy Nhiệm Thu (UNT)</span>`;
                  numColor = '#0284c7';
                } else if (voucherType === VOUCHER_TYPES.PAYMENT_CASH) {
                  badgeHtml = `<span class="badge badge-partial"><i data-lucide="banknote" style="width: 12px; height: 12px;"></i> Phiếu Chi (PC)</span>`;
                  numColor = 'var(--warning-600)';
                } else {
                  badgeHtml = `<span class="badge" style="background: rgba(99, 102, 241, 0.12); color: #4338ca; border: 1px solid rgba(99, 102, 241, 0.25);"><i data-lucide="send" style="width: 12px; height: 12px;"></i> Ủy Nhiệm Chi (UNC)</span>`;
                  numColor = '#4f46e5';
                }

                return `
                  <tr>
                    <td>
                      <div class="font-mono font-bold" style="color: ${numColor};">
                        ${escapeHtml(p.paymentNumber)}
                      </div>
                    </td>
                    <td>
                      ${badgeHtml}
                    </td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(p.partnerName)}</div>
                      ${p.bankName ? `<div style="font-size: 0.75rem; color: var(--text-muted);"><i data-lucide="building" style="width: 11px; height: 11px; vertical-align: middle;"></i> ${escapeHtml(p.bankName)} ${p.bankAccount ? `- TK: ${escapeHtml(p.bankAccount)}` : ''}</div>` : ''}
                      ${p.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">${escapeHtml(p.notes)}</div>` : ''}
                    </td>
                    <td>${formatDate(p.paymentDate)}</td>
                    <td>
                      <span style="font-size: 0.8rem; color: var(--text-main); font-weight: 500;">
                        ${isCash ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}
                      </span>
                    </td>
                    <td class="text-right font-mono font-bold ${isReceipt ? 'text-success' : 'text-danger'}">
                      ${formatCurrency(p.amount)}
                    </td>
                    <td>
                      ${allocations.length === 0 ? '<span style="color: var(--text-muted); font-size: 0.75rem;">Không cấn trừ</span>' : allocations.map(a => `
                        <div class="font-mono" style="font-size: 0.75rem;">
                          ${escapeHtml(a.invoiceNumber)}: <b>${formatCurrency(a.amount)}</b>
                        </div>
                      `).join("")}
                    </td>
                    <td class="text-center">
                      <div class="flex items-center justify-center gap-1">
                        <button class="btn btn-icon btn-sm btn-print-voucher text-primary" data-id="${p.id}" title="Xem & In chứng từ (PDF)">
                          <i data-lucide="printer"></i>
                        </button>
                        <button class="btn btn-icon btn-sm btn-delete-payment text-danger" data-id="${p.id}" title="Hủy chứng từ (Hoàn nợ)">
                          <i data-lucide="trash-2"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  afterRender(state) {
    // 1. Bộ lọc nhanh theo loại chứng từ
    qsa("[data-pay-filter]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.filterState.voucherType = btn.dataset.payFilter;
        this.mount(stateStore.state);
      };
    });

    // 2. Search input (debounced)
    const searchInput = qs("#pay-filter-search", this.container);
    if (searchInput) {
      let debounceTimer = null;
      searchInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filterState.searchQuery = e.target.value;
          this.mount(stateStore.state);
        }, 200);
      };
    }

    // 3. Toggle Drawer
    const toggleBtn = qs("#btn-toggle-pay-filter", this.container);
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        this.filterState.isAdvancedOpen = !this.filterState.isAdvancedOpen;
        this.mount(stateStore.state);
      };
    }

    // 4. Reset Button
    const resetBtn = qs("#btn-reset-pay-filter", this.container) || qs("#btn-reset-pay-empty", this.container);
    if (resetBtn) {
      resetBtn.onclick = () => {
        this.filterState = { ...this.defaultFilterState, isAdvancedOpen: this.filterState.isAdvancedOpen };
        this.mount(stateStore.state);
        Toast.info("Đã đặt lại bộ lọc chứng từ thanh toán");
      };
    }

    // 5. Chiều giao dịch select
    const dirSelect = qs("#pay-filter-direction", this.container);
    if (dirSelect) {
      dirSelect.onchange = (e) => {
        this.filterState.direction = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 6. Partner select
    const selectPartner = qs("#pay-filter-partner", this.container);
    if (selectPartner) {
      selectPartner.onchange = (e) => {
        this.filterState.partnerId = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 7. Date Range inputs
    const fromDateInput = qs("#pay-filter-from-date", this.container);
    const toDateInput = qs("#pay-filter-to-date", this.container);
    const handleDateChange = () => {
      this.filterState.fromDate = fromDateInput ? fromDateInput.value : "";
      this.filterState.toDate = toDateInput ? toDateInput.value : "";
      this.filterState.datePreset = "custom";
      this.mount(stateStore.state);
    };
    if (fromDateInput) fromDateInput.onchange = handleDateChange;
    if (toDateInput) toDateInput.onchange = handleDateChange;

    // 8. Date Presets buttons
    qsa("[data-pay-preset]", this.container).forEach(btn => {
      btn.onclick = () => {
        const preset = btn.dataset.payPreset;
        this.filterState.datePreset = preset;
        const range = getPresetDateRange(preset);
        this.filterState.fromDate = range.fromDate;
        this.filterState.toDate = range.toDate;
        this.mount(stateStore.state);
      };
    });

    // 9. Amount Range inputs
    const minAmountInput = qs("#pay-filter-min-amount", this.container);
    const maxAmountInput = qs("#pay-filter-max-amount", this.container);
    let amountTimer = null;
    const handleAmountChange = () => {
      clearTimeout(amountTimer);
      amountTimer = setTimeout(() => {
        this.filterState.minAmount = minAmountInput ? minAmountInput.value : "";
        this.filterState.maxAmount = maxAmountInput ? maxAmountInput.value : "";
        this.mount(stateStore.state);
      }, 300);
    };
    if (minAmountInput) minAmountInput.oninput = handleAmountChange;
    if (maxAmountInput) maxAmountInput.oninput = handleAmountChange;

    // 10. Sort select
    const sortBySelect = qs("#pay-filter-sort-by", this.container);
    if (sortBySelect) {
      sortBySelect.onchange = (e) => {
        this.filterState.sortBy = e.target.value;
        this.mount(stateStore.state);
      };
    }

    const sortOrderSelect = qs("#pay-filter-sort-order", this.container);
    if (sortOrderSelect) {
      sortOrderSelect.onchange = (e) => {
        this.filterState.sortOrder = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 11. Filter Chips remove click
    qsa("[data-clear-key]", this.container).forEach(chip => {
      chip.onclick = () => {
        const key = chip.dataset.clearKey;
        if (key === 'dateRange') {
          this.filterState.fromDate = '';
          this.filterState.toDate = '';
          this.filterState.datePreset = 'all';
        } else if (key === 'amountRange') {
          this.filterState.minAmount = '';
          this.filterState.maxAmount = '';
        } else if (key in this.filterState) {
          this.filterState[key] = this.defaultFilterState[key];
        }
        this.mount(stateStore.state);
      };
    });

    // 12. Nút Thêm mới từng loại chứng từ
    const addPtBtn = qs("#btn-add-receipt-cash", this.container);
    if (addPtBtn) addPtBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.RECEIPT, PAYMENT_METHODS.CASH);

    const addUntBtn = qs("#btn-add-receipt-bank", this.container);
    if (addUntBtn) addUntBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.RECEIPT, PAYMENT_METHODS.BANK_TRANSFER);

    const addPcBtn = qs("#btn-add-payment-cash", this.container);
    if (addPcBtn) addPcBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.PAYMENT, PAYMENT_METHODS.CASH);

    const addUncBtn = qs("#btn-add-payment-bank", this.container);
    if (addUncBtn) addUncBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.PAYMENT, PAYMENT_METHODS.BANK_TRANSFER);

    // 13. In chứng từ
    qsa(".btn-print-voucher", this.container).forEach(btn => {
      btn.onclick = () => {
        const pay = stateStore.state.payments.find(p => p.id === btn.dataset.id);
        if (!pay) return;

        const partner = stateStore.state.partners.find(p => p.id === pay.partnerId) || { name: pay.partnerName };
        const settings = stateStore.state.settings || {};
        const vType = pay.voucherType || getVoucherType(pay.type, pay.paymentMethod);

        let htmlContent = '';
        let title = '';

        if (vType === VOUCHER_TYPES.RECEIPT_CASH) {
          title = `In Phiếu Thu (${pay.paymentNumber})`;
          htmlContent = VoucherTemplates.renderReceiptCashHTML(pay, settings, partner);
        } else if (vType === VOUCHER_TYPES.RECEIPT_BANK) {
          title = `In Ủy Nhiệm Thu (${pay.paymentNumber})`;
          htmlContent = VoucherTemplates.renderReceiptBankUNT_HTML(pay, settings, partner);
        } else if (vType === VOUCHER_TYPES.PAYMENT_CASH) {
          title = `In Phiếu Chi (${pay.paymentNumber})`;
          htmlContent = VoucherTemplates.renderPaymentCashHTML(pay, settings, partner);
        } else {
          title = `In Ủy Nhiệm Chi Ngân Hàng (${pay.paymentNumber})`;
          htmlContent = VoucherTemplates.renderPaymentBankUNC_HTML(pay, settings, partner);
        }

        VoucherTemplates.openPreviewModal({
          title,
          htmlContent,
          printTitle: `${pay.paymentNumber}_${pay.partnerName || 'Chung_Tu'}`
        });
      };
    });

    // 14. Xóa / Hủy chứng từ
    qsa(".btn-delete-payment", this.container).forEach(btn => {
      btn.onclick = () => {
        const pay = stateStore.state.payments.find(p => p.id === btn.dataset.id);
        if (!pay) return;
        if (confirm(`Bạn có chắc muốn hủy chứng từ ${pay.paymentNumber}? Các hóa đơn liên quan sẽ được hoàn nợ tự động.`)) {
          try {
            stateStore.deletePayment(pay.id);
            Toast.success("Đã hủy chứng từ thanh toán và khôi phục số dư nợ!");
          } catch (err) {
            Toast.error(err.message);
          }
        }
      };
    });
  }

  showPaymentModal(initialType = PAYMENT_TYPES.RECEIPT, initialMethod = PAYMENT_METHODS.BANK_TRANSFER) {
    const partners = stateStore.state.partners;

    if (partners.length === 0) {
      Toast.warning("Chưa có danh sách đối tác!");
      return;
    }

    const todayStr = toInputDateFormat(new Date());

    const getFormMeta = (type, method) => {
      const isReceipt = type === PAYMENT_TYPES.RECEIPT;
      const isCash = method === PAYMENT_METHODS.CASH;
      const vType = getVoucherType(type, method);
      const prefix = VOUCHER_TYPE_PREFIXES[vType] || 'CT';
      const defaultNumber = `${prefix}-${Date.now().toString().slice(-6)}`;
      const label = VOUCHER_TYPE_LABELS[vType];

      return { isReceipt, isCash, vType, prefix, defaultNumber, label };
    };

    const initialMeta = getFormMeta(initialType, initialMethod);

    const bodyHtml = `
      <form id="payment-form">
        <!-- Phân loại chứng từ -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Nghiệp Vụ <span class="required">*</span></label>
            <select class="form-select" id="pay-type-select">
              <option value="${PAYMENT_TYPES.RECEIPT}" ${initialMeta.isReceipt ? 'selected' : ''}>Thu tiền (Khách hàng trả nợ)</option>
              <option value="${PAYMENT_TYPES.PAYMENT}" ${!initialMeta.isReceipt ? 'selected' : ''}>Chi tiền (Thanh toán cho NCC)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Phương Thức Thanh Toán <span class="required">*</span></label>
            <select class="form-select" id="pay-method-select">
              <option value="${PAYMENT_METHODS.BANK_TRANSFER}" ${!initialMeta.isCash ? 'selected' : ''}>🏦 Chuyển khoản ngân hàng</option>
              <option value="${PAYMENT_METHODS.CASH}" ${initialMeta.isCash ? 'selected' : ''}>💵 Tiền mặt tại quỹ</option>
            </select>
          </div>
        </div>

        <div style="background: var(--bg-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-3); border-left: 4px solid var(--primary-500);">
          <div style="font-size: 0.85rem; font-weight: 700;" id="voucher-name-banner">
            Loại chứng từ: <span style="color: var(--primary-700);">${initialMeta.label}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Số Chứng Từ <span class="required">*</span></label>
            <input type="text" class="form-control font-mono font-bold" id="pay-number" required value="${initialMeta.defaultNumber}">
          </div>

          <div class="form-group">
            <label class="form-label">Ngày Chứng Từ <span class="required">*</span></label>
            <input type="date" class="form-control" id="pay-date" value="${todayStr}" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Đối Tác Thanh Toán <span class="required">*</span></label>
          <select class="form-select" id="pay-partner">
            ${partners.map(p => `
              <option value="${p.id}">
                ${escapeHtml(p.name)} (${p.code || p.id}) - Còn nợ: ${formatCurrency(initialMeta.isReceipt ? p.totalReceivable : p.totalPayable)}
              </option>
            `).join("")}
          </select>
        </div>

        <!-- Thông tin Tài khoản Ngân hàng (Nếu chuyển khoản) -->
        <div id="bank-info-group" style="${initialMeta.isCash ? 'display: none;' : ''}">
          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label">Tên Ngân Hàng Thụ Hưởng / Giao Dịch</label>
              <input type="text" class="form-control" id="pay-bank-name" placeholder="VD: Vietcombank, BIDV, Techcombank...">
            </div>
            <div class="form-group">
              <label class="form-label">Số Tài Khoản</label>
              <input type="text" class="form-control font-mono" id="pay-bank-account" placeholder="VD: 001100...">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Số Tiền Thanh Toán (VNĐ) <span class="required">*</span></label>
          <div class="input-group">
            <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="pay-amount" value="" placeholder="0" required>
            <span class="input-group-text">VNĐ</span>
          </div>
          <div class="currency-preview-text" id="pay-amount-preview"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Nội Dung / Diễn Giải</label>
          <input type="text" class="form-control" id="pay-notes" placeholder="VD: Thanh toán công nợ tiền hàng đợt 1">
        </div>

        <div style="background: var(--bg-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); font-size: 0.8rem; color: var(--text-muted);">
          <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle;"></i>
          Hệ thống sẽ <b>tự động cấn trừ (FIFO)</b> vào các hóa đơn còn nợ cũ nhất của đối tác này.
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn ${initialMeta.isReceipt ? 'btn-success' : 'btn-primary'}" id="btn-save-payment">Ghi Nhận & Lập Chứng Từ</button>
    `;

    Modal.open({
      title: `Lập ${initialMeta.label}`,
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        const typeSelect = qs("#pay-type-select", body);
        const methodSelect = qs("#pay-method-select", body);
        const numberInput = qs("#pay-number", body);
        const bannerEl = qs("#voucher-name-banner", body);
        const bankGroup = qs("#bank-info-group", body);
        const partnerSelect = qs("#pay-partner", body);
        const saveBtn = qs("#btn-save-payment", footer);

        const updateFormState = () => {
          const type = typeSelect.value;
          const method = methodSelect.value;
          const meta = getFormMeta(type, method);

          // Update banner
          bannerEl.innerHTML = `Loại chứng từ: <span style="color: var(--primary-700);">${meta.label}</span>`;
          
          // Update number if user hasn't heavily modified it
          numberInput.value = meta.defaultNumber;

          // Toggle bank group
          bankGroup.style.display = meta.isCash ? "none" : "";

          // Update partner option labels
          const pOpts = partnerSelect.querySelectorAll("option");
          pOpts.forEach(opt => {
            const p = partners.find(item => item.id === opt.value);
            if (p) {
              const debt = meta.isReceipt ? p.totalReceivable : p.totalPayable;
              opt.textContent = `${p.name} (${p.code || p.id}) - Còn nợ: ${formatCurrency(debt)}`;
            }
          });

          // Update save button style & text
          saveBtn.className = `btn ${meta.isReceipt ? 'btn-success' : 'btn-primary'}`;
          saveBtn.textContent = `Lập ${meta.prefix} & Ghi Nhận`;
        };

        typeSelect.onchange = updateFormState;
        methodSelect.onchange = updateFormState;

        // Auto load partner bank if available
        partnerSelect.onchange = () => {
          const p = partners.find(item => item.id === partnerSelect.value);
          if (p && !qs("#pay-bank-name", body).value) {
            if (p.bankName) qs("#pay-bank-name", body).value = p.bankName;
            if (p.bankAccount) qs("#pay-bank-account", body).value = p.bankAccount;
          }
        };

        saveBtn.onclick = () => {
          const type = typeSelect.value;
          const method = methodSelect.value;
          const isReceipt = type === PAYMENT_TYPES.RECEIPT;
          const invoiceType = isReceipt ? INVOICE_TYPES.RECEIVABLE : INVOICE_TYPES.PAYABLE;
          const partnerId = partnerSelect.value;
          const selectedPartner = partners.find(p => p.id === partnerId);
          const amount = parseCurrency(qs("#pay-amount", body).value);
          const vType = getVoucherType(type, method);

          if (amount <= 0) {
            Toast.warning("Số tiền thanh toán phải lớn hơn 0!");
            return;
          }

          // Tự động phân bổ vào các hóa đơn còn nợ theo FIFO
          const allocations = autoAllocatePaymentFIFO(
            partnerId,
            amount,
            invoiceType,
            stateStore.state.invoices
          );

          const paymentData = {
            paymentNumber: numberInput.value.trim(),
            type,
            paymentMethod: method,
            voucherType: vType,
            partnerId,
            partnerName: selectedPartner ? selectedPartner.name : "",
            paymentDate: qs("#pay-date", body).value,
            bankName: qs("#pay-bank-name", body)?.value?.trim() || "",
            bankAccount: qs("#pay-bank-account", body)?.value?.trim() || "",
            amount,
            notes: qs("#pay-notes", body).value.trim(),
            allocations
          };

          const newPayment = stateStore.addPayment(paymentData);
          Toast.success(`Đã lập ${VOUCHER_TYPE_LABELS[vType]} thành công!`);
          Modal.close();

          // Hỏi có muốn in ngay không
          setTimeout(() => {
            const partnerObj = selectedPartner || { name: paymentData.partnerName };
            const settings = stateStore.state.settings || {};
            let printHtml = '';
            if (vType === VOUCHER_TYPES.RECEIPT_CASH) printHtml = VoucherTemplates.renderReceiptCashHTML(newPayment, settings, partnerObj);
            else if (vType === VOUCHER_TYPES.RECEIPT_BANK) printHtml = VoucherTemplates.renderReceiptBankUNT_HTML(newPayment, settings, partnerObj);
            else if (vType === VOUCHER_TYPES.PAYMENT_CASH) printHtml = VoucherTemplates.renderPaymentCashHTML(newPayment, settings, partnerObj);
            else printHtml = VoucherTemplates.renderPaymentBankUNC_HTML(newPayment, settings, partnerObj);

            VoucherTemplates.openPreviewModal({
              title: `In Chứng Từ ${newPayment.paymentNumber}`,
              htmlContent: printHtml,
              printTitle: `${newPayment.paymentNumber}_${newPayment.partnerName}`
            });
          }, 300);
        };
      }
    });
  }
}
