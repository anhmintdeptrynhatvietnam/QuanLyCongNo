/**
 * PAYMENTS VIEW - QUẢN LÝ CÔNG NỢ
 * Quản lý Phiếu Thu (tiền về từ khách) & Phiếu Chi (thanh toán cho NCC), khớp nợ tự động FIFO.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { formatCurrency, formatDate, toInputDateFormat, parseCurrency, formatCurrencyNumber } from '../utils/formatters.js';
import { PAYMENT_TYPES, PAYMENT_TYPE_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, INVOICE_TYPES } from '../config.js';
import { autoAllocatePaymentFIFO } from '../services/debt-engine.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';

export class PaymentsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.currentTypeFilter = "ALL";
  }

  render(state) {
    let filteredPayments = state.payments;

    if (this.currentTypeFilter !== "ALL") {
      filteredPayments = filteredPayments.filter(p => p.type === this.currentTypeFilter);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filteredPayments = filteredPayments.filter(p =>
        (p.paymentNumber && p.paymentNumber.toLowerCase().includes(q)) ||
        (p.partnerName && p.partnerName.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
    }

    return `
      <!-- Action Header -->
      <div class="action-header">
        <div class="filter-group">
          <button class="btn btn-sm ${this.currentTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="ALL">
            Tất Cả (${state.payments.length})
          </button>
          <button class="btn btn-sm ${this.currentTypeFilter === PAYMENT_TYPES.RECEIPT ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${PAYMENT_TYPES.RECEIPT}">
            Phiếu Thu (${state.payments.filter(p => p.type === PAYMENT_TYPES.RECEIPT).length})
          </button>
          <button class="btn btn-sm ${this.currentTypeFilter === PAYMENT_TYPES.PAYMENT ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${PAYMENT_TYPES.PAYMENT}">
            Phiếu Chi (${state.payments.filter(p => p.type === PAYMENT_TYPES.PAYMENT).length})
          </button>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-success" id="btn-add-receipt">
            <i data-lucide="arrow-down-left"></i>
            <span>Lập Phiếu Thu</span>
          </button>
          <button class="btn btn-warning" id="btn-add-payment">
            <i data-lucide="arrow-up-right"></i>
            <span>Lập Phiếu Chi</span>
          </button>
        </div>
      </div>

      <!-- Payments Table -->
      <div class="table-container">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Số Phiếu</th>
                <th>Loại Phiếu</th>
                <th>Đối Tác</th>
                <th>Ngày Thanh Toán</th>
                <th>Hình Thức</th>
                <th class="text-right">Số Tiền</th>
                <th>Hóa Đơn Cấn Trừ</th>
                <th class="text-center" style="width: 80px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPayments.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    Không có phiếu thu/chi nào trong danh sách.
                  </td>
                </tr>
              ` : filteredPayments.map(p => {
                const isReceipt = p.type === PAYMENT_TYPES.RECEIPT;
                const allocations = p.allocations || [];

                return `
                  <tr>
                    <td>
                      <div class="font-mono font-bold" style="color: ${isReceipt ? 'var(--success-600)' : 'var(--warning-600)'};">
                        ${escapeHtml(p.paymentNumber)}
                      </div>
                    </td>
                    <td>
                      <span class="badge ${isReceipt ? 'badge-paid' : 'badge-partial'}">
                        ${isReceipt ? 'Phiếu Thu (Tiền về)' : 'Phiếu Chi (Trả tiền)'}
                      </span>
                    </td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(p.partnerName)}</div>
                      ${p.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(p.notes)}</div>` : ''}
                    </td>
                    <td>${formatDate(p.paymentDate)}</td>
                    <td>
                      <span style="font-size: 0.8rem; color: var(--text-muted);">
                        ${PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod || 'Chuyển khoản'}
                      </span>
                    </td>
                    <td class="text-right font-mono font-bold ${isReceipt ? 'text-success' : 'text-warning'}">
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
                      <button class="btn btn-icon btn-sm btn-delete-payment text-danger" data-id="${p.id}" title="Hủy phiếu thanh toán">
                        <i data-lucide="trash-2"></i>
                      </button>
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
    qsa("[data-pay-filter]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.currentTypeFilter = btn.dataset.payFilter;
        this.mount(stateStore.state);
      };
    });

    // Add Receipt
    const addReceiptBtn = qs("#btn-add-receipt", this.container);
    if (addReceiptBtn) {
      addReceiptBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.RECEIPT);
    }

    // Add Payment
    const addPaymentBtn = qs("#btn-add-payment", this.container);
    if (addPaymentBtn) {
      addPaymentBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.PAYMENT);
    }

    // Delete Payment
    qsa(".btn-delete-payment", this.container).forEach(btn => {
      btn.onclick = () => {
        const pay = stateStore.state.payments.find(p => p.id === btn.dataset.id);
        if (!pay) return;
        if (confirm(`Bạn có chắc muốn hủy phiếu ${pay.paymentNumber}? Các hóa đơn liên quan sẽ được hoàn nợ.`)) {
          try {
            stateStore.deletePayment(pay.id);
            Toast.success("Đã hủy phiếu thanh toán!");
          } catch (err) {
            Toast.error(err.message);
          }
        }
      };
    });
  }

  showPaymentModal(type = PAYMENT_TYPES.RECEIPT) {
    const isReceipt = type === PAYMENT_TYPES.RECEIPT;
    const invoiceType = isReceipt ? INVOICE_TYPES.RECEIVABLE : INVOICE_TYPES.PAYABLE;
    const partners = stateStore.state.partners;

    if (partners.length === 0) {
      Toast.warning("Chưa có danh sách đối tác!");
      return;
    }

    const todayStr = toInputDateFormat(new Date());

    const bodyHtml = `
      <form id="payment-form">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Loại Phiếu</label>
            <input type="text" class="form-control" readonly value="${isReceipt ? 'Phiếu Thu (Thu tiền khách)' : 'Phiếu Chi (Trả tiền NCC)'}">
          </div>
          <div class="form-group">
            <label class="form-label">Số Phiếu <span class="required">*</span></label>
            <input type="text" class="form-control" id="pay-number" required value="${isReceipt ? `PT-${Date.now().toString().slice(-6)}` : `PC-${Date.now().toString().slice(-6)}`}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Đối Tác Thanh Toán <span class="required">*</span></label>
          <select class="form-select" id="pay-partner">
            ${partners.map(p => `
              <option value="${p.id}">
                ${escapeHtml(p.name)} (${p.code || p.id}) - Còn nợ: ${formatCurrency(isReceipt ? p.totalReceivable : p.totalPayable)}
              </option>
            `).join("")}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Số Tiền Thanh Toán (VNĐ) <span class="required">*</span></label>
            <div class="input-group">
              <input type="text" inputmode="numeric" class="form-control font-mono currency-input" id="pay-amount" value="" placeholder="0" required>
              <span class="input-group-text">VNĐ</span>
            </div>
            <div class="currency-preview-text" id="pay-amount-preview"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Phương Thức Thanh Toán</label>
            <select class="form-select" id="pay-method">
              <option value="${PAYMENT_METHODS.BANK_TRANSFER}">Chuyển khoản</option>
              <option value="${PAYMENT_METHODS.CASH}">Tiền mặt</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Ngày Thanh Toán <span class="required">*</span></label>
          <input type="date" class="form-control" id="pay-date" value="${todayStr}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Nội Dung / Diễn Giải</label>
          <input type="text" class="form-control" id="pay-notes" placeholder="VD: Thanh toán công nợ theo hợp đồng">
        </div>

        <div style="background: var(--bg-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); font-size: 0.8rem; color: var(--text-muted);">
          <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle;"></i>
          Hệ thống sẽ <b>tự động cấn trừ (FIFO)</b> vào các hóa đơn còn nợ cũ nhất của đối tác này.
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn ${isReceipt ? 'btn-success' : 'btn-warning'}" id="btn-save-payment">Ghi Nhận Thanh Toán</button>
    `;

    Modal.open({
      title: isReceipt ? "Lập Phiếu Thu Tiền Mới" : "Lập Phiếu Chi Thanh Toán Mới",
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        qs("#btn-save-payment", footer).onclick = () => {
          const partnerId = qs("#pay-partner", body).value;
          const selectedPartner = partners.find(p => p.id === partnerId);
          const amount = parseCurrency(qs("#pay-amount", body).value);

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
            paymentNumber: qs("#pay-number", body).value.trim(),
            type,
            partnerId,
            partnerName: selectedPartner ? selectedPartner.name : "",
            paymentDate: qs("#pay-date", body).value,
            paymentMethod: qs("#pay-method", body).value,
            amount,
            notes: qs("#pay-notes", body).value.trim(),
            allocations
          };

          stateStore.addPayment(paymentData);
          Toast.success(`Đã lập ${isReceipt ? 'Phiếu Thu' : 'Phiếu Chi'} thành công!`);
          Modal.close();
        };
      }
    });
  }
}
