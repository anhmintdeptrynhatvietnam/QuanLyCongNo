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

export class PartnersView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.currentFilter = "ALL";
  }

  render(state) {
    let filteredPartners = state.partners;

    if (this.currentFilter !== "ALL") {
      filteredPartners = filteredPartners.filter(p => p.type === this.currentFilter || p.type === PARTNER_TYPES.BOTH);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filteredPartners = filteredPartners.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.taxCode && p.taxCode.includes(q))
      );
    }

    return `
      <!-- Action Header -->
      <div class="action-header">
        <div class="filter-group">
          <button class="btn btn-sm ${this.currentFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-partner-filter="ALL">
            Tất Cả (${state.partners.length})
          </button>
          <button class="btn btn-sm ${this.currentFilter === PARTNER_TYPES.CUSTOMER ? 'btn-primary' : 'btn-secondary'}" data-partner-filter="${PARTNER_TYPES.CUSTOMER}">
            Khách Hàng (${state.partners.filter(p => p.type === PARTNER_TYPES.CUSTOMER || p.type === PARTNER_TYPES.BOTH).length})
          </button>
          <button class="btn btn-sm ${this.currentFilter === PARTNER_TYPES.VENDOR ? 'btn-primary' : 'btn-secondary'}" data-partner-filter="${PARTNER_TYPES.VENDOR}">
            Nhà Cung Cấp (${state.partners.filter(p => p.type === PARTNER_TYPES.VENDOR || p.type === PARTNER_TYPES.BOTH).length})
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button class="btn btn-secondary" id="btn-import-partners-excel" title="Nhập danh bạ đối tác hàng loạt từ file Excel">
            <i data-lucide="file-spreadsheet"></i>
            <span>Nhập Từ Excel</span>
          </button>
          <button class="btn btn-primary" id="btn-add-partner">
            <i data-lucide="user-plus"></i>
            <span>Thêm Đối Tác</span>
          </button>
        </div>
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
                    Không tìm thấy đối tác nào phù hợp.
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
    // Filter click
    qsa("[data-partner-filter]", this.container).forEach(btn => {
      btn.onclick = (e) => {
        this.currentFilter = btn.dataset.partnerFilter;
        this.mount(stateStore.state);
      };
    });

    // Add partner click
    const addBtn = qs("#btn-add-partner", this.container);
    if (addBtn) {
      addBtn.onclick = () => this.showPartnerModal();
    }

    // Import Excel click
    const importExcelBtn = qs("#btn-import-partners-excel", this.container);
    if (importExcelBtn) {
      importExcelBtn.onclick = () => this.showImportExcelModal();
    }

    // Edit partner click
    qsa(".btn-edit-partner", this.container).forEach(btn => {
      btn.onclick = () => {
        const partner = stateStore.state.partners.find(p => p.id === btn.dataset.id);
        if (partner) this.showPartnerModal(partner);
      };
    });

    // Delete partner click
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
        <div class="excel-dropzone" id="excel-dropzone">
          <input type="file" id="excel-file-input" accept=".xlsx, .xls, .csv" style="display: none;">
          <i data-lucide="file-up" class="excel-dropzone-icon"></i>
          <div class="excel-dropzone-title">Kéo thả file Excel vào đây hoặc <span style="color: var(--primary-600); text-decoration: underline;">chọn từ máy tính</span></div>
          <div class="excel-dropzone-sub">Hỗ trợ định dạng .xlsx, .xls, .csv (Tối đa 5.000 dòng)</div>
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
      onOpen: (body, footer) => {
        const downloadBtn = qs("#btn-download-partner-template", body);
        const dropzone = qs("#excel-dropzone", body);
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
            }
          };
        }

        const handleFile = async (file) => {
          try {
            dropzone.innerHTML = `<div style="font-size: 0.9rem; font-weight: 600; color: var(--primary-600);"><i data-lucide="loader-2"></i> Đang đọc file "${escapeHtml(file.name)}"...</div>`;
            refreshLucideIcons();

            parsedResult = await ExportService.parsePartnersFromExcel(file);
            const { partners, summary } = parsedResult;

            if (summary.valid === 0) {
              Toast.warning("Không tìm thấy dòng dữ liệu đối tác hợp lệ nào trong file!");
            } else {
              Toast.success(`Đã đọc ${summary.total} dòng (${summary.valid} hợp lệ)!`);
            }

            // Render preview table
            previewArea.style.display = "block";
            previewArea.innerHTML = `
              <div class="excel-preview-box">
                <div class="excel-preview-header">
                  <div style="font-weight: 600; font-size: 0.85rem;">
                    Bảng xem trước dữ liệu (${summary.valid}/${summary.total} dòng hợp lệ)
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
                        <tr style="${p.isValid ? '' : 'background: rgba(239, 68, 68, 0.05);'}">
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
                            ${p.isValid ? `
                              <span class="validation-tag-ok"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Hợp lệ</span>
                            ` : `
                              <span class="validation-tag-err" title="${escapeHtml(p.error)}"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> ${escapeHtml(p.error)}</span>
                            `}
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              </div>
            `;

            // Reset dropzone state
            dropzone.innerHTML = `
              <i data-lucide="file-check" class="excel-dropzone-icon" style="color: var(--success-600);"></i>
              <div class="excel-dropzone-title">Đã chọn: <b>${escapeHtml(file.name)}</b></div>
              <div class="excel-dropzone-sub">Bấm vào đây để chọn lại file khác</div>
            `;
            refreshLucideIcons();

            // Enable confirm button if valid rows exist
            if (summary.valid > 0) {
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = `<i data-lucide="upload"></i><span>Nhập ${summary.valid} Đối Tác Vào Hệ Thống</span>`;
              refreshLucideIcons();
            } else {
              confirmBtn.disabled = true;
            }
          } catch (err) {
            Toast.error(err.message);
            dropzone.innerHTML = `
              <i data-lucide="file-up" class="excel-dropzone-icon"></i>
              <div class="excel-dropzone-title">Kéo thả file Excel vào đây hoặc <span style="color: var(--primary-600); text-decoration: underline;">chọn từ máy tính</span></div>
              <div class="excel-dropzone-sub">Hỗ trợ định dạng .xlsx, .xls, .csv</div>
            `;
            refreshLucideIcons();
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

            stateStore.addPartnersBatch(validPartners);
            Toast.success(`Đã nhập thành công ${validPartners.length} đối tác vào hệ thống!`);
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
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Mã Đối Tác</label>
            <input type="text" class="form-control" id="p-code" value="${escapeHtml(partner ? (partner.code || partner.id) : '')}" placeholder="VD: KH-ABC01">
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
        qs("#btn-save-partner", footer).onclick = () => {
          const name = qs("#p-name", body).value.trim();
          if (!name) {
            Toast.warning("Vui lòng nhập tên đối tác!");
            return;
          }

          const partnerData = {
            name,
            code: qs("#p-code", body).value.trim() || `P-${Date.now().toString(36).toUpperCase()}`,
            type: qs("#p-type", body).value,
            taxCode: qs("#p-tax", body).value.trim(),
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
