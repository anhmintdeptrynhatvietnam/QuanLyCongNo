/**
 * PARTNERS VIEW - QUẢN LÝ CÔNG NỢ
 * Quản lý danh bạ Khách hàng & Nhà cung cấp, theo dõi hạn mức tín dụng, sổ chi tiết công nợ.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { PARTNER_TYPES, PARTNER_TYPE_LABELS } from '../config.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';

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

        <button class="btn btn-primary" id="btn-add-partner">
          <i data-lucide="user-plus"></i>
          <span>Thêm Đối Tác</span>
        </button>
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

  showPartnerModal(partner = null) {
    const isEdit = !!partner;
    const title = isEdit ? "Chỉnh Sửa Thông Tin Đối Tác" : "Thêm Mới Khách Hàng / Nhà Cung Cấp";

    const bodyHtml = `
      <form id="partner-form">
        <div class="form-group">
          <label class="form-label">Tên Đối Tác <span class="required">*</span></label>
          <input type="text" class="form-control" id="p-name" required value="${escapeHtml(partner ? partner.name : '')}" placeholder="VD: Công ty Cổ phần Vinamilk">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Mã Đối Tác</label>
            <input type="text" class="form-control" id="p-code" value="${escapeHtml(partner ? (partner.code || partner.id) : '')}" placeholder="VD: KH-VINAMILK">
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
            <input type="text" class="form-control" id="p-tax" value="${escapeHtml(partner ? partner.taxCode : '')}" placeholder="0108999888">
          </div>
          <div class="form-group">
            <label class="form-label">Số Điện Thoại</label>
            <input type="text" class="form-control" id="p-phone" value="${escapeHtml(partner ? partner.phone : '')}" placeholder="024.7300.7300">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Hạn Mức Tín Dụng (VNĐ)</label>
            <input type="number" class="form-control" id="p-credit-limit" value="${partner ? partner.creditLimit || 0 : 500000000}" step="10000000">
          </div>
          <div class="form-group">
            <label class="form-label">Số Ngày Được Nợ (Ngày)</label>
            <input type="number" class="form-control" id="p-term-days" value="${partner ? partner.creditTermDays || 30 : 30}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Địa Chỉ</label>
          <input type="text" class="form-control" id="p-address" value="${escapeHtml(partner ? partner.address : '')}" placeholder="Địa chỉ trụ sở">
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
            creditLimit: Number(qs("#p-credit-limit", body).value) || 0,
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
