/**
 * PARTNERS VIEW - QUẢN LÝ CÔNG NỢ
 * Quản lý danh bạ Khách hàng & Nhà cung cấp, theo dõi hạn mức tín dụng, sổ chi tiết công nợ.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { formatCurrency, formatDate, parseCurrency, formatCurrencyNumber } from '../utils/formatters.js';
import { PARTNER_TYPES, PARTNER_TYPE_LABELS } from '../config.js';
import { ExportService } from '../services/export-service.js';
import { qs, qsa, escapeHtml, refreshLucideIcons } from '../utils/dom.js';
import { isAmountInRange, countActiveFilters, sortDataList } from '../utils/filter-helpers.js';

export class PartnersView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.defaultFilterState = {
      partnerType: "ALL",
      debtCondition: "ALL",
      minReceivable: "",
      maxReceivable: "",
      sortBy: "name",
      sortOrder: "asc",
      searchQuery: "",
      isAdvancedOpen: false
    };
    this.filterState = { ...this.defaultFilterState };
  }

  render(state) {
    let filteredPartners = state.partners || [];

    // 1. Lọc theo Phân loại đối tác
    if (this.filterState.partnerType !== "ALL") {
      filteredPartners = filteredPartners.filter(p => p.type === this.filterState.partnerType || p.type === PARTNER_TYPES.BOTH);
    }

    // 2. Lọc theo Tình trạng công nợ
    if (this.filterState.debtCondition !== "ALL") {
      switch (this.filterState.debtCondition) {
        case "HAS_RECEIVABLE":
          filteredPartners = filteredPartners.filter(p => (Number(p.totalReceivable) || 0) > 0);
          break;
        case "HAS_PAYABLE":
          filteredPartners = filteredPartners.filter(p => (Number(p.totalPayable) || 0) > 0);
          break;
        case "HAS_OVERDUE":
          filteredPartners = filteredPartners.filter(p => (Number(p.overdueReceivable) || 0) > 0);
          break;
        case "EXCEED_LIMIT":
          filteredPartners = filteredPartners.filter(p => {
            const limit = Number(p.creditLimit) || 0;
            const rec = Number(p.totalReceivable) || 0;
            return limit > 0 && rec >= limit;
          });
          break;
        case "ZERO_DEBT":
          filteredPartners = filteredPartners.filter(p => (Number(p.totalReceivable) || 0) === 0 && (Number(p.totalPayable) || 0) === 0);
          break;
      }
    }

    // 3. Lọc theo Khoảng dư nợ phải thu (Min - Max)
    if (this.filterState.minReceivable !== "" || this.filterState.maxReceivable !== "") {
      filteredPartners = filteredPartners.filter(p =>
        isAmountInRange(p.totalReceivable || 0, this.filterState.minReceivable, this.filterState.maxReceivable)
      );
    }

    // 4. Lọc theo Tìm kiếm (Header Global Search hoặc Search nội bộ của View)
    const effectiveSearch = (this.filterState.searchQuery || state.searchQuery || "").trim().toLowerCase();
    if (effectiveSearch) {
      filteredPartners = filteredPartners.filter(p =>
        (p.name && p.name.toLowerCase().includes(effectiveSearch)) ||
        (p.code && p.code.toLowerCase().includes(effectiveSearch)) ||
        (p.taxCode && p.taxCode.toLowerCase().includes(effectiveSearch)) ||
        (p.phone && p.phone.toLowerCase().includes(effectiveSearch)) ||
        (p.address && p.address.toLowerCase().includes(effectiveSearch)) ||
        (p.contactPerson && p.contactPerson.toLowerCase().includes(effectiveSearch))
      );
    }

    // 5. Sắp xếp danh sách
    filteredPartners = sortDataList(filteredPartners, this.filterState.sortBy, this.filterState.sortOrder);

    const activeFilterCount = countActiveFilters(this.filterState, this.defaultFilterState);

    const countAll = state.partners.length;
    const countCust = state.partners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH).length;
    const countVend = state.partners.filter(p => p.type === PARTNER_TYPES.VENDOR || p.type === PARTNER_TYPES.BOTH).length;
    const countOverdue = state.partners.filter(p => (Number(p.overdueReceivable) || 0) > 0).length;

    return `
      <!-- Action Header & Modern Filter Card -->
      <div class="filter-card">
        <div class="filter-toolbar">
          <div class="filter-left">
            <!-- Quick Filter Pills -->
            <button class="btn btn-sm ${this.filterState.partnerType === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-partner-filter="ALL">
              Tất Cả (${countAll})
            </button>
            <button class="btn btn-sm ${this.filterState.partnerType === PARTNER_TYPES.CUSTOMER ? 'btn-primary' : 'btn-secondary'}" data-partner-filter="${PARTNER_TYPES.CUSTOMER}">
              Khách Hàng (${countCust})
            </button>
            <button class="btn btn-sm ${this.filterState.partnerType === PARTNER_TYPES.VENDOR ? 'btn-primary' : 'btn-secondary'}" data-partner-filter="${PARTNER_TYPES.VENDOR}">
              Nhà Cung Cấp (${countVend})
            </button>

            <!-- Search box in toolbar -->
            <div class="filter-search-box">
              <i data-lucide="search"></i>
              <input type="text" class="filter-search-input" id="partner-filter-search" placeholder="Tìm tên, mã, MST, SĐT..." value="${escapeHtml(this.filterState.searchQuery)}">
            </div>
          </div>

          <div class="filter-right">
            <!-- Nút bật/tắt bộ lọc nâng cao -->
            <button class="filter-btn-toggle ${this.filterState.isAdvancedOpen ? 'active' : ''}" id="btn-toggle-partner-filter">
              <i data-lucide="sliders-horizontal"></i>
              <span>Bộ Lọc Nâng Cao</span>
              ${activeFilterCount > 0 ? `<span class="filter-badge-count">${activeFilterCount}</span>` : ''}
            </button>

            ${activeFilterCount > 0 ? `
              <button class="filter-btn-reset" id="btn-reset-partner-filter" title="Xóa tất cả bộ lọc về mặc định">
                <i data-lucide="rotate-ccw"></i>
                <span>Đặt Lại</span>
              </button>
            ` : ''}

            <div class="flex items-center gap-2">
              <button class="btn btn-secondary btn-sm" id="btn-import-partners-excel" title="Nhập danh bạ đối tác hàng loạt từ file Excel">
                <i data-lucide="file-spreadsheet"></i>
                <span>Nhập Excel</span>
              </button>
              <button class="btn btn-primary btn-sm" id="btn-add-partner">
                <i data-lucide="user-plus"></i>
                <span>Thêm Đối Tác</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Khung Bộ Lọc Nâng Cao (Collapsible Drawer) -->
        <div class="filter-drawer ${this.filterState.isAdvancedOpen ? 'open' : ''}" id="partner-filter-drawer">
          <div class="filter-grid">
            <!-- 1. Tình trạng công nợ -->
            <div class="filter-field">
              <label class="filter-field-label">Tình Trạng Công Nợ</label>
              <select class="filter-field-control" id="partner-filter-debt">
                <option value="ALL" ${this.filterState.debtCondition === 'ALL' ? 'selected' : ''}>Tất cả tình trạng</option>
                <option value="HAS_RECEIVABLE" ${this.filterState.debtCondition === 'HAS_RECEIVABLE' ? 'selected' : ''}>Có nợ phải thu (>0đ)</option>
                <option value="HAS_PAYABLE" ${this.filterState.debtCondition === 'HAS_PAYABLE' ? 'selected' : ''}>Có nợ phải trả (>0đ)</option>
                <option value="HAS_OVERDUE" ${this.filterState.debtCondition === 'HAS_OVERDUE' ? 'selected' : ''}>Có nợ quá hạn (${countOverdue})</option>
                <option value="EXCEED_LIMIT" ${this.filterState.debtCondition === 'EXCEED_LIMIT' ? 'selected' : ''}>Vượt / Chạm hạn mức tín dụng</option>
                <option value="ZERO_DEBT" ${this.filterState.debtCondition === 'ZERO_DEBT' ? 'selected' : ''}>Không có dư nợ (0đ)</option>
              </select>
            </div>

            <!-- 2. Khoảng dư nợ phải thu (Min - Max) -->
            <div class="filter-field">
              <label class="filter-field-label">Dư Nợ Phải Thu (Từ - Đến VNĐ)</label>
              <div style="display: flex; gap: var(--space-2); align-items: center;">
                <input type="number" class="filter-field-control" id="partner-filter-min-rec" placeholder="Tối thiểu" value="${this.filterState.minReceivable}">
                <span style="color: var(--text-muted);">-</span>
                <input type="number" class="filter-field-control" id="partner-filter-max-rec" placeholder="Tối đa" value="${this.filterState.maxReceivable}">
              </div>
            </div>

            <!-- 3. Tiêu chí sắp xếp -->
            <div class="filter-field">
              <label class="filter-field-label">Sắp Xếp Theo</label>
              <select class="filter-field-control" id="partner-filter-sort-by">
                <option value="name" ${this.filterState.sortBy === 'name' ? 'selected' : ''}>Tên đối tác (A - Z)</option>
                <option value="totalReceivable" ${this.filterState.sortBy === 'totalReceivable' ? 'selected' : ''}>Dư nợ phải thu</option>
                <option value="totalPayable" ${this.filterState.sortBy === 'totalPayable' ? 'selected' : ''}>Dư nợ phải trả</option>
                <option value="overdueReceivable" ${this.filterState.sortBy === 'overdueReceivable' ? 'selected' : ''}>Dư nợ quá hạn</option>
                <option value="creditLimit" ${this.filterState.sortBy === 'creditLimit' ? 'selected' : ''}>Hạn mức tín dụng</option>
              </select>
            </div>

            <!-- 4. Thứ tự sắp xếp -->
            <div class="filter-field">
              <label class="filter-field-label">Thứ Tự</label>
              <select class="filter-field-control" id="partner-filter-sort-order">
                <option value="asc" ${this.filterState.sortOrder === 'asc' ? 'selected' : ''}>Tăng dần / A → Z</option>
                <option value="desc" ${this.filterState.sortOrder === 'desc' ? 'selected' : ''}>Giảm dần / Cao nhất trước</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Filter Active Chips Summary Bar -->
        ${activeFilterCount > 0 ? `
          <div class="filter-summary-bar">
            <span class="filter-summary-label"><i data-lucide="filter" style="width: 12px; height: 12px;"></i> Đang lọc:</span>
            ${this.filterState.partnerType !== 'ALL' ? `
              <span class="filter-chip">
                Loại: ${this.filterState.partnerType === PARTNER_TYPES.CUSTOMER ? 'Khách Hàng' : 'Nhà Cung Cấp'}
                <span class="filter-chip-remove" data-clear-key="partnerType">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.debtCondition !== 'ALL' ? `
              <span class="filter-chip">
                Công nợ: ${
                  this.filterState.debtCondition === 'HAS_RECEIVABLE' ? 'Có nợ phải thu' :
                  this.filterState.debtCondition === 'HAS_PAYABLE' ? 'Có nợ phải trả' :
                  this.filterState.debtCondition === 'HAS_OVERDUE' ? 'Có nợ quá hạn' :
                  this.filterState.debtCondition === 'EXCEED_LIMIT' ? 'Vượt hạn mức' : 'Hết dư nợ'
                }
                <span class="filter-chip-remove" data-clear-key="debtCondition">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.minReceivable !== '' || this.filterState.maxReceivable !== '' ? `
              <span class="filter-chip">
                Khoảng nợ: ${formatCurrency(this.filterState.minReceivable || 0)} - ${this.filterState.maxReceivable ? formatCurrency(this.filterState.maxReceivable) : '∞'}
                <span class="filter-chip-remove" data-clear-key="recRange">&times;</span>
              </span>
            ` : ''}
            ${this.filterState.searchQuery ? `
              <span class="filter-chip">
                Từ khóa: "${escapeHtml(this.filterState.searchQuery)}"
                <span class="filter-chip-remove" data-clear-key="searchQuery">&times;</span>
              </span>
            ` : ''}
            <span class="font-mono text-muted" style="margin-left: auto; font-size: 0.725rem;">
              Hiển thị <b>${filteredPartners.length}</b> / ${state.partners.length} đối tác
            </span>
          </div>
        ` : ''}
      </div>

      <!-- Partners Table -->
      <div class="table-container">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã / Tên Đối Tác</th>
                <th>Phân Loại</th>
                <th>Mã Số Thuế / SĐT</th>
                <th class="text-right">Dư Nợ Phải Thu</th>
                <th class="text-right">Dư Nợ Phải Trả</th>
                <th>Hạn Mức Tín Dụng</th>
                <th class="text-center" style="width: 100px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPartners.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <i data-lucide="users" style="width: 36px; height: 36px; margin-bottom: 8px; color: var(--text-muted); opacity: 0.5;"></i>
                    <p>Không tìm thấy đối tác nào phù hợp với bộ lọc.</p>
                    ${activeFilterCount > 0 ? `
                      <button class="btn btn-secondary btn-sm" id="btn-reset-partner-empty" style="margin-top: 8px;">
                        <i data-lucide="rotate-ccw"></i>
                        <span>Xóa Bộ Lọc</span>
                      </button>
                    ` : ''}
                  </td>
                </tr>
              ` : filteredPartners.map(p => {
                const creditLimit = p.creditLimit || 0;
                const receivable = p.totalReceivable || 0;
                const creditUsagePercent = creditLimit > 0 ? Math.min(100, Math.round((receivable / creditLimit) * 100)) : 0;
                let progressClass = "credit-safe";
                if (creditUsagePercent > 80) progressClass = "credit-warning";
                if (creditUsagePercent >= 100) progressClass = "credit-danger";

                return `
                  <tr>
                    <td>
                      <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(p.name)}</div>
                      <div class="font-mono" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(p.code || p.id)}</div>
                    </td>
                    <td>
                      <span class="badge ${p.type === PARTNER_TYPES.CUSTOMER ? 'badge-paid' : 'badge-partial'}">
                        ${p.type === PARTNER_TYPES.CUSTOMER ? 'Khách Hàng' : p.type === PARTNER_TYPES.VENDOR ? 'Nhà Cung Cấp' : '2 Chiều'}
                      </span>
                    </td>
                    <td>
                      <div>MST: ${escapeHtml(p.taxCode || "-")}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(p.phone || "-")}</div>
                    </td>
                    <td class="text-right font-mono font-bold ${receivable > 0 ? 'text-primary' : ''}">
                      ${formatCurrency(receivable)}
                      ${(p.overdueReceivable || 0) > 0 ? `
                        <div class="text-danger" style="font-size: 0.7rem;">Quá hạn: ${formatCurrency(p.overdueReceivable)}</div>
                      ` : ''}
                    </td>
                    <td class="text-right font-mono font-bold ${p.totalPayable > 0 ? 'text-warning' : ''}">
                      ${formatCurrency(p.totalPayable || 0)}
                    </td>
                    <td>
                      <div class="flex justify-between" style="font-size: 0.75rem;">
                        <span class="font-mono">${formatCurrency(creditLimit)}</span>
                        <span class="font-mono font-bold">${creditUsagePercent}%</span>
                      </div>
                      <div class="credit-progress-wrap">
                        <div class="credit-progress-bar ${progressClass}" style="width: ${creditUsagePercent}%;"></div>
                      </div>
                    </td>
                    <td class="text-center">
                      <div class="flex justify-center gap-1">
                        <button class="btn btn-icon btn-sm btn-edit-partner" data-id="${p.id}" title="Sửa thông tin">
                          <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn btn-icon btn-sm btn-delete-partner text-danger" data-id="${p.id}" title="Xóa đối tác">
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
    // 1. Quick filter tabs (Tất cả / Khách hàng / Nhà cung cấp)
    qsa("[data-partner-filter]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.filterState.partnerType = btn.dataset.partnerFilter;
        this.mount(stateStore.state);
      };
    });

    // 2. Search input (debounced)
    const searchInput = qs("#partner-filter-search", this.container);
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
    const toggleBtn = qs("#btn-toggle-partner-filter", this.container);
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        this.filterState.isAdvancedOpen = !this.filterState.isAdvancedOpen;
        this.mount(stateStore.state);
      };
    }

    // 4. Reset Button
    const resetBtn = qs("#btn-reset-partner-filter", this.container) || qs("#btn-reset-partner-empty", this.container);
    if (resetBtn) {
      resetBtn.onclick = () => {
        this.filterState = { ...this.defaultFilterState, isAdvancedOpen: this.filterState.isAdvancedOpen };
        this.mount(stateStore.state);
        Toast.info("Đã đặt lại bộ lọc đối tác");
      };
    }

    // 5. Debt Condition Select
    const debtSelect = qs("#partner-filter-debt", this.container);
    if (debtSelect) {
      debtSelect.onchange = (e) => {
        this.filterState.debtCondition = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 6. Min/Max Receivable
    const minRecInput = qs("#partner-filter-min-rec", this.container);
    const maxRecInput = qs("#partner-filter-max-rec", this.container);
    let rangeTimer = null;
    const handleRangeChange = () => {
      clearTimeout(rangeTimer);
      rangeTimer = setTimeout(() => {
        this.filterState.minReceivable = minRecInput ? minRecInput.value : "";
        this.filterState.maxReceivable = maxRecInput ? maxRecInput.value : "";
        this.mount(stateStore.state);
      }, 300);
    };
    if (minRecInput) minRecInput.oninput = handleRangeChange;
    if (maxRecInput) maxRecInput.oninput = handleRangeChange;

    // 7. Sort Options
    const sortBySelect = qs("#partner-filter-sort-by", this.container);
    if (sortBySelect) {
      sortBySelect.onchange = (e) => {
        this.filterState.sortBy = e.target.value;
        // Tự động chuyển desc khi chọn các trường số tiền
        if (['totalReceivable', 'totalPayable', 'overdueReceivable', 'creditLimit'].includes(e.target.value)) {
          this.filterState.sortOrder = 'desc';
        }
        this.mount(stateStore.state);
      };
    }

    const sortOrderSelect = qs("#partner-filter-sort-order", this.container);
    if (sortOrderSelect) {
      sortOrderSelect.onchange = (e) => {
        this.filterState.sortOrder = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // 8. Filter Chips Remove Click
    qsa("[data-clear-key]", this.container).forEach(chip => {
      chip.onclick = () => {
        const key = chip.dataset.clearKey;
        if (key === 'recRange') {
          this.filterState.minReceivable = '';
          this.filterState.maxReceivable = '';
        } else if (key in this.filterState) {
          this.filterState[key] = this.defaultFilterState[key];
        }
        this.mount(stateStore.state);
      };
    });

    // 9. Add partner click
    const addBtn = qs("#btn-add-partner", this.container);
    if (addBtn) {
      addBtn.onclick = () => this.showPartnerModal();
    }

    // 10. Import Excel click
    const importExcelBtn = qs("#btn-import-partners-excel", this.container);
    if (importExcelBtn) {
      importExcelBtn.onclick = () => this.showImportExcelModal();
    }

    // 11. Edit partner click
    qsa(".btn-edit-partner", this.container).forEach(btn => {
      btn.onclick = () => {
        const partner = stateStore.state.partners.find(p => p.id === btn.dataset.id);
        if (partner) this.showPartnerModal(partner);
      };
    });

    // 12. Delete partner click
    qsa(".btn-delete-partner", this.container).forEach(btn => {
      btn.onclick = () => {
        const partner = stateStore.state.partners.find(p => p.id === btn.dataset.id);
        if (!partner) return;
        if (confirm(`Bạn có chắc chắn muốn xóa đối tác "${partner.name}"?`)) {
          try {
            stateStore.deletePartner(partner.id);
            Toast.success("Đã xóa đối tác thành công!");
          } catch (err) {
            Toast.error(err.message);
          }
        }
      };
    });
  }

  showImportExcelModal() {
    let parsedResult = null;

    const title = "Nhập Danh Sách Khách Hàng & Nhà Cung Cấp Từ Excel";
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
              <div class="step-desc">Nhập danh sách đối tác vào file (Bắt buộc: <b>Tên đối tác</b> và <b>Phân loại</b>).</div>
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
          <button type="button" class="btn btn-secondary btn-sm" id="btn-download-partner-template">
            <i data-lucide="download"></i>
            <span>Tải File Excel Mẫu (.xlsx)</span>
          </button>
        </div>

        <!-- Khung Kéo Thả File (Dropzone) -->
        <input type="file" id="excel-file-input" accept=".xlsx, .xls, .csv" style="display: none;">
        <div class="excel-dropzone" id="excel-dropzone">
          <div id="dropzone-content">
            <i data-lucide="file-up" class="excel-dropzone-icon"></i>
            <div class="excel-dropzone-title">Kéo thả file Excel vào đây hoặc <span style="color: var(--primary-600); text-decoration: underline;">chọn từ máy tính</span></div>
            <div class="excel-dropzone-sub">Hỗ trợ định dạng .xlsx, .xls, .csv (Tối đa 5.000 dòng)</div>
          </div>
        </div>

        <!-- Khu vực Xem Trước Dữ Liệu (Preview Area) -->
        <div id="excel-preview-area" style="display: none;">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-primary" id="btn-confirm-import-partners" disabled>
        <i data-lucide="check"></i>
        <span>Xác Nhận Nhập Đối Tác</span>
      </button>
    `;

    Modal.open({
      title,
      bodyHtml,
      footerHtml,
      size: "xl",
      onOpen: (body, footer) => {
        const downloadBtn = qs("#btn-download-partner-template", body);
        const dropzone = qs("#excel-dropzone", body);
        const dropzoneContent = qs("#dropzone-content", body);
        const fileInput = qs("#excel-file-input", body);
        const previewArea = qs("#excel-preview-area", body);
        const confirmBtn = qs("#btn-confirm-import-partners", footer);

        // Download template click
        if (downloadBtn) {
          downloadBtn.onclick = () => {
            ExportService.generatePartnerImportTemplate();
            Toast.info("Đang tải file Excel mẫu...");
          };
        }

        // Dropzone click & drag drop
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
              fileInput.value = ""; // Reset to allow selecting same file again if edited
            }
          };
        }

        const handleFile = async (file) => {
          try {
            if (dropzoneContent) {
              dropzoneContent.innerHTML = `<div style="font-size: 0.9rem; font-weight: 600; color: var(--primary-600);"><i data-lucide="loader-2"></i> Đang đọc file "${escapeHtml(file.name)}"...</div>`;
              refreshLucideIcons();
            }

            parsedResult = await ExportService.parsePartnersFromExcel(file, stateStore.state.partners);
            const { partners, summary } = parsedResult;

            if (summary.valid === 0) {
              Toast.warning("Không tìm thấy dòng dữ liệu đối tác hợp lệ nào trong file!");
            } else if (summary.dupCount > 0) {
              Toast.info(`Đã đọc ${summary.total} dòng: phát hiện ${summary.dupCount} đối tác bị trùng lặp.`);
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
              </div>

              <!-- Tùy Chọn Xử Lý Trùng Lặp (nếu phát hiện có trùng) -->
              ${summary.dupCount > 0 ? `
                <div class="duplicate-options-box">
                  <div style="font-weight: 600; font-size: 0.85rem; color: #b45309; display: flex; align-items: center; gap: 6px;">
                    <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
                    <span>Phát hiện ${summary.dupCount} đối tác bị trùng lặp. Vui lòng chọn phương án:</span>
                  </div>
                  <div class="duplicate-radio-row">
                    <label class="duplicate-radio-label">
                      <input type="radio" name="dup-mode" value="SKIP" checked>
                      <span>Bỏ qua dòng trùng (Chỉ thêm <b>${summary.newCount}</b> đối tác mới)</span>
                    </label>
                    <label class="duplicate-radio-label">
                      <input type="radio" name="dup-mode" value="UPDATE">
                      <span>Cập nhật đè thông tin đối tác đã có</span>
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
                        <th style="width: 50px;">Dòng</th>
                        <th>Tên Đối Tác</th>
                        <th>Phân Loại</th>
                        <th>MST / SĐT</th>
                        <th class="text-right">Hạn Mức Nợ</th>
                        <th>Hạn Nợ</th>
                        <th>Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${partners.map(p => `
                        <tr style="${!p.isValid ? 'background: rgba(239, 68, 68, 0.05);' : (p.isDuplicate ? 'background: rgba(245, 158, 11, 0.05);' : '')}">
                          <td>${p.rowIndex}</td>
                          <td>
                            <div style="font-weight: 600;">${escapeHtml(p.name || "(Trống)")}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(p.code)}</div>
                          </td>
                          <td>
                            <span class="badge ${p.type === 'CUSTOMER' ? 'badge-customer' : (p.type === 'VENDOR' ? 'badge-vendor' : 'badge-both')}" style="font-size: 0.7rem;">
                              ${PARTNER_TYPE_LABELS[p.type] || p.type}
                            </span>
                          </td>
                          <td>
                            <div>${escapeHtml(p.taxCode || "-")}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(p.phone || "-")}</div>
                          </td>
                          <td class="text-right font-mono">${p.creditLimit > 0 ? formatCurrency(p.creditLimit) : "0 VNĐ"}</td>
                          <td>${p.creditTermDays} ngày</td>
                          <td>
                            ${!p.isValid ? `
                              <span class="validation-tag-err" title="${escapeHtml(p.error)}"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> ${escapeHtml(p.error)}</span>
                            ` : (p.isDuplicate ? `
                              <span class="validation-tag-dup" title="${escapeHtml(p.duplicateReason)}"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Trùng lặp</span>
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
                  confirmBtn.innerHTML = `<i data-lucide="upload"></i><span>Nhập ${summary.newCount} Đối Tác Mới (Bỏ qua ${summary.dupCount} dòng trùng)</span>`;
                } else {
                  confirmBtn.disabled = true;
                  confirmBtn.innerHTML = `<span>Tất cả dòng đều bị trùng lặp</span>`;
                }
              } else if (selectedMode === "UPDATE") {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Cập Nhật ${summary.dupCount} & Nhập ${summary.newCount} Mới</span>`;
              } else {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<i data-lucide="upload"></i><span>Nhập Toàn Bộ ${summary.valid} Đối Tác</span>`;
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
            if (!parsedResult || !parsedResult.partners) return;
            const validPartners = parsedResult.partners.filter(p => p.isValid);
            if (validPartners.length === 0) {
              Toast.warning("Không có đối tác hợp lệ nào để nhập!");
              return;
            }

            const selectedMode = qs("input[name='dup-mode']:checked", previewArea)?.value || "SKIP";
            const result = stateStore.addPartnersBatch(validPartners, selectedMode);

            if (result.insertedCount > 0 && result.updatedCount > 0) {
              Toast.success(`Đã thêm mới ${result.insertedCount} đối tác và cập nhật ${result.updatedCount} đối tác cũ!`);
            } else if (result.insertedCount > 0) {
              Toast.success(`Đã nhập thành công ${result.insertedCount} đối tác vào hệ thống! (Đã bỏ qua ${result.skippedCount} dòng trùng)`);
            } else if (result.updatedCount > 0) {
              Toast.success(`Đã cập nhật thông tin cho ${result.updatedCount} đối tác!`);
            } else {
              Toast.info(`Không có đối tác mới nào được thêm (Đã bỏ qua ${result.skippedCount} dòng trùng).`);
            }

            Modal.close();
          };
        }
      }
    });
  }

  showPartnerModal(partner = null) {
    const isEdit = !!partner;
    const title = isEdit ? "Chỉnh Sửa Thông Tin Đối Tác" : "Thêm Mới Khách Hàng / Nhà Cung Cấp";

    const bodyHtml = `
      <form id="partner-form">
        <div class="form-group">
          <label class="form-label">Tên Đối Tác <span class="required">*</span></label>
          <input type="text" class="form-control" id="p-name" required value="${escapeHtml(partner ? partner.name : '')}" placeholder="VD: Công ty Cổ phần Thương mại ABC">
          <div id="p-name-warning"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Mã Đối Tác</label>
            <input type="text" class="form-control" id="p-code" value="${escapeHtml(partner ? (partner.code || partner.id) : '')}" placeholder="VD: KH-ABC01">
            <div id="p-code-warning"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Phân Loại <span class="required">*</span></label>
            <select class="form-select" id="p-type">
              <option value="${PARTNER_TYPES.CUSTOMER}" ${partner && partner.type === PARTNER_TYPES.CUSTOMER ? 'selected' : ''}>Khách Hàng (Phải Thu)</option>
              <option value="${PARTNER_TYPES.VENDOR}" ${partner && partner.type === PARTNER_TYPES.VENDOR ? 'selected' : ''}>Nhà Cung Cấp (Phải Trả)</option>
              <option value="${PARTNER_TYPES.BOTH}" ${partner && partner.type === PARTNER_TYPES.BOTH ? 'selected' : ''}>Đối Tác 2 Chiều</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Mã Số Thuế</label>
            <input type="text" class="form-control" id="p-tax" value="${escapeHtml(partner ? partner.taxCode : '')}" placeholder="VD: 0108999888">
            <div id="p-tax-warning"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Số Điện Thoại</label>
            <input type="text" class="form-control" id="p-phone" value="${escapeHtml(partner ? partner.phone : '')}" placeholder="VD: 024.7300.7300">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Hạn Mức Tín Dụng (VNĐ)</label>
            <div class="input-group">
              <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="p-credit-limit" value="${partner && partner.creditLimit ? formatCurrency(partner.creditLimit, false) : ''}" placeholder="0">
              <span class="input-group-text">VNĐ</span>
            </div>
            <div class="currency-preview-text" id="p-credit-limit-preview"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Số Ngày Được Nợ (Ngày)</label>
            <input type="number" class="form-control" id="p-term-days" value="${partner ? partner.creditTermDays || 30 : 30}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Địa Chỉ</label>
          <input type="text" class="form-control" id="p-address" value="${escapeHtml(partner ? partner.address : '')}" placeholder="VD: Số 123 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội">
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-primary" id="btn-save-partner">${isEdit ? 'Lưu Thay Đổi' : 'Tạo Đối Tác'}</button>
    `;

    Modal.open({
      title,
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        const nameInput = qs("#p-name", body);
        const codeInput = qs("#p-code", body);
        const taxInput = qs("#p-tax", body);

        const checkDuplicateFields = () => {
          const name = nameInput.value.trim();
          const code = codeInput.value.trim();
          const taxCode = taxInput.value.trim();

          const dupCheck = stateStore.checkPartnerDuplicate({
            code,
            taxCode,
            name,
            excludeId: partner?.id || null
          });

          const nameWarn = qs("#p-name-warning", body);
          const codeWarn = qs("#p-code-warning", body);
          const taxWarn = qs("#p-tax-warning", body);

          if (nameWarn) nameWarn.innerHTML = dupCheck.nameDup ? `<div class="form-duplicate-warning"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> ${escapeHtml(dupCheck.nameDup.message)}</div>` : "";
          if (codeWarn) codeWarn.innerHTML = dupCheck.codeDup ? `<div class="form-duplicate-warning"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> ${escapeHtml(dupCheck.codeDup.message)}</div>` : "";
          if (taxWarn) taxWarn.innerHTML = dupCheck.taxDup ? `<div class="form-duplicate-warning"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> ${escapeHtml(dupCheck.taxDup.message)}</div>` : "";

          refreshLucideIcons();
        };

        if (nameInput) nameInput.oninput = checkDuplicateFields;
        if (codeInput) codeInput.oninput = checkDuplicateFields;
        if (taxInput) taxInput.oninput = checkDuplicateFields;

        qs("#btn-save-partner", footer).onclick = () => {
          const name = nameInput.value.trim();
          const code = codeInput.value.trim();
          const taxCode = taxInput.value.trim();

          if (!name) {
            Toast.warning("Vui lòng nhập tên đối tác!");
            return;
          }

          const dupCheck = stateStore.checkPartnerDuplicate({
            code,
            taxCode,
            name,
            excludeId: partner?.id || null
          });

          if (dupCheck.codeDup) {
            Toast.warning(dupCheck.codeDup.message);
            return;
          }

          if (dupCheck.taxDup) {
            Toast.warning(dupCheck.taxDup.message);
            return;
          }

          if (dupCheck.nameDup && !isEdit) {
            if (!confirm(`CẢNH BÁO: Tên đối tác "${name}" đã tồn tại trên hệ thống (${dupCheck.nameDup.matchedPartner.code}). Bạn có chắc chắn vẫn muốn tạo thêm bản ghi mới?`)) {
              return;
            }
          }

          const partnerData = {
            name,
            code: code || `P-${Date.now().toString(36).toUpperCase()}`,
            type: qs("#p-type", body).value,
            taxCode,
            phone: qs("#p-phone", body).value.trim(),
            address: qs("#p-address", body).value.trim(),
            creditLimit: parseCurrency(qs("#p-credit-limit", body).value),
            creditTermDays: Number(qs("#p-term-days", body).value) || 30
          };

          if (isEdit) {
            stateStore.updatePartner(partner.id, partnerData);
            Toast.success("Đã cập nhật thông tin đối tác!");
          } else {
            stateStore.addPartner(partnerData);
            Toast.success("Đã tạo mới đối tác!");
          }

          Modal.close();
        };
      }
    });
  }
}
