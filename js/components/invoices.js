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
import { qs, qsa, escapeHtml } from '../utils/dom.js';

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
