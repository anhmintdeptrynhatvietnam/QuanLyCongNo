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

export class PaymentsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.currentTypeFilter = "ALL";
  }

  render(state) {
    let filteredPayments = state.payments;

    // Lọc theo loại chứng từ
    if (this.currentTypeFilter !== "ALL") {
      filteredPayments = filteredPayments.filter(p => {
        const vType = p.voucherType || getVoucherType(p.type, p.paymentMethod);
        return vType === this.currentTypeFilter;
      });
    }

    // Lọc tìm kiếm
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filteredPayments = filteredPayments.filter(p =>
        (p.paymentNumber && p.paymentNumber.toLowerCase().includes(q)) ||
        (p.partnerName && p.partnerName.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)) ||
        (p.bankName && p.bankName.toLowerCase().includes(q)) ||
        (p.bankAccount && p.bankAccount.toLowerCase().includes(q))
      );
    }

    const countByType = {
      pt: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.RECEIPT_CASH).length,
      unt: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.RECEIPT_BANK).length,
      pc: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.PAYMENT_CASH).length,
      unc: state.payments.filter(p => (p.voucherType || getVoucherType(p.type, p.paymentMethod)) === VOUCHER_TYPES.PAYMENT_BANK).length
    };

    return `
      <!-- Action Header -->
      <div class="action-header">
        <div class="filter-group">
          <button class="btn btn-sm ${this.currentTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="ALL">
            Tất Cả (${state.payments.length})
          </button>
          <button class="btn btn-sm ${this.currentTypeFilter === VOUCHER_TYPES.RECEIPT_CASH ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.RECEIPT_CASH}">
            <span class="badge-dot" style="background: var(--success-600);"></span>
            Phiếu Thu (${countByType.pt})
          </button>
          <button class="btn btn-sm ${this.currentTypeFilter === VOUCHER_TYPES.RECEIPT_BANK ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.RECEIPT_BANK}">
            <span class="badge-dot" style="background: var(--info-600);"></span>
            Ủy Nhiệm Thu / Báo Có (${countByType.unt})
          </button>
          <button class="btn btn-sm ${this.currentTypeFilter === VOUCHER_TYPES.PAYMENT_CASH ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.PAYMENT_CASH}">
            <span class="badge-dot" style="background: var(--warning-600);"></span>
            Phiếu Chi (${countByType.pc})
          </button>
          <button class="btn btn-sm ${this.currentTypeFilter === VOUCHER_TYPES.PAYMENT_BANK ? 'btn-primary' : 'btn-secondary'}" data-pay-filter="${VOUCHER_TYPES.PAYMENT_BANK}">
            <span class="badge-dot" style="background: var(--primary-700);"></span>
            Ủy Nhiệm Chi (${countByType.unc})
          </button>
        </div>

        <div class="flex gap-2 flex-wrap">
          <!-- Nhóm Nút Thu Tiền -->
          <div class="btn-group-dropdown">
            <button class="btn btn-success btn-sm" id="btn-add-receipt-cash" title="Thu tiền mặt tại quỹ">
              <i data-lucide="arrow-down-left"></i>
              <span>+ Phiếu Thu (Tiền mặt)</span>
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-add-receipt-bank" style="color: var(--info-700); border-color: var(--info-500);" title="Thu tiền về tài khoản ngân hàng">
              <i data-lucide="building-2"></i>
              <span>+ Báo Có / Thu TK (UNT)</span>
            </button>
          </div>

          <!-- Nhóm Nút Chi Tiền -->
          <div class="btn-group-dropdown">
            <button class="btn btn-warning btn-sm" id="btn-add-payment-cash" title="Chi tiền mặt tại quỹ">
              <i data-lucide="arrow-up-right"></i>
              <span>+ Phiếu Chi (Tiền mặt)</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-add-payment-bank" title="Ủy nhiệm chi ngân hàng thanh toán cho đối tác">
              <i data-lucide="send"></i>
              <span>+ Lập Ủy Nhiệm Chi (UNC)</span>
            </button>
          </div>
        </div>
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
                  badgeHtml = `<span class="badge" style="background: rgba(14, 165, 233, 0.12); color: #0369a1; border: 1px solid rgba(14, 165, 233, 0.25);"><i data-lucide="building-2" style="width: 12px; height: 12px;"></i> Báo Có / UNT</span>`;
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
    // 1. Bộ lọc click
    qsa("[data-pay-filter]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.currentTypeFilter = btn.dataset.payFilter;
        this.mount(stateStore.state);
      };
    });

    // 2. Nút Thêm mới từng loại chứng từ
    const addPtBtn = qs("#btn-add-receipt-cash", this.container);
    if (addPtBtn) addPtBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.RECEIPT, PAYMENT_METHODS.CASH);

    const addUntBtn = qs("#btn-add-receipt-bank", this.container);
    if (addUntBtn) addUntBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.RECEIPT, PAYMENT_METHODS.BANK_TRANSFER);

    const addPcBtn = qs("#btn-add-payment-cash", this.container);
    if (addPcBtn) addPcBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.PAYMENT, PAYMENT_METHODS.CASH);

    const addUncBtn = qs("#btn-add-payment-bank", this.container);
    if (addUncBtn) addUncBtn.onclick = () => this.showPaymentModal(PAYMENT_TYPES.PAYMENT, PAYMENT_METHODS.BANK_TRANSFER);

    // 3. In chứng từ
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
          title = `In Báo Có / Ủy Nhiệm Thu (${pay.paymentNumber})`;
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

    // 4. Xóa / Hủy chứng từ
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
