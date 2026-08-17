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
import { INVOICE_TYPES, INVOICE_STATUS, PAYMENT_METHODS } from '../config.js';
import { qs, qsa, escapeHtml, refreshLucideIcons } from '../utils/dom.js';

export class InvoicesView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.currentStatusTab = "ALL";
    this.currentTypeFilter = "ALL";
  }

  render(state) {
    let filteredInvoices = state.invoices;

    // Lọc theo Tab trạng thái
    if (this.currentStatusTab !== "ALL") {
      filteredInvoices = filteredInvoices.filter(inv => inv.status === this.currentStatusTab);
    }

    // Lọc theo Loại (Phải thu / Phải trả)
    if (this.currentTypeFilter !== "ALL") {
      filteredInvoices = filteredInvoices.filter(inv => inv.type === this.currentTypeFilter);
    }

    // Lọc theo tìm kiếm
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filteredInvoices = filteredInvoices.filter(inv =>
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (inv.partnerName && inv.partnerName.toLowerCase().includes(q)) ||
        (inv.notes && inv.notes.toLowerCase().includes(q))
      );
    }

    const overdueCount = state.invoices.filter(inv => inv.status === INVOICE_STATUS.OVERDUE).length;

    return `
      <!-- Action Header & Tabs -->
      <div class="tabs-nav">
        <button class="tab-btn ${this.currentStatusTab === 'ALL' ? 'active' : ''}" data-status-tab="ALL">
          Tất Cả (${state.invoices.length})
        </button>
        <button class="tab-btn ${this.currentStatusTab === INVOICE_STATUS.OVERDUE ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.OVERDUE}">
          Quá Hạn <span class="badge badge-overdue" style="font-size: 0.7rem;">${overdueCount}</span>
        </button>
        <button class="tab-btn ${this.currentStatusTab === INVOICE_STATUS.UNPAID ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.UNPAID}">
          Chưa Thanh Toán
        </button>
        <button class="tab-btn ${this.currentStatusTab === INVOICE_STATUS.PARTIAL ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.PARTIAL}">
          Trả Một Phần
        </button>
        <button class="tab-btn ${this.currentStatusTab === INVOICE_STATUS.PAID ? 'active' : ''}" data-status-tab="${INVOICE_STATUS.PAID}">
          Đã Hoàn Tất
        </button>
      </div>

      <div class="action-header">
        <div class="filter-group">
          <select class="form-select" id="select-invoice-type" style="height: 36px;">
            <option value="ALL" ${this.currentTypeFilter === 'ALL' ? 'selected' : ''}>Tất cả loại chứng từ</option>
            <option value="${INVOICE_TYPES.RECEIVABLE}" ${this.currentTypeFilter === INVOICE_TYPES.RECEIVABLE ? 'selected' : ''}>Phải Thu (Bán hàng)</option>
            <option value="${INVOICE_TYPES.PAYABLE}" ${this.currentTypeFilter === INVOICE_TYPES.PAYABLE ? 'selected' : ''}>Phải Trả (Mua hàng)</option>
          </select>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-secondary" id="btn-import-invoices-excel" title="Nhập hóa đơn / công nợ hàng loạt từ file Excel">
            <i data-lucide="file-spreadsheet"></i>
            <span>Nhập Từ Excel</span>
          </button>
          <button class="btn btn-secondary" id="btn-export-invoices">
            <i data-lucide="download"></i>
            <span>Xuất Excel</span>
          </button>
          <button class="btn btn-primary" id="btn-add-invoice">
            <i data-lucide="plus-circle"></i>
            <span>Tạo Hóa Đơn Mới</span>
          </button>
        </div>
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
                <th class="text-right">Tổng Tiền</th>
                <th class="text-right">Đã Trả</th>
                <th class="text-right">Còn Nợ</th>
                <th>Trạng Thái</th>
                <th class="text-center" style="width: 120px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredInvoices.length === 0 ? `
                <tr>
                  <td colspan="9" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    Không có hóa đơn nào trong danh sách.
                  </td>
                </tr>
              ` : filteredInvoices.map(inv => {
                const remaining = Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
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
                    <td class="text-right font-mono font-bold">${formatCurrency(inv.totalAmount)}</td>
                    <td class="text-right font-mono text-success">${formatCurrency(inv.paidAmount)}</td>
                    <td class="text-right font-mono font-bold ${remaining > 0 ? (inv.type === INVOICE_TYPES.RECEIVABLE ? 'text-primary' : 'text-warning') : ''}">
                      ${formatCurrency(remaining)}
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
    // Tab status switch
    qsa("[data-status-tab]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.currentStatusTab = btn.dataset.statusTab;
        this.mount(stateStore.state);
      };
    });

    // Select type filter
    const selectType = qs("#select-invoice-type", this.container);
    if (selectType) {
      selectType.onchange = (e) => {
        this.currentTypeFilter = e.target.value;
        this.mount(stateStore.state);
      };
    }

    // Import Invoices from Excel
    const importExcelBtn = qs("#btn-import-invoices-excel", this.container);
    if (importExcelBtn) {
      importExcelBtn.onclick = () => this.showImportExcelModal();
    }

    // Export Excel
    const exportBtn = qs("#btn-export-invoices", this.container);
    if (exportBtn) {
      exportBtn.onclick = () => {
        ExportService.exportInvoicesToExcel(stateStore.state.invoices);
        Toast.success("Đã xuất file Excel công nợ thành công!");
      };
    }

    // Add Invoice
    const addBtn = qs("#btn-add-invoice", this.container);
    if (addBtn) {
      addBtn.onclick = () => this.showInvoiceModal();
    }

    // Quick pay button
    qsa(".btn-quick-pay", this.container).forEach(btn => {
      btn.onclick = () => {
        const inv = stateStore.state.invoices.find(i => i.id === btn.dataset.id);
        if (inv) this.showQuickPayModal(inv);
      };
    });

    // Edit Invoice
    qsa(".btn-edit-invoice", this.container).forEach(btn => {
      btn.onclick = () => {
        const inv = stateStore.state.invoices.find(i => i.id === btn.dataset.id);
        if (inv) this.showInvoiceModal(inv);
      };
    });

    // Delete Invoice
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
                        <th class="text-right">Tổng Tiền (VNĐ)</th>
                        <th class="text-right">Đã Trả (VNĐ)</th>
                        <th>Hàng Hóa / Ghi Chú</th>
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
                          <td class="text-right font-mono font-bold">${formatCurrency(inv.totalAmount)}</td>
                          <td class="text-right font-mono text-success">${inv.paidAmount > 0 ? formatCurrency(inv.paidAmount) : "-"}</td>
                          <td>
                            <div style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(inv.itemName)}">
                              ${escapeHtml(inv.itemName)}
                            </div>
                            ${inv.notes ? `<div style="font-size: 0.7rem; color: var(--text-muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(inv.notes)}">${escapeHtml(inv.notes)}</div>` : ''}
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
            <input type="text" class="form-control font-mono" id="inv-number" required value="${escapeHtml(invoice ? invoice.invoiceNumber : `HD-${Date.now().toString().slice(-6)}`)}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Hàng Hóa / Dịch Vụ / Mục Đích Hóa Đơn <span class="required">*</span></label>
          <input type="text" class="form-control" id="inv-item-name" required value="${escapeHtml(invoice ? (invoice.itemName || invoice.title || '') : '')}" placeholder="VD: Cung cấp bản quyền phần mềm ERP, Xuất 50 máy tính Dell, Bảo trì Q1...">
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

        <div class="form-group">
          <label class="form-label">Tổng Tiền Hóa Đơn (VNĐ) <span class="required">*</span></label>
          <div class="input-group">
            <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="inv-total-amount" value="${invoice ? formatCurrency(invoice.totalAmount, false) : ''}" placeholder="0" required>
            <span class="input-group-text">VNĐ</span>
          </div>
          <div class="currency-preview-text" id="inv-total-amount-preview"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Diễn Giải / Ghi Chú Thêm</label>
          <textarea class="form-control" id="inv-notes" placeholder="Chi tiết hợp đồng, điều khoản giao hàng, ghi chú nội bộ...">${escapeHtml(invoice ? invoice.notes : '')}</textarea>
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
        qs("#btn-save-invoice", footer).onclick = () => {
          const partnerId = qs("#inv-partner", body).value;
          const selectedPartner = partners.find(p => p.id === partnerId);
          const itemName = qs("#inv-item-name", body).value.trim();

          if (!itemName) {
            Toast.warning("Vui lòng nhập tên hàng hóa / dịch vụ hoặc mục đích hóa đơn!");
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
            totalAmount: parseCurrency(qs("#inv-total-amount", body).value),
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

    const bodyHtml = `
      <div style="background: var(--bg-surface-subtle); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
        <div style="font-weight: 600;">${isReceivable ? 'Thu tiền từ' : 'Chi trả cho'}: ${escapeHtml(invoice.partnerName)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Hóa đơn: <b>${escapeHtml(invoice.invoiceNumber)}</b> | Còn nợ: <b class="font-mono ${isReceivable ? 'text-primary' : 'text-warning'}">${formatCurrency(remaining)}</b></div>
      </div>

      <form id="quick-pay-form">
        <div class="form-group">
          <label class="form-label">Số Tiền Thanh Toán (VNĐ) <span class="required">*</span></label>
          <div class="input-group">
            <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="qp-amount" value="${formatCurrency(remaining, false)}" placeholder="0" required>
            <span class="input-group-text">VNĐ</span>
          </div>
          <div class="currency-preview-text" id="qp-amount-preview"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Ngày Thanh Toán</label>
            <input type="date" class="form-control" id="qp-date" value="${toInputDateFormat(new Date())}">
          </div>
          <div class="form-group">
            <label class="form-label">Phương Thức</label>
            <select class="form-select" id="qp-method">
              <option value="${PAYMENT_METHODS.BANK_TRANSFER}">Chuyển khoản</option>
              <option value="${PAYMENT_METHODS.CASH}">Tiền mặt</option>
            </select>
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
      <button class="btn btn-success" id="btn-confirm-quick-pay">Xác Nhận Thanh Toán</button>
    `;

    Modal.open({
      title: isReceivable ? "Lập Phiếu Thu Tiền" : "Lập Phiếu Chi Thanh Toán",
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        qs("#btn-confirm-quick-pay", footer).onclick = () => {
          const amount = parseCurrency(qs("#qp-amount", body).value);
          if (amount <= 0 || amount > remaining) {
            Toast.warning(`Số tiền thanh toán phải từ 1 đến ${formatCurrency(remaining)}!`);
            return;
          }

          const paymentData = {
            paymentNumber: isReceivable ? `PT-${Date.now().toString().slice(-6)}` : `PC-${Date.now().toString().slice(-6)}`,
            type: isReceivable ? "RECEIPT" : "PAYMENT",
            partnerId: invoice.partnerId,
            partnerName: invoice.partnerName,
            paymentDate: qs("#qp-date", body).value,
            paymentMethod: qs("#qp-method", body).value,
            amount,
            notes: qs("#qp-notes", body).value.trim(),
            allocations: [
              { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount }
            ]
          };

          stateStore.addPayment(paymentData);
          Toast.success(`Đã ghi nhận thanh toán ${formatCurrency(amount)} thành công!`);
          Modal.close();
        };
      }
    });
  }
}
