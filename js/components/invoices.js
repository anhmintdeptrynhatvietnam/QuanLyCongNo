/**
 * INVOICES VIEW - QUẢN LÝ CÔNG NỢ
 * Quản lý hóa đơn bán hàng & mua hàng phát sinh nợ, theo dõi hạn nợ và trạng thái thanh toán.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { ExportService } from '../services/export-service.js';
import { formatCurrency, formatDate, renderInvoiceStatusBadge, toInputDateFormat, parseCurrency, formatCurrencyNumber } from '../utils/formatters.js';
import { INVOICE_TYPES, INVOICE_STATUS, PAYMENT_METHODS, getVoucherType, VOUCHER_TYPE_LABELS, VOUCHER_TYPE_PREFIXES } from '../config.js';
import { qs, qsa, escapeHtml, refreshLucideIcons } from '../utils/dom.js';
import { isDateInRange, isAmountInRange, countActiveFilters, sortDataList, getPresetDateRange, DATE_PRESETS } from '../utils/filter-helpers.js';

export class InvoicesView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.defaultFilterState = {
      statusTab: "ALL",
      type: "ALL",
      partnerId: "ALL",
      paymentMethod: "ALL",
      dateType: "issueDate", // "issueDate" | "dueDate"
      datePreset: "all",
      fromDate: "",
      toDate: "",
      minAmount: "",
      maxAmount: "",
      sortBy: "issueDate",
      sortOrder: "desc",
      searchQuery: "",
      isAdvancedOpen: false
    };
    this.filterState = { ...this.defaultFilterState };
  }

  render(state) {
    let filteredInvoices = state.invoices || [];

    // 1. Lọc theo Tab trạng thái
    if (this.filterState.statusTab !== "ALL") {
      filteredInvoices = filteredInvoices.filter(inv => inv.status === this.filterState.statusTab);
    }

    // 2. Lọc theo Loại (Phải thu / Phải trả)
    if (this.filterState.type !== "ALL") {
      filteredInvoices = filteredInvoices.filter(inv => inv.type === this.filterState.type);
    }

    // 3. Lọc theo Đối tác
    if (this.filterState.partnerId !== "ALL") {
      filteredInvoices = filteredInvoices.filter(inv => inv.partnerId === this.filterState.partnerId);
    }

    // 4. Lọc theo Hình thức thanh toán
    if (this.filterState.paymentMethod !== "ALL") {
      filteredInvoices = filteredInvoices.filter(inv => inv.paymentMethod === this.filterState.paymentMethod);
    }

    // 5. Lọc theo Khoảng ngày (Ngày phát sinh hoặc Ngày hạn nợ)
    if (this.filterState.fromDate || this.filterState.toDate) {
      filteredInvoices = filteredInvoices.filter(inv => {
        const targetDate = this.filterState.dateType === "dueDate" ? inv.dueDate : inv.issueDate;
        return isDateInRange(targetDate, this.filterState.fromDate, this.filterState.toDate);
      });
    }

    // 6. Lọc theo Khoảng số tiền (Tổng tiền hóa đơn)
    if (this.filterState.minAmount !== "" || this.filterState.maxAmount !== "") {
      filteredInvoices = filteredInvoices.filter(inv =>
        isAmountInRange(inv.totalAmount || 0, this.filterState.minAmount, this.filterState.maxAmount)
      );
    }

    // 7. Lọc theo tìm kiếm
    const effectiveSearch = (this.filterState.searchQuery || state.searchQuery || "").trim().toLowerCase();
    if (effectiveSearch) {
      filteredInvoices = filteredInvoices.filter(inv =>
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(effectiveSearch)) ||
        (inv.partnerName && inv.partnerName.toLowerCase().includes(effectiveSearch)) ||
        (inv.itemName && inv.itemName.toLowerCase().includes(effectiveSearch)) ||
        (inv.title && inv.title.toLowerCase().includes(effectiveSearch)) ||
        (inv.notes && inv.notes.toLowerCase().includes(effectiveSearch))
      );
    }

    // 8. Sắp xếp danh sách
    if (this.filterState.sortBy === "remainingAmount") {
      filteredInvoices = [...filteredInvoices].sort((a, b) => {
        const remA = Math.max(0, (Number(a.totalAmount) || 0) - (Number(a.paidAmount) || 0));
        const remB = Math.max(0, (Number(b.totalAmount) || 0) - (Number(b.paidAmount) || 0));
        return this.filterState.sortOrder === "desc" ? remB - remA : remA - remB;
      });
    } else {
      filteredInvoices = sortDataList(filteredInvoices, this.filterState.sortBy, this.filterState.sortOrder);
    }

    const activeFilterCount = countActiveFilters(this.filterState, this.defaultFilterState);

    const totalCount = state.invoices.length;
    const overdueCount = state.invoices.filter(inv => inv.status === INVOICE_STATUS.OVERDUE).length;
    const unpaidCount = state.invoices.filter(inv => inv.status === INVOICE_STATUS.UNPAID).length;
    const partialCount = state.invoices.filter(inv => inv.status === INVOICE_STATUS.PARTIAL).length;
    const paidCount = state.invoices.filter(inv => inv.status === INVOICE_STATUS.PAID).length;

    const selectedPartner = state.partners.find(p => p.id === this.filterState.partnerId);

    return `
      <!-- Action Header & Tabs -->
      <div class="tabs-nav">
        <button class="tab-btn ${this.filterState.statusTab === 'ALL' ? 'active' : ''}" data-status-tab="ALL">
          Tất Cả (${totalCount})
        </button>
        <button class="tab-btn ${this.filterState.statusTab === INVOICE_STATUS.OVERDUE ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.OVERDUE}">
          Quá Hạn <span class="badge badge-overdue" style="font-size: 0.7rem;">${overdueCount}</span>
        </button>
        <button class="tab-btn ${this.filterState.statusTab === INVOICE_STATUS.UNPAID ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.UNPAID}">
          Chưa Thanh Toán (${unpaidCount})
        </button>
        <button class="tab-btn ${this.filterState.statusTab === INVOICE_STATUS.PARTIAL ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.PARTIAL}">
          Trả Một Phần (${partialCount})
        </button>
        <button class="tab-btn ${this.filterState.statusTab === INVOICE_STATUS.PAID ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.PAID}">
          Đã Hoàn Tất (${paidCount})
        </button>
      </div>

      <!-- Modern Filter Card -->
      <div class="filter-card">
        <div class="filter-toolbar">
          <div class="filter-left">
            <!-- Loại Hóa Đơn Quick Select -->
            <select class="form-select" id="invoice-filter-type" style="height: 34px; width: 175px; font-size: 0.8125rem;">
              <option value="ALL" ${this.filterState.type === 'ALL' ? 'selected' : ''}>Tất cả loại chứng từ</option>
              <option value="${INVOICE_TYPES.RECEIVABLE}" ${this.filterState.type === INVOICE_TYPES.RECEIVABLE ? 'selected' : ''}>Phải Thu (Bán hàng)</option>
              <option value="${INVOICE_TYPES.PAYABLE}" ${this.filterState.type === INVOICE_TYPES.PAYABLE ? 'selected' : ''}>Phải Trả (Mua hàng)</option>
            </select>

            <!-- Search box in toolbar -->
            <div class="filter-search-box">
              <i data-lucide="search"></i>
              <input type="text" class="filter-search-input" id="invoice-filter-search" placeholder="Tìm số HĐ, đối tác, hàng hóa..." value="${escapeHtml(this.filterState.searchQuery)}">
            </div>
          </div>

          <div class="filter-right">
            <!-- Nút bật/tắt bộ lọc nâng cao -->
            <button class="filter-btn-toggle ${this.filterState.isAdvancedOpen ? 'active' : ''}" id="btn-toggle-invoice-filter">
              <i data-lucide="sliders-horizontal"></i>
              <span>Bộ Lọc Nâng Cao</span>
              ${activeFilterCount > 0 ? `<span class="filter-badge-count">${activeFilterCount}</span>` : ''}
            </button>

            ${activeFilterCount > 0 ? `
              <button class="filter-btn-reset" id="btn-reset-invoice-filter" title="Xóa tất cả bộ lọc về mặc định">
                <i data-lucide="rotate-ccw"></i>
                <span>Đặt Lại</span>
              </button>
            ` : ''}

            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" id="btn-import-invoices-excel" title="Nhập hóa đơn / công nợ hàng loạt từ file Excel">
                <i data-lucide="file-spreadsheet"></i>
                <span>Nhập Excel</span>
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-export-invoices">
                <i data-lucide="download"></i>
                <span>Xuất Excel</span>
              </button>
              <button class="btn btn-primary btn-sm" id="btn-add-invoice">
                <i data-lucide="plus-circle"></i>
                <span>Tạo Hóa Đơn Mới</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Khung Bộ Lọc Nâng Cao (Collapsible Drawer) -->
        <div class="filter-drawer ${this.filterState.isAdvancedOpen ? 'open' : ''}" id="invoice-filter-drawer">
          <div class="filter-grid">
            <!-- 1. Chọn Đối tác -->
            <div class="filter-field">
              <label class="filter-field-label">Đối Tác (Khách hàng / NCC)</label>
              <select class="filter-field-control" id="invoice-filter-partner">
                <option value="ALL">-- Tất cả đối tác --</option>
                ${state.partners.map(p => `
                  <option value="${p.id}" ${this.filterState.partnerId === p.id ? 'selected' : ''}>
                    ${escapeHtml(p.name)} (${p.code || p.id})
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- 2. Hình thức thanh toán -->
            <div class="filter-field">
              <label class="filter-field-label">Hình Thức Thanh Toán</label>
              <select class="filter-field-control" id="invoice-filter-method">
                <option value="ALL" ${this.filterState.paymentMethod === 'ALL' ? 'selected' : ''}>Tất cả hình thức</option>
                <option value="${PAYMENT_METHODS.CASH}" ${this.filterState.paymentMethod === PAYMENT_METHODS.CASH ? 'selected' : ''}>Tiền mặt (Quỹ)</option>
                <option value="${PAYMENT_METHODS.BANK}" ${this.filterState.paymentMethod === PAYMENT_METHODS.BANK ? 'selected' : ''}>Chuyển khoản (Ngân hàng)</option>
              </select>
            </div>

            <!-- 3. Lọc theo Thời gian (Date Range) -->
            <div class="filter-field" style="grid-column: span 2;">
              <div class="flex items-center justify-between">
                <label class="filter-field-label">Khoảng Thời Gian</label>
                <div class="flex items-center gap-2">
                  <label style="font-size: 0.725rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <input type="radio" name="invoice-date-type" value="issueDate" ${this.filterState.dateType === 'issueDate' ? 'checked' : ''}> Ngày phát sinh
                  </label>
                  <label style="font-size: 0.725rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <input type="radio" name="invoice-date-type" value="dueDate" ${this.filterState.dateType === 'dueDate' ? 'checked' : ''}> Hạn nợ
                  </label>
                </div>
              </div>

              <div class="filter-date-group">
                <input type="date" class="filter-field-control filter-date-input" id="invoice-filter-from-date" value="${this.filterState.fromDate}">
                <span style="color: var(--text-muted);">-</span>
                <input type="date" class="filter-field-control filter-date-input" id="invoice-filter-to-date" value="${this.filterState.toDate}">
              </div>

              <!-- Quick Date Presets -->
              <div class="date-presets-row">
                ${DATE_PRESETS.map(p => `
                  <button type="button" class="preset-btn ${this.filterState.datePreset === p.id ? 'active' : ''}" data-invoice-preset="${p.id}">
                    ${p.label}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- 4. Khoảng số tiền (Min - Max) -->
            <div class="filter-field">
              <label class="filter-field-label">Tổng Tiền Hóa Đơn (VNĐ)</label>
              <div style="display: flex; gap: var(--space-2); align-items: center;">
                <input type="number" class="filter-field-control" id="invoice-filter-min-amount" placeholder="Tối thiểu" value="${this.filterState.minAmount}">
                <span style="color: var(--text-muted);">-</span>
                <input type="number" class="filter-field-control" id="invoice-filter-max-amount" placeholder="Tối đa" value="${this.filterState.maxAmount}">
              </div>
            </div>

            <!-- 5. Tiêu chí sắp xếp -->
            <div class="filter-field">
              <label class="filter-field-label">Sắp Xếp Theo</label>
              <select class="filter-field-control" id="invoice-filter-sort-by">
                <option value="issueDate" ${this.filterState.sortBy === 'issueDate' ? 'selected' : ''}>Ngày phát sinh</option>
                <option value="dueDate" ${this.filterState.sortBy === 'dueDate' ? 'selected' : ''}>Hạn thanh toán</option>
                <option value="totalAmount" ${this.filterState.sortBy === 'totalAmount' ? 'selected' : ''}>Tổng tiền hóa đơn</option>
                <option value="remainingAmount" ${this.filterState.sortBy === 'remainingAmount' ? 'selected' : ''}>Số tiền còn nợ</option>
                <option value="invoiceNumber" ${this.filterState.sortBy === 'invoiceNumber' ? 'selected' : ''}>Số hóa đơn</option>
              </select>
            </div>

            <!-- 6. Thứ tự sắp xếp -->
            <div class="filter-field">
              <label class="filter-field-label">Thứ Tự</label>
              <select class="filter-field-control" id="invoice-filter-sort-order">
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
            ${this.filterState.statusTab !== 'ALL' ? `
              <span class="filter-chip">
                Trạng thái: ${
                  this.filterState.statusTab === INVOICE_STATUS.OVERDUE ? 'Quá Hạn' :
                  this.filterState.statusTab === INVOICE_STATUS.UNPAID ? 'Chưa Thanh Toán' :
                  this.filterState.statusTab === INVOICE_STATUS.PARTIAL ? 'Trả Một Phần' : 'Đã Hoàn Tất'
                }
                <span class="filter-chip-remove" data-clear-key="statusTab">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.type !== 'ALL' ? `
              <span class="filter-chip">
                Loại: ${this.filterState.type === INVOICE_TYPES.RECEIVABLE ? 'Phải Thu (Bán hàng)' : 'Phải Trả (Mua hàng)'}
                <span class="filter-chip-remove" data-clear-key="type">&times;</span>
              </span>
            ` : ''}
            ${selectedPartner ? `
              <span class="filter-chip">
                Đối tác: ${escapeHtml(selectedPartner.name)}
                <span class="filter-chip-remove" data-clear-key="partnerId">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.paymentMethod !== 'ALL' ? `
              <span class="filter-chip">
                Hình thức: ${this.filterState.paymentMethod === PAYMENT_METHODS.CASH ? 'Tiền mặt' : 'Chuyển khoản'}
                <span class="filter-chip-remove" data-clear-key="paymentMethod">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.fromDate || this.filterState.toDate ? `
              <span class="filter-chip">
                ${this.filterState.dateType === 'dueDate' ? 'Hạn nợ' : 'Ngày lập'}: ${formatDate(this.filterState.fromDate) || '...'} → ${formatDate(this.filterState.toDate) || '...'}
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
              Hiển thị <b>${filteredInvoices.length}</b> / ${state.invoices.length} hóa đơn
            </span>
          </div>
        ` : ''}
      </div>

      <!-- Invoices Data Table -->
      <div class="table-container">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Số Hóa Đơn</th>
                <th>Khách Hàng / Nhà Cung Cấp</th>
                <th>Ngày Phát Sinh</th>
                <th>Hạn Thanh Toán</th>
                <th class="text-right">Chưa Thuế</th>
                <th class="text-right">Thuế VAT</th>
                <th class="text-right">Tổng Tiền</th>
                <th class="text-right">Đã Trả</th>
                <th class="text-right">Còn Nợ</th>
                <th class="text-center">Hình Thức</th>
                <th>Trạng Thái</th>
                <th class="text-center" style="width: 120px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredInvoices.length === 0 ? `
                <tr>
                  <td colspan="12" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <i data-lucide="file-text" style="width: 36px; height: 36px; margin-bottom: 8px; color: var(--text-muted); opacity: 0.5;"></i>
                    <p>Không có hóa đơn nào phù hợp với bộ lọc.</p>
                    ${activeFilterCount > 0 ? `
                      <button class="btn btn-secondary btn-sm" id="btn-reset-invoice-empty" style="margin-top: 8px;">
                        <i data-lucide="rotate-ccw"></i>
                        <span>Xóa Bộ Lọc</span>
                      </button>
                    ` : ''}
                  </td>
                </tr>
              ` : filteredInvoices.map(inv => {
                const preTax = inv.preTaxAmount || (inv.totalAmount - (inv.taxAmount || 0));
                const tax = inv.taxAmount || 0;
                const remaining = Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
                const isCash = inv.paymentMethod === PAYMENT_METHODS.CASH;

                return `
                  <tr>
                    <td>
                      <div class="font-mono font-bold" style="color: var(--primary-600);">${escapeHtml(inv.invoiceNumber)}</div>
                      <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-top: 2px;">
                        ${escapeHtml(inv.itemName || inv.title || "Hàng hóa / Dịch vụ")}
                      </div>
                      <div style="font-size: 0.7rem; color: var(--text-muted);">${inv.type === INVOICE_TYPES.RECEIVABLE ? 'Bán ra (Phải thu)' : 'Mua vào (Phải trả)'}</div>
                    </td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(inv.partnerName)}</div>
                      ${inv.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(inv.notes)}</div>` : ''}
                    </td>
                    <td>${formatDate(inv.issueDate)}</td>
                    <td>
                      <div class="font-mono ${inv.status === INVOICE_STATUS.OVERDUE ? 'text-danger font-bold' : ''}">
                        ${formatDate(inv.dueDate)}
                      </div>
                    </td>
                    <td class="text-right font-mono">${formatCurrency(preTax, false)}</td>
                    <td class="text-right font-mono" style="color: #64748b;">${tax > 0 ? formatCurrency(tax, false) : '-'}</td>
                    <td class="text-right font-mono font-bold">${formatCurrency(inv.totalAmount)}</td>
                    <td class="text-right font-mono text-success">${inv.paidAmount > 0 ? formatCurrency(inv.paidAmount) : '-'}</td>
                    <td class="text-right font-mono font-bold ${remaining > 0 ? (inv.type === INVOICE_TYPES.RECEIVABLE ? 'text-primary' : 'text-warning') : ''}">
                      ${formatCurrency(remaining)}
                    </td>
                    <td class="text-center">
                      ${isCash 
                        ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #b45309; font-size: 0.72rem; font-weight: 600;" title="Thanh toán tiền mặt tại quỹ"><i data-lucide="banknote" style="width: 12px; height: 12px;"></i> Tiền mặt</span>`
                        : `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #1d4ed8; font-size: 0.72rem; font-weight: 600;" title="Chuyển khoản qua ngân hàng"><i data-lucide="landmark" style="width: 12px; height: 12px;"></i> Chuyển khoản</span>`
                      }
                    </td>
                    <td>${renderInvoiceStatusBadge(inv.status)}</td>
                    <td class="text-center">
                      <div class="flex justify-center gap-1">
                        ${remaining > 0 ? `
                          <button class="btn btn-icon btn-sm btn-quick-pay text-success" data-id="${inv.id}" title="Thu/Chi nhanh cho hóa đơn này">
                            <i data-lucide="badge-dollar-sign"></i>
                          </button>
                        ` : ''}
                        <button class="btn btn-icon btn-sm btn-edit-invoice" data-id="${inv.id}" title="Sửa hóa đơn">
                          <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn btn-icon btn-sm btn-delete-invoice text-danger" data-id="${inv.id}" title="Xóa hóa đơn">
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
    // 1. Tab status switch
    qsa("[data-status-tab]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.filterState.statusTab = btn.dataset.statusTab;
        this.mount(stateStore.state);
      };
    });

    // 2. Select type filter
    const selectType = qs("#invoice-filter-type", this.container);
    if (selectType) {
      selectType.onchange = (e) => {
        this.filterState.type = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 3. Search input (debounced)
    const searchInput = qs("#invoice-filter-search", this.container);
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

    // 4. Toggle Drawer
    const toggleBtn = qs("#btn-toggle-invoice-filter", this.container);
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        this.filterState.isAdvancedOpen = !this.filterState.isAdvancedOpen;
        this.mount(stateStore.state);
      };
    }

    // 5. Reset Button
    const resetBtn = qs("#btn-reset-invoice-filter", this.container) || qs("#btn-reset-invoice-empty", this.container);
    if (resetBtn) {
      resetBtn.onclick = () => {
        this.filterState = { ...this.defaultFilterState, isAdvancedOpen: this.filterState.isAdvancedOpen };
        this.mount(stateStore.state);
        Toast.info("Đã đặt lại bộ lọc hóa đơn");
      };
    }

    // 6. Partner filter
    const selectPartner = qs("#invoice-filter-partner", this.container);
    if (selectPartner) {
      selectPartner.onchange = (e) => {
        this.filterState.partnerId = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 7. Payment method filter
    const selectMethod = qs("#invoice-filter-method", this.container);
    if (selectMethod) {
      selectMethod.onchange = (e) => {
        this.filterState.paymentMethod = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 8. Date type radio
    qsa("input[name='invoice-date-type']", this.container).forEach(radio => {
      radio.onchange = (e) => {
        this.filterState.dateType = e.target.value;
        this.mount(stateStore.state);
      };
    });

    // 9. Date Range inputs
    const fromDateInput = qs("#invoice-filter-from-date", this.container);
    const toDateInput = qs("#invoice-filter-to-date", this.container);
    const handleDateChange = () => {
      this.filterState.fromDate = fromDateInput ? fromDateInput.value : "";
      this.filterState.toDate = toDateInput ? toDateInput.value : "";
      this.filterState.datePreset = "custom";
      this.mount(stateStore.state);
    };
    if (fromDateInput) fromDateInput.onchange = handleDateChange;
    if (toDateInput) toDateInput.onchange = handleDateChange;

    // 10. Date Presets buttons
    qsa("[data-invoice-preset]", this.container).forEach(btn => {
      btn.onclick = () => {
        const preset = btn.dataset.invoicePreset;
        this.filterState.datePreset = preset;
        const range = getPresetDateRange(preset);
        this.filterState.fromDate = range.fromDate;
        this.filterState.toDate = range.toDate;
        this.mount(stateStore.state);
      };
    });

    // 11. Amount Range inputs
    const minAmountInput = qs("#invoice-filter-min-amount", this.container);
    const maxAmountInput = qs("#invoice-filter-max-amount", this.container);
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

    // 12. Sort select
    const sortBySelect = qs("#invoice-filter-sort-by", this.container);
    if (sortBySelect) {
      sortBySelect.onchange = (e) => {
        this.filterState.sortBy = e.target.value;
        this.mount(stateStore.state);
      };
    }

    const sortOrderSelect = qs("#invoice-filter-sort-order", this.container);
    if (sortOrderSelect) {
      sortOrderSelect.onchange = (e) => {
        this.filterState.sortOrder = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 13. Filter Chips remove click
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

    // 14. Import Invoices from Excel
    const importExcelBtn = qs("#btn-import-invoices-excel", this.container);
    if (importExcelBtn) {
      importExcelBtn.onclick = () => this.showImportExcelModal();
    }

    // 15. Export Excel
    const exportBtn = qs("#btn-export-invoices", this.container);
    if (exportBtn) {
      exportBtn.onclick = () => {
        ExportService.exportInvoicesToExcel(stateStore.state.invoices);
        Toast.success("Đã xuất file Excel công nợ thành công!");
      };
    }

    // 16. Add Invoice
    const addBtn = qs("#btn-add-invoice", this.container);
    if (addBtn) {
      addBtn.onclick = () => this.showInvoiceModal();
    }

    // 17. Quick pay button
    qsa(".btn-quick-pay", this.container).forEach(btn => {
      btn.onclick = () => {
        const inv = stateStore.state.invoices.find(i => i.id === btn.dataset.id);
        if (inv) this.showQuickPayModal(inv);
      };
    });

    // 18. Edit Invoice
    qsa(".btn-edit-invoice", this.container).forEach(btn => {
      btn.onclick = () => {
        const inv = stateStore.state.invoices.find(i => i.id === btn.dataset.id);
        if (inv) this.showInvoiceModal(inv);
      };
    });

    // 19. Delete Invoice
    qsa(".btn-delete-invoice", this.container).forEach(btn => {
      btn.onclick = () => {
        const inv = stateStore.state.invoices.find(i => i.id === btn.dataset.id);
        if (!inv) return;
        if (confirm(`Bạn có chắc muốn xóa hóa đơn ${inv.invoiceNumber}?`)) {
          try {
            stateStore.deleteInvoice(inv.id);
            Toast.success("Đã xóa hóa đơn thành công!");
          } catch (err) {
            Toast.error(err.message);
          }
        }
      };
    });
  }

  showImportExcelModal() {
    let parsedResult = null;

    const title = "Nhập Danh Sách Hóa Đơn & Nợ Phát Sinh Từ Excel";

    const bodyHtml = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        <!-- Phần 1: Khung Hướng Dẫn Các Bước -->
        <div class="excel-guide-container">
          <div class="excel-guide-step">
            <div class="step-badge">1</div>
            <div class="step-content">
              <div class="step-title">Tải File Mẫu</div>
              <div class="step-desc">Tải file Excel mẫu (.xlsx) định dạng sẵn các cột thông tin chuẩn kế toán.</div>
            </div>
          </div>
          <div class="excel-guide-step">
            <div class="step-badge">2</div>
            <div class="step-content">
              <div class="step-title">Điền Dữ Liệu</div>
              <div class="step-desc">Nhập danh sách hóa đơn vào file (Bắt buộc: <b>Số HĐ</b>, <b>Đối tác</b>, <b>Tổng tiền</b>).</div>
            </div>
          </div>
          <div class="excel-guide-step">
            <div class="step-badge">3</div>
            <div class="step-content">
              <div class="step-title">Tải Lên & Xem Trước</div>
              <div class="step-desc">Kéo thả file vào khung bên dưới, kiểm tra bảng xem trước rồi xác nhận nhập.</div>
            </div>
          </div>
        </div>

        <!-- Nút Tải Mẫu -->
        <div class="flex items-center justify-between" style="background: var(--bg-surface-subtle); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--border-main);">
          <div>
            <div style="font-weight: 600; font-size: 0.875rem;">Chưa có file mẫu chuẩn?</div>
            <div style="font-size: 0.775rem; color: var(--text-muted);">File mẫu chứa sẵn cấu trúc cột và 3 dòng ví dụ thực tế.</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-download-invoice-template">
            <i data-lucide="download"></i>
            <span>Tải File Excel Mẫu (.xlsx)</span>
          </button>
        </div>

        <!-- Khung Kéo Thả File (Dropzone) -->
        <input type="file" id="excel-invoice-file-input" accept=".xlsx, .xls, .csv" style="display: none;">
        <div class="excel-dropzone" id="excel-invoice-dropzone">
          <div id="invoice-dropzone-content">
            <i data-lucide="file-up" class="excel-dropzone-icon"></i>
            <div class="excel-dropzone-title">Kéo thả file Excel vào đây hoặc <span style="color: var(--primary-600); text-decoration: underline;">chọn từ máy tính</span></div>
            <div class="excel-dropzone-sub">Hỗ trợ định dạng .xlsx, .xls, .csv (Tối đa 5.000 dòng)</div>
          </div>
        </div>

        <!-- Khu vực Xem Trước Dữ Liệu (Preview Area) -->
        <div id="excel-invoice-preview-area" style="display: none;">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-primary" id="btn-confirm-import-invoices" disabled>
        <i data-lucide="check"></i>
        <span>Xác Nhận Nhập Hóa Đơn</span>
      </button>
    `;

    Modal.open({
      title,
      bodyHtml,
      footerHtml,
      size: "xl",
      onOpen: (body, footer) => {
        const downloadBtn = qs("#btn-download-invoice-template", body);
        const dropzone = qs("#excel-invoice-dropzone", body);
        const dropzoneContent = qs("#invoice-dropzone-content", body);
        const fileInput = qs("#excel-invoice-file-input", body);
        const previewArea = qs("#excel-invoice-preview-area", body);
        const confirmBtn = qs("#btn-confirm-import-invoices", footer);

        // Download template
        if (downloadBtn) {
          downloadBtn.onclick = () => {
            ExportService.generateInvoiceImportTemplate();
            Toast.info("Đang tải file Excel mẫu hóa đơn...");
          };
        }

        // Dropzone & File Input
        if (dropzone && fileInput) {
          dropzone.onclick = () => fileInput.click();

          dropzone.ondragover = (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
          };

          dropzone.ondragleave = () => {
            dropzone.classList.remove("dragover");
          };

          dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
            const files = e.dataTransfer.files;
            if (files.length > 0) {
              handleFile(files[0]);
            }
          };

          fileInput.onchange = (e) => {
            if (e.target.files.length > 0) {
              handleFile(e.target.files[0]);
              fileInput.value = "";
            }
          };
        }

        const handleFile = async (file) => {
          try {
            if (dropzoneContent) {
              dropzoneContent.innerHTML = `<div style="font-size: 0.9rem; font-weight: 600; color: var(--primary-600);"><i data-lucide="loader-2"></i> Đang đọc file "${escapeHtml(file.name)}"...</div>`;
              refreshLucideIcons();
            }

            parsedResult = await ExportService.parseInvoicesFromExcel(file, stateStore.state.invoices, stateStore.state.partners);
            const { invoices, summary } = parsedResult;

            if (summary.valid === 0) {
              Toast.warning("Không tìm thấy dòng dữ liệu hóa đơn hợp lệ nào trong file!");
            } else if (summary.dupCount > 0) {
              Toast.info(`Đã đọc ${summary.total} dòng: phát hiện ${summary.dupCount} hóa đơn bị trùng lặp.`);
            } else {
              Toast.success(`Đã đọc ${summary.total} dòng (${summary.valid} hợp lệ, không có dòng trùng)!`);
            }

            // Render preview table
            previewArea.style.display = "block";
            previewArea.innerHTML = `
              <!-- Thanh Thống Kê -->
              <div class="stat-summary-bar">
                <span class="stat-pill stat-pill-total">Tổng: <b>${summary.total}</b> dòng</span>
                <span class="stat-pill stat-pill-new"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Mới: <b>${summary.newCount}</b></span>
                ${summary.dupCount > 0 ? `
                  <span class="stat-pill stat-pill-dup"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Trùng: <b>${summary.dupCount}</b></span>
                ` : ''}
                ${summary.invalid > 0 ? `
                  <span class="stat-pill stat-pill-err"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Lỗi: <b>${summary.invalid}</b></span>
                ` : ''}
                ${summary.newPartnerCount > 0 ? `
                  <span class="stat-pill" style="background: rgba(59, 130, 246, 0.1); color: var(--primary-700);"><i data-lucide="user-plus" style="width: 12px; height: 12px;"></i> Đối tác mới: <b>${summary.newPartnerCount}</b></span>
                ` : ''}
              </div>

              <!-- Tự động tạo đối tác mới -->
              ${summary.newPartnerCount > 0 ? `
                <div style="margin-top: var(--space-3); padding: var(--space-3) var(--space-4); background: rgba(59, 130, 246, 0.05); border-radius: var(--radius-md); border: 1px solid rgba(59, 130, 246, 0.2);">
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.825rem; cursor: pointer; font-weight: 500; color: var(--text-main);">
                    <input type="checkbox" id="cb-auto-create-partners" checked style="cursor: pointer;">
                    <span>Tự động tạo mới <b>${summary.newPartnerCount} đối tác</b> vào danh bạ nếu chưa có trên hệ thống</span>
                  </label>
                </div>
              ` : ''}

              <!-- Tùy Chọn Xử Lý Trùng Lặp -->
              ${summary.dupCount > 0 ? `
                <div class="duplicate-options-box">
                  <div style="font-weight: 600; font-size: 0.85rem; color: #b45309; display: flex; align-items: center; gap: 6px;">
                    <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
                    <span>Phát hiện ${summary.dupCount} hóa đơn bị trùng số chứng từ. Vui lòng chọn phương án:</span>
                  </div>
                  <div class="duplicate-radio-row">
                    <label class="duplicate-radio-label">
                      <input type="radio" name="dup-mode" value="SKIP" checked>
                      <span>Bỏ qua dòng trùng (Chỉ thêm <b>${summary.newCount}</b> hóa đơn mới)</span>
                    </label>
                    <label class="duplicate-radio-label">
                      <input type="radio" name="dup-mode" value="UPDATE">
                      <span>Cập nhật đè thông tin hóa đơn đã có</span>
                    </label>
                    <label class="duplicate-radio-label">
                      <input type="radio" name="dup-mode" value="ALLOW">
                      <span>Vẫn thêm mới tất cả (${summary.valid} dòng)</span>
                    </label>
                  </div>
                </div>
              ` : ''}

              <div class="excel-preview-box">
                <div class="excel-preview-header">
                  <div style="font-weight: 600; font-size: 0.85rem;">
                    Bảng xem trước dữ liệu chi tiết
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    File: <b>${escapeHtml(file.name)}</b>
                  </div>
                </div>
                <div class="excel-preview-table-wrapper">
                  <table class="data-table" style="font-size: 0.8rem;">
                    <thead>
                      <tr>
                        <th style="width: 45px;">Dòng</th>
                        <th>Số Hóa Đơn</th>
                        <th>Đối Tác</th>
                        <th>Phân Loại</th>
                        <th>Ngày Lập / Hạn Nợ</th>
                        <th class="text-right">Chưa Thuế (VNĐ)</th>
                        <th class="text-right">Thuế VAT (VNĐ)</th>
                        <th class="text-right">Tổng Tiền (VNĐ)</th>
                        <th class="text-right">Đã Trả (VNĐ)</th>
                        <th class="text-center">Hình Thức</th>
                        <th>Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${invoices.map(inv => `
                        <tr style="${!inv.isValid ? 'background: rgba(239, 68, 68, 0.05);' : (inv.isDuplicate ? 'background: rgba(245, 158, 11, 0.05);' : '')}">
                          <td>${inv.rowIndex}</td>
                          <td>
                            <div class="font-mono" style="font-weight: 600; color: var(--primary-600);">${escapeHtml(inv.invoiceNumber || "(Trống)")}</div>
                          </td>
                          <td>
                            <div style="font-weight: 600;">${escapeHtml(inv.partnerName || "(Trống)")}</div>
                            ${inv.isNewPartner ? `
                              <span class="badge" style="font-size: 0.65rem; background: rgba(59, 130, 246, 0.1); color: var(--primary-600); padding: 1px 4px;">Đối tác mới</span>
                            ` : ''}
                          </td>
                          <td>
                            <span class="badge ${inv.type === 'RECEIVABLE' ? 'badge-customer' : 'badge-vendor'}" style="font-size: 0.7rem;">
                              ${inv.type === 'RECEIVABLE' ? 'Phải Thu' : 'Phải Trả'}
                            </span>
                          </td>
                          <td>
                            <div>${formatDate(inv.issueDate)}</div>
                            <div class="font-mono" style="font-size: 0.7rem; color: var(--text-muted);">Hạn: ${formatDate(inv.dueDate)}</div>
                          </td>
                          <td class="text-right font-mono">${formatCurrency(inv.preTaxAmount || (inv.totalAmount - (inv.taxAmount || 0)), false)}</td>
                          <td class="text-right font-mono" style="color: #64748b;">${inv.taxAmount > 0 ? formatCurrency(inv.taxAmount, false) : '-'}</td>
                          <td class="text-right font-mono font-bold">${formatCurrency(inv.totalAmount)}</td>
                          <td class="text-right font-mono text-success">${inv.paidAmount > 0 ? formatCurrency(inv.paidAmount) : "-"}</td>
                          <td class="text-center">
                            ${inv.paymentMethod === 'CASH'
                              ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #b45309; font-size: 0.7rem; font-weight: 600;">Tiền mặt</span>`
                              : `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #1d4ed8; font-size: 0.7rem; font-weight: 600;">Chuyển khoản</span>`
                            }
                          </td>
                          <td>
                            ${!inv.isValid ? `
                              <span class="validation-tag-err" title="${escapeHtml(inv.error)}"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> ${escapeHtml(inv.error)}</span>
                            ` : (inv.isDuplicate ? `
                              <span class="validation-tag-dup" title="${escapeHtml(inv.duplicateReason)}"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Trùng lặp</span>
                            ` : `
                              <span class="validation-tag-ok"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Hợp lệ</span>
                            `)}
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              </div>
            `;

            // Reset dropzone state
            if (dropzoneContent) {
              dropzoneContent.innerHTML = `
                <i data-lucide="file-check" class="excel-dropzone-icon" style="color: var(--success-600);"></i>
                <div class="excel-dropzone-title">Đã chọn: <b>${escapeHtml(file.name)}</b></div>
                <div class="excel-dropzone-sub">Bấm vào đây để chọn lại file khác</div>
              `;
              refreshLucideIcons();
            }

            // Function to update confirm button text based on duplicate mode
            const updateConfirmBtn = () => {
              const selectedMode = qs("input[name='dup-mode']:checked", previewArea)?.value || "SKIP";
              if (selectedMode === "SKIP") {
                if (summary.newCount > 0) {
                  confirmBtn.disabled = false;
                  confirmBtn.innerHTML = `<i data-lucide="upload"></i><span>Nhập ${summary.newCount} Hóa Đơn Mới (Bỏ qua ${summary.dupCount} dòng trùng)</span>`;
                } else {
                  confirmBtn.disabled = true;
                  confirmBtn.innerHTML = `<span>Tất cả dòng đều bị trùng lặp</span>`;
                }
              } else if (selectedMode === "UPDATE") {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Cập Nhật ${summary.dupCount} & Nhập ${summary.newCount} Mới</span>`;
              } else {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<i data-lucide="upload"></i><span>Nhập Toàn Bộ ${summary.valid} Hóa Đơn</span>`;
              }
              refreshLucideIcons();
            };

            // Listen to duplicate mode radio change
            qsa("input[name='dup-mode']", previewArea).forEach(radio => {
              radio.onchange = updateConfirmBtn;
            });

            updateConfirmBtn();
          } catch (err) {
            Toast.error(err.message);
            if (dropzoneContent) {
              dropzoneContent.innerHTML = `
                <i data-lucide="file-up" class="excel-dropzone-icon"></i>
                <div class="excel-dropzone-title">Kéo thả file Excel vào đây hoặc <span style="color: var(--primary-600); text-decoration: underline;">chọn từ máy tính</span></div>
                <div class="excel-dropzone-sub">Hỗ trợ định dạng .xlsx, .xls, .csv</div>
              `;
              refreshLucideIcons();
            }
          }
        };

        // Confirm import click
        if (confirmBtn) {
          confirmBtn.onclick = () => {
            if (!parsedResult || !parsedResult.invoices) return;
            const validInvoices = parsedResult.invoices.filter(i => i.isValid);
            if (validInvoices.length === 0) {
              Toast.warning("Không có hóa đơn hợp lệ nào để nhập!");
              return;
            }

            const selectedMode = qs("input[name='dup-mode']:checked", previewArea)?.value || "SKIP";
            const autoCreatePartners = qs("#cb-auto-create-partners", previewArea)?.checked !== false;

            const result = stateStore.addInvoicesBatch(validInvoices, selectedMode, autoCreatePartners);

            let msg = "";
            if (result.insertedCount > 0 && result.updatedCount > 0) {
              msg = `Đã thêm mới ${result.insertedCount} hóa đơn và cập nhật ${result.updatedCount} hóa đơn cũ!`;
            } else if (result.insertedCount > 0) {
              msg = `Đã nhập thành công ${result.insertedCount} hóa đơn vào hệ thống!`;
              if (result.skippedCount > 0) msg += ` (Đã bỏ qua ${result.skippedCount} dòng trùng)`;
            } else if (result.updatedCount > 0) {
              msg = `Đã cập nhật thông tin cho ${result.updatedCount} hóa đơn!`;
            } else {
              msg = `Không có hóa đơn mới nào được thêm (Đã bỏ qua ${result.skippedCount} dòng trùng).`;
            }

            if (result.createdPartnersCount > 0) {
              msg += ` Đã tự động tạo mới ${result.createdPartnersCount} đối tác.`;
            }

            Toast.success(msg);
            Modal.close();
          };
        }
      }
    });
  }

  showInvoiceModal(invoice = null) {
    const isEdit = !!invoice;
    const partners = stateStore.state.partners;

    if (partners.length === 0) {
      Toast.warning("Vui lòng tạo Khách hàng / Nhà cung cấp trước khi lập hóa đơn!");
      return;
    }

    const todayStr = toInputDateFormat(new Date());
    const defaultDueStr = toInputDateFormat(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const initialPreTax = invoice ? (invoice.preTaxAmount || (invoice.totalAmount - (invoice.taxAmount || 0))) : 0;
    const initialTax = invoice ? (invoice.taxAmount || 0) : 0;
    const initialTotal = invoice ? invoice.totalAmount : 0;
    const initialPaid = invoice ? (invoice.paidAmount || 0) : 0;
    const initialMethod = invoice ? (invoice.paymentMethod || PAYMENT_METHODS.BANK_TRANSFER) : PAYMENT_METHODS.BANK_TRANSFER;

    const bodyHtml = `
      <form id="invoice-form">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Loại Chứng Từ <span class="required">*</span></label>
            <select class="form-select" id="inv-type">
              <option value="${INVOICE_TYPES.RECEIVABLE}" ${invoice && invoice.type === INVOICE_TYPES.RECEIVABLE ? 'selected' : ''}>Phải Thu (Bán hàng cho nợ)</option>
              <option value="${INVOICE_TYPES.PAYABLE}" ${invoice && invoice.type === INVOICE_TYPES.PAYABLE ? 'selected' : ''}>Phải Trả (Mua hàng nợ)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Số Hóa Đơn / Mã Chứng Từ <span class="required">*</span></label>
            <input type="text" class="form-control font-mono font-bold" id="inv-number" required value="${escapeHtml(invoice ? invoice.invoiceNumber : `HD-${Date.now().toString().slice(-6)}`)}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Hàng Hóa / Dịch Vụ / Mục Đích Hóa Đơn <span class="required">*</span></label>
          <input type="text" class="form-control" id="inv-item-name" required value="${escapeHtml(invoice ? (invoice.itemName || invoice.title || '') : '')}" placeholder="VD: Cước vận tải đường biển Hải Phòng - Cát Lái, Cung cấp server Cloud...">
        </div>

        <div class="form-group">
          <label class="form-label">Đối Tác (Khách Hàng / Nhà Cung Cấp) <span class="required">*</span></label>
          <select class="form-select" id="inv-partner">
            ${partners.map(p => `
              <option value="${p.id}" ${invoice && invoice.partnerId === p.id ? 'selected' : ''}>
                ${escapeHtml(p.name)} (${p.code || p.id})
              </option>
            `).join("")}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Ngày Phát Sinh <span class="required">*</span></label>
            <input type="date" class="form-control" id="inv-issue-date" value="${invoice ? invoice.issueDate : todayStr}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Hạn Thanh Toán <span class="required">*</span></label>
            <input type="date" class="form-control" id="inv-due-date" value="${invoice ? invoice.dueDate : defaultDueStr}" required>
          </div>
        </div>

        <!-- Khối Tính Tiền & Thuế VAT -->
        <div style="background: var(--bg-surface-subtle); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--border-main); margin-bottom: var(--space-3);">
          <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: var(--space-2); color: var(--text-main); display: flex; justify-content: space-between; align-items: center;">
            <span>Chi Tiết Giá Trị & Thuế VAT</span>
            <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">Tổng tiền = Chưa thuế + Tiền thuế</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Tiền Chưa Thuế (VNĐ) <span class="required">*</span></label>
              <div class="input-group">
                <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="inv-pretax-amount" value="${initialPreTax > 0 ? formatCurrency(initialPreTax, false) : ''}" placeholder="0" required>
                <span class="input-group-text">VNĐ</span>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label" style="margin-bottom: 0;">Tiền Thuế VAT (VNĐ)</label>
                <div class="flex gap-1" style="margin-bottom: 4px;">
                  <button type="button" class="btn btn-secondary btn-xs btn-vat-rate" data-rate="0" style="padding: 1px 6px; font-size: 0.7rem;">0%</button>
                  <button type="button" class="btn btn-secondary btn-xs btn-vat-rate" data-rate="5" style="padding: 1px 6px; font-size: 0.7rem;">5%</button>
                  <button type="button" class="btn btn-secondary btn-xs btn-vat-rate" data-rate="8" style="padding: 1px 6px; font-size: 0.7rem;">8%</button>
                  <button type="button" class="btn btn-secondary btn-xs btn-vat-rate" data-rate="10" style="padding: 1px 6px; font-size: 0.7rem;">10%</button>
                </div>
              </div>
              <div class="input-group">
                <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="inv-tax-amount" value="${initialTax > 0 ? formatCurrency(initialTax, false) : ''}" placeholder="0">
                <span class="input-group-text">VNĐ</span>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-top: var(--space-3); margin-bottom: 0;">
            <label class="form-label" style="font-weight: 700;">Tổng Tiền Thanh Toán (VNĐ) <span class="required">*</span></label>
            <div class="input-group">
              <input type="text" inputmode="numeric" class="form-control font-mono font-bold currency-input" id="inv-total-amount" value="${initialTotal > 0 ? formatCurrency(initialTotal, false) : ''}" placeholder="0" required style="font-size: 1.05rem; color: var(--primary-700);">
              <span class="input-group-text">VNĐ</span>
            </div>
            <div class="currency-preview-text" id="inv-total-amount-preview"></div>
          </div>
        </div>

        <!-- Khối Thanh Toán & Hình Thức -->
        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Hình Thức Thanh Toán <span class="required">*</span></label>
            <select class="form-select" id="inv-payment-method">
              <option value="${PAYMENT_METHODS.BANK_TRANSFER}" ${initialMethod === PAYMENT_METHODS.BANK_TRANSFER ? 'selected' : ''}>🏦 Chuyển khoản qua ngân hàng</option>
              <option value="${PAYMENT_METHODS.CASH}" ${initialMethod === PAYMENT_METHODS.CASH ? 'selected' : ''}>💵 Tiền mặt tại quỹ (Dưới 5 triệu)</option>
            </select>
            <div style="font-size: 0.725rem; color: #b45309; margin-top: 3px;" id="inv-cash-warning-note">
              * Quy định: Tiền mặt từ 5.000.000 VNĐ trở lên bắt buộc chuyển qua Ngân hàng.
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Đã Thanh Toán (VNĐ)</label>
            <div class="input-group">
              <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="inv-paid-amount" value="${initialPaid > 0 ? formatCurrency(initialPaid, false) : ''}" placeholder="0">
              <span class="input-group-text">VNĐ</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Diễn Giải / Ghi Chú Thêm</label>
          <textarea class="form-control" id="inv-notes" placeholder="Chi tiết hợp đồng, điều khoản thanh toán, ghi chú...">${escapeHtml(invoice ? invoice.notes : '')}</textarea>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-primary" id="btn-save-invoice">${isEdit ? 'Lưu Hóa Đơn' : 'Tạo Hóa Đơn'}</button>
    `;

    Modal.open({
      title: isEdit ? "Chỉnh Sửa Hóa Đơn" : "Tạo Mới Hóa Đơn Phát Sinh Nợ",
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        const preTaxInput = qs("#inv-pretax-amount", body);
        const taxInput = qs("#inv-tax-amount", body);
        const totalInput = qs("#inv-total-amount", body);
        const paidInput = qs("#inv-paid-amount", body);
        const methodSelect = qs("#inv-payment-method", body);

        // Auto sum: pretax + tax = total
        const updateAutoTotal = () => {
          const preTax = parseCurrency(preTaxInput.value);
          const tax = parseCurrency(taxInput.value);
          if (preTax > 0 || tax > 0) {
            const sum = preTax + tax;
            totalInput.value = formatCurrency(sum, false);
          }
        };

        preTaxInput.oninput = updateAutoTotal;
        taxInput.oninput = updateAutoTotal;

        // Quick VAT rate buttons
        qsa(".btn-vat-rate", body).forEach(btn => {
          btn.onclick = () => {
            const rate = parseFloat(btn.dataset.rate) || 0;
            const preTax = parseCurrency(preTaxInput.value);
            const calculatedTax = Math.round((preTax * rate) / 100);
            taxInput.value = calculatedTax > 0 ? formatCurrency(calculatedTax, false) : "0";
            updateAutoTotal();
          };
        });

        qs("#btn-save-invoice", footer).onclick = () => {
          const partnerId = qs("#inv-partner", body).value;
          const selectedPartner = partners.find(p => p.id === partnerId);
          const itemName = qs("#inv-item-name", body).value.trim();

          if (!itemName) {
            Toast.warning("Vui lòng nhập tên hàng hóa / dịch vụ hoặc mục đích hóa đơn!");
            return;
          }

          const preTaxAmount = parseCurrency(preTaxInput.value);
          const taxAmount = parseCurrency(taxInput.value);
          let totalAmount = parseCurrency(totalInput.value);
          if (totalAmount <= 0 && (preTaxAmount > 0 || taxAmount > 0)) {
            totalAmount = preTaxAmount + taxAmount;
          }
          const paidAmount = parseCurrency(paidInput.value);
          const paymentMethod = methodSelect.value;

          // Validation quy tắc tiền mặt
          if (paymentMethod === PAYMENT_METHODS.CASH && (paidAmount >= 5000000 || totalAmount >= 5000000)) {
            Toast.error("Thanh toán Tiền mặt từ 5.000.000 VNĐ trở lên không hợp lệ! Vui lòng chọn Hình thức Chuyển khoản ngân hàng.");
            return;
          }

          if (paidAmount > totalAmount) {
            Toast.warning("Số tiền đã thanh toán không được lớn hơn Tổng tiền hóa đơn!");
            return;
          }

          const invoiceData = {
            invoiceNumber: qs("#inv-number", body).value.trim(),
            itemName,
            title: itemName,
            type: qs("#inv-type", body).value,
            partnerId,
            partnerName: selectedPartner ? selectedPartner.name : "",
            issueDate: qs("#inv-issue-date", body).value,
            dueDate: qs("#inv-due-date", body).value,
            preTaxAmount,
            taxAmount,
            totalAmount,
            paidAmount,
            paymentMethod,
            notes: qs("#inv-notes", body).value.trim()
          };

          if (!invoiceData.invoiceNumber || invoiceData.totalAmount <= 0) {
            Toast.warning("Vui lòng nhập đầy đủ số hóa đơn và tổng tiền hợp lệ!");
            return;
          }

          if (isEdit) {
            stateStore.updateInvoice(invoice.id, invoiceData);
            Toast.success("Đã cập nhật hóa đơn!");
          } else {
            stateStore.addInvoice(invoiceData);
            Toast.success("Đã tạo hóa đơn phát sinh nợ!");
          }

          Modal.close();
        };
      }
    });
  }

  showQuickPayModal(invoice) {
    const remaining = Math.max(0, (Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0));
    const isReceivable = invoice.type === INVOICE_TYPES.RECEIVABLE;
    const baseType = isReceivable ? "RECEIPT" : "PAYMENT";

    const getMeta = (method) => {
      const vType = getVoucherType(baseType, method);
      const prefix = VOUCHER_TYPE_PREFIXES[vType] || 'CT';
      const label = VOUCHER_TYPE_LABELS[vType];
      const defaultNumber = `${prefix}-${Date.now().toString().slice(-6)}`;
      return { vType, prefix, label, defaultNumber };
    };

    const initialMeta = getMeta(PAYMENT_METHODS.BANK_TRANSFER);

    const bodyHtml = `
      <div style="background: var(--bg-surface-subtle); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
        <div style="font-weight: 600;">${isReceivable ? 'Thu tiền từ' : 'Chi trả cho'}: ${escapeHtml(invoice.partnerName)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Hóa đơn: <b>${escapeHtml(invoice.invoiceNumber)}</b> | Còn nợ: <b class="font-mono ${isReceivable ? 'text-primary' : 'text-warning'}">${formatCurrency(remaining)}</b></div>
      </div>

      <form id="quick-pay-form">
        <div style="background: rgba(37, 99, 235, 0.05); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-3); border-left: 3px solid var(--primary-500);">
          <div style="font-size: 0.85rem; font-weight: 700;" id="qp-voucher-title">
            Loại chứng từ: <span style="color: var(--primary-700);">${initialMeta.label}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Số Chứng Từ <span class="required">*</span></label>
            <input type="text" class="form-control font-mono font-bold" id="qp-number" value="${initialMeta.defaultNumber}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phương Thức Thanh Toán</label>
            <select class="form-select" id="qp-method">
              <option value="${PAYMENT_METHODS.BANK_TRANSFER}">🏦 Chuyển khoản ngân hàng</option>
              <option value="${PAYMENT_METHODS.CASH}">💵 Tiền mặt tại quỹ (Dưới 5 triệu)</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Số Tiền Thanh Toán (VNĐ) <span class="required">*</span></label>
            <div class="input-group">
              <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="qp-amount" value="${formatCurrency(remaining, false)}" placeholder="0" required>
              <span class="input-group-text">VNĐ</span>
            </div>
            <div class="currency-preview-text" id="qp-amount-preview"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Ngày Thanh Toán</label>
            <input type="date" class="form-control" id="qp-date" value="${toInputDateFormat(new Date())}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Nội Dung Thanh Toán</label>
          <input type="text" class="form-control" id="qp-notes" value="Thanh toán cho hóa đơn ${invoice.invoiceNumber}">
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn ${isReceivable ? 'btn-success' : 'btn-primary'}" id="btn-confirm-quick-pay">Xác Nhận & Ghi Nhận</button>
    `;

    Modal.open({
      title: `Thanh Toán Hóa Đơn ${invoice.invoiceNumber}`,
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        const methodSelect = qs("#qp-method", body);
        const numberInput = qs("#qp-number", body);
        const titleEl = qs("#qp-voucher-title", body);
        const submitBtn = qs("#btn-confirm-quick-pay", footer);

        methodSelect.onchange = () => {
          const meta = getMeta(methodSelect.value);
          titleEl.innerHTML = `Loại chứng từ: <span style="color: var(--primary-700);">${meta.label}</span>`;
          numberInput.value = meta.defaultNumber;
          submitBtn.textContent = `Lập ${meta.prefix} & Ghi Nhận`;
        };

        submitBtn.onclick = () => {
          const amount = parseCurrency(qs("#qp-amount", body).value);
          if (amount <= 0 || amount > remaining) {
            Toast.warning(`Số tiền thanh toán phải từ 1 đến ${formatCurrency(remaining)}!`);
            return;
          }

          const method = methodSelect.value;

          // Validation tiền mặt >= 5 triệu
          if (method === PAYMENT_METHODS.CASH && amount >= 5000000) {
            Toast.error("Thu/Chi tiền mặt chỉ áp dụng cho số tiền dưới 5.000.000 VNĐ. Số tiền từ 5.000.000 VNĐ trở lên bắt buộc chuyển khoản ngân hàng!");
            return;
          }

          const vType = getVoucherType(baseType, method);

          const paymentData = {
            paymentNumber: numberInput.value.trim(),
            type: baseType,
            paymentMethod: method,
            voucherType: vType,
            partnerId: invoice.partnerId,
            partnerName: invoice.partnerName,
            paymentDate: qs("#qp-date", body).value,
            amount,
            notes: qs("#qp-notes", body).value.trim(),
            allocations: [
              { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount }
            ]
          };

          stateStore.addPayment(paymentData);
          Toast.success(`Đã lập ${VOUCHER_TYPE_LABELS[vType]} thành công!`);
          Modal.close();
        };
      }
    });
  }
}
