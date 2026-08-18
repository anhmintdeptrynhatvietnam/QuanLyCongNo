/**
 * PAYMENT REQUESTS VIEW - QUẢN LÝ CÔNG NỢ
 * Quản lý Giấy Đề Nghị Thanh Toán (Payment Requests):
 * - Lập đề nghị thanh toán cho Hóa đơn nợ NCC
 * - Phê duyệt đề nghị & Chuyển đổi 1-Click sang Ủy Nhiệm Chi (UNC) hoặc Phiếu Chi (PC)
 * - In biểu mẫu Giấy Đề Nghị Thanh Toán chuẩn doanh nghiệp (A4).
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { VoucherTemplates } from '../services/voucher-templates.js';
import { formatCurrency, formatDate, toInputDateFormat, parseCurrency, formatCurrencyNumber } from '../utils/formatters.js';
import { 
  PAYMENT_REQUEST_STATUS, 
  PAYMENT_REQUEST_STATUS_LABELS, 
  PAYMENT_METHODS, 
  PAYMENT_METHOD_LABELS,
  PARTNER_TYPES,
  INVOICE_TYPES
} from '../config.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';

export class PaymentRequestsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.currentStatusFilter = "ALL";
  }

  render(state) {
    let filteredRequests = state.paymentRequests || [];

    if (this.currentStatusFilter !== "ALL") {
      filteredRequests = filteredRequests.filter(r => r.status === this.currentStatusFilter);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filteredRequests = filteredRequests.filter(r =>
        (r.requestNumber && r.requestNumber.toLowerCase().includes(q)) ||
        (r.partnerName && r.partnerName.toLowerCase().includes(q)) ||
        (r.requesterName && r.requesterName.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q))
      );
    }

    const allRequests = state.paymentRequests || [];
    const countPending = allRequests.filter(r => r.status === PAYMENT_REQUEST_STATUS.PENDING).length;
    const countApproved = allRequests.filter(r => r.status === PAYMENT_REQUEST_STATUS.APPROVED).length;
    const countPaid = allRequests.filter(r => r.status === PAYMENT_REQUEST_STATUS.PAID).length;
    const totalAmount = allRequests.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    return `
      <!-- Stats Summary -->
      <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: var(--space-5);">
        <div class="kpi-card" style="padding: var(--space-4);">
          <div class="kpi-title">Tổng Đề Nghị</div>
          <div class="kpi-value font-mono" style="font-size: 1.3rem;">${allRequests.length}</div>
          <div class="kpi-footer">Tổng trị giá: <b class="font-mono">${formatCurrency(totalAmount)}</b></div>
        </div>

        <div class="kpi-card kpi-payable" style="padding: var(--space-4);">
          <div class="kpi-title">Chờ Phê Duyệt</div>
          <div class="kpi-value font-mono text-warning" style="font-size: 1.3rem;">${countPending}</div>
          <div class="kpi-footer">Cần Ban Giám Đốc duyệt chi</div>
        </div>

        <div class="kpi-card kpi-forecast" style="padding: var(--space-4);">
          <div class="kpi-title">Đã Duyệt (Chờ Chi)</div>
          <div class="kpi-value font-mono text-primary" style="font-size: 1.3rem;">${countApproved}</div>
          <div class="kpi-footer">Sẵn sàng xuất UNC / Chi tiền</div>
        </div>

        <div class="kpi-card kpi-receivable" style="padding: var(--space-4);">
          <div class="kpi-title">Đã Thanh Toán</div>
          <div class="kpi-value font-mono text-success" style="font-size: 1.3rem;">${countPaid}</div>
          <div class="kpi-footer">Đã cấn trừ công nợ</div>
        </div>
      </div>

      <!-- Action Header -->
      <div class="action-header">
        <div class="filter-group">
          <button class="btn btn-sm ${this.currentStatusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" data-req-filter="ALL">
            Tất Cả (${allRequests.length})
          </button>
          <button class="btn btn-sm ${this.currentStatusFilter === PAYMENT_REQUEST_STATUS.PENDING ? 'btn-primary' : 'btn-secondary'}" data-req-filter="${PAYMENT_REQUEST_STATUS.PENDING}">
            <span class="badge-dot" style="background: var(--warning-500);"></span>
            Chờ Duyệt (${countPending})
          </button>
          <button class="btn btn-sm ${this.currentStatusFilter === PAYMENT_REQUEST_STATUS.APPROVED ? 'btn-primary' : 'btn-secondary'}" data-req-filter="${PAYMENT_REQUEST_STATUS.APPROVED}">
            <span class="badge-dot" style="background: var(--primary-500);"></span>
            Đã Duyệt (${countApproved})
          </button>
          <button class="btn btn-sm ${this.currentStatusFilter === PAYMENT_REQUEST_STATUS.PAID ? 'btn-primary' : 'btn-secondary'}" data-req-filter="${PAYMENT_REQUEST_STATUS.PAID}">
            <span class="badge-dot" style="background: var(--success-500);"></span>
            Đã Thanh Toán (${countPaid})
          </button>
        </div>

        <button class="btn btn-primary" id="btn-add-payment-request">
          <i data-lucide="plus-circle"></i>
          <span>Lập Giấy Đề Nghị Thanh Toán</span>
        </button>
      </div>

      <!-- Payment Requests Table -->
      <div class="table-container">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 120px;">Số ĐNTT</th>
                <th style="width: 110px;">Ngày Lập</th>
                <th>Người Đề Nghị</th>
                <th>Đơn Vị Thụ Hưởng</th>
                <th style="width: 120px;">Hình Thức</th>
                <th class="text-right" style="width: 140px;">Số Tiền Đề Nghị</th>
                <th style="width: 130px;" class="text-center">Trạng Thái</th>
                <th class="text-center" style="width: 130px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRequests.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <i data-lucide="clipboard-list" style="width: 36px; height: 36px; margin-bottom: 8px; color: var(--text-muted); opacity: 0.5;"></i>
                    <p>Không có Giấy Đề Nghị Thanh Toán nào.</p>
                  </td>
                </tr>
              ` : filteredRequests.map(r => {
                const isPaid = r.status === PAYMENT_REQUEST_STATUS.PAID;
                const isApproved = r.status === PAYMENT_REQUEST_STATUS.APPROVED;
                const isPending = r.status === PAYMENT_REQUEST_STATUS.PENDING;
                const isRejected = r.status === PAYMENT_REQUEST_STATUS.REJECTED;

                let statusBadge = '';
                if (isPaid) {
                  statusBadge = `<span class="badge badge-paid"><i data-lucide="check-check" style="width: 11px; height: 11px;"></i> Đã Chi Tiền</span>`;
                } else if (isApproved) {
                  statusBadge = `<span class="badge badge-unpaid"><i data-lucide="check" style="width: 11px; height: 11px;"></i> Đã Duyệt Chi</span>`;
                } else if (isPending) {
                  statusBadge = `<span class="badge badge-partial"><i data-lucide="clock" style="width: 11px; height: 11px;"></i> Chờ Phê Duyệt</span>`;
                } else {
                  statusBadge = `<span class="badge badge-overdue"><i data-lucide="x" style="width: 11px; height: 11px;"></i> Từ Chối</span>`;
                }

                return `
                  <tr>
                    <td>
                      <div class="font-mono font-bold text-primary">
                        ${escapeHtml(r.requestNumber)}
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">Hạn: ${formatDate(r.deadlineDate)}</div>
                    </td>
                    <td>${formatDate(r.requestDate)}</td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(r.requesterName || "Kế toán")}</div>
                      ${r.department ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(r.department)}</div>` : ''}
                    </td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(r.partnerName)}</div>
                      ${r.bankName ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(r.bankName)} - TK: ${escapeHtml(r.bankAccount || '-')}</div>` : ''}
                      ${r.reason ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">${escapeHtml(r.reason)}</div>` : ''}
                    </td>
                    <td>
                      <span style="font-size: 0.8rem; font-weight: 500;">
                        ${r.paymentMethod === PAYMENT_METHODS.CASH ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}
                      </span>
                    </td>
                    <td class="text-right font-mono font-bold text-primary">
                      ${formatCurrency(r.amount)}
                    </td>
                    <td class="text-center">
                      ${statusBadge}
                    </td>
                    <td class="text-center">
                      <div class="flex items-center justify-center gap-1">
                        <!-- Nút In Giấy ĐNTT -->
                        <button class="btn btn-icon btn-sm btn-print-request text-primary" data-id="${r.id}" title="Xem & In Giấy Đề Nghị (A4)">
                          <i data-lucide="printer"></i>
                        </button>

                        <!-- Nút Duyệt & Chi Tiền (Chỉ khi chưa chi) -->
                        ${!isPaid ? `
                          <button class="btn btn-icon btn-sm btn-execute-request text-success" data-id="${r.id}" title="${isApproved ? 'Xuất Ủy Nhiệm Chi / Chi tiền ngay' : 'Duyệt & Lập Ủy Nhiệm Chi'}">
                            <i data-lucide="${isApproved ? 'send' : 'check-circle-2'}"></i>
                          </button>
                        ` : ''}

                        <!-- Nút Xóa (Nếu chưa chi) -->
                        ${!isPaid ? `
                          <button class="btn btn-icon btn-sm btn-delete-request text-danger" data-id="${r.id}" title="Hủy / Xóa đề nghị">
                            <i data-lucide="trash-2"></i>
                          </button>
                        ` : ''}
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
    // 1. Filter buttons
    qsa("[data-req-filter]", this.container).forEach(btn => {
      btn.onclick = () => {
        this.currentStatusFilter = btn.dataset.reqFilter;
        this.mount(stateStore.state);
      };
    });

    // 2. Nút Thêm mới
    const addBtn = qs("#btn-add-payment-request", this.container);
    if (addBtn) {
      addBtn.onclick = () => this.showPaymentRequestModal();
    }

    // 3. In Giấy Đề Nghị Thanh Toán
    qsa(".btn-print-request", this.container).forEach(btn => {
      btn.onclick = () => {
        const req = stateStore.state.paymentRequests.find(r => r.id === btn.dataset.id);
        if (!req) return;

        const partner = stateStore.state.partners.find(p => p.id === req.partnerId) || { name: req.partnerName };
        const settings = stateStore.state.settings || {};
        
        // Lấy danh sách hóa đơn liên quan nếu có
        const invoiceList = (req.invoiceIds || []).map(id => stateStore.state.invoices.find(inv => inv.id === id)).filter(Boolean);

        const htmlContent = VoucherTemplates.renderPaymentRequestHTML(req, settings, partner, invoiceList);
        VoucherTemplates.openPreviewModal({
          title: `In Giấy Đề Nghị Thanh Toán (${req.requestNumber})`,
          htmlContent,
          printTitle: `${req.requestNumber}_De_Nghi_Thanh_Toan`
        });
      };
    });

    // 4. Duyệt & Chuyển sang UNC / Phiếu Chi
    qsa(".btn-execute-request", this.container).forEach(btn => {
      btn.onclick = () => {
        const req = stateStore.state.paymentRequests.find(r => r.id === btn.dataset.id);
        if (!req) return;
        this.confirmExecutePaymentRequest(req);
      };
    });

    // 5. Xóa đề nghị
    qsa(".btn-delete-request", this.container).forEach(btn => {
      btn.onclick = () => {
        const req = stateStore.state.paymentRequests.find(r => r.id === btn.dataset.id);
        if (!req) return;
        if (confirm(`Bạn có chắc muốn xóa Giấy Đề Nghị Thanh Toán ${req.requestNumber}?`)) {
          try {
            stateStore.deletePaymentRequest(req.id);
            Toast.success("Đã xóa Giấy Đề Nghị Thanh Toán!");
          } catch (err) {
            Toast.error(err.message);
          }
        }
      };
    });
  }

  /**
   * Modal tạo Giấy Đề Nghị Thanh Toán Mới
   */
  showPaymentRequestModal(preSelectedPartnerId = null) {
    const vendors = stateStore.state.partners.filter(p => p.type === PARTNER_TYPES.VENDOR || p.type === PARTNER_TYPES.BOTH || p.type === PARTNER_TYPES.CUSTOMER);
    
    if (vendors.length === 0) {
      Toast.warning("Chưa có danh sách đối tác!");
      return;
    }

    const todayStr = toInputDateFormat(new Date());
    const defaultNumber = `ĐNTT-${Date.now().toString().slice(-6)}`;
    const selectedPartner = vendors.find(p => p.id === preSelectedPartnerId) || vendors[0];

    const bodyHtml = `
      <form id="payment-request-form">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Số Giấy Đề Nghị <span class="required">*</span></label>
            <input type="text" class="form-control font-mono font-bold" id="pr-number" value="${defaultNumber}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Ngày Lập Đề Nghị <span class="required">*</span></label>
            <input type="date" class="form-control" id="pr-date" value="${todayStr}" required>
          </div>
        </div>

        <!-- Tùy Chọn Kính Gửi -->
        <div class="form-group">
          <label class="form-label">Kính Gửi (Cấp Phê Duyệt) <span class="required">*</span></label>
          <input type="text" class="form-control font-bold" id="pr-dear-to" value="Ban Giám Đốc - Phòng Kế Toán - Tài Chính" placeholder="VD: Ban Giám Đốc, Phòng Kế Toán - Tài Chính, Ban TGĐ..." required>
          <div class="flex gap-1" style="flex-wrap: wrap; margin-top: 4px;">
            <button type="button" class="btn btn-secondary btn-xs btn-quick-dear" data-text="Ban Giám Đốc - Phòng Kế Toán - Tài Chính" style="padding: 2px 6px; font-size: 0.72rem;">Ban Giám Đốc & Kế Toán</button>
            <button type="button" class="btn btn-secondary btn-xs btn-quick-dear" data-text="Ban Tổng Giám Đốc" style="padding: 2px 6px; font-size: 0.72rem;">Ban TGĐ</button>
            <button type="button" class="btn btn-secondary btn-xs btn-quick-dear" data-text="Phòng Kế Toán - Tài Chính" style="padding: 2px 6px; font-size: 0.72rem;">Phòng Kế Toán</button>
            <button type="button" class="btn btn-secondary btn-xs btn-quick-dear" data-text="Hội Đồng Quản Trị" style="padding: 2px 6px; font-size: 0.72rem;">HĐQT</button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Người Đề Nghị <span class="required">*</span></label>
            <input type="text" class="form-control" id="pr-requester" placeholder="VD: Nguyễn Văn A" value="Kế toán công nợ" required>
          </div>
          <div class="form-group">
            <label class="form-label">Bộ Phận / Phòng Ban</label>
            <input type="text" class="form-control" id="pr-dept" placeholder="VD: Phòng Kế toán / Mua hàng" value="Phòng Kế Toán">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Đơn Vị Thụ Hưởng (Đối Tác) <span class="required">*</span></label>
          <select class="form-select" id="pr-partner">
            ${vendors.map(p => `
              <option value="${p.id}" ${p.id === selectedPartner.id ? 'selected' : ''}>
                ${escapeHtml(p.name)} (${p.code || p.id}) - Còn nợ: ${formatCurrency(p.totalPayable || 0)}
              </option>
            `).join("")}
          </select>
        </div>

        <!-- Danh sách Hóa đơn nợ của đối tác -->
        <div class="form-group" id="pr-invoices-section">
          <label class="form-label" style="display: flex; justify-content: space-between;">
            <span>Chọn Hóa Đơn Cần Thanh Toán (Tùy chọn)</span>
            <span style="font-size: 0.75rem; color: var(--primary-600); cursor: pointer;" id="pr-select-all-inv">Chọn tất cả</span>
          </label>
          <div id="pr-invoices-list" style="max-height: 160px; overflow-y: auto; border: 1px solid var(--border-main); border-radius: var(--radius-md); padding: var(--space-2); background: var(--bg-surface-subtle);">
            <!-- Dynamic Invoices Loaded Here -->
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Số Tiền Đề Nghị Thanh Toán (VNĐ) <span class="required">*</span></label>
            <div class="input-group">
              <input type="text" inputmode="numeric" class="form-control font-mono font-bold currency-input" id="pr-amount" placeholder="0" required style="color: var(--primary-700);">
              <span class="input-group-text">VNĐ</span>
            </div>
            <div class="currency-preview-text" id="pr-amount-preview"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Hạn Thanh Toán Yêu Cầu <span class="required">*</span></label>
            <input type="date" class="form-control" id="pr-deadline" value="${todayStr}" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Hình Thức Thanh Toán <span class="required">*</span></label>
          <select class="form-select" id="pr-method">
            <option value="${PAYMENT_METHODS.BANK_TRANSFER}">🏦 Chuyển khoản ngân hàng (Xuất Ủy Nhiệm Chi UNC)</option>
            <option value="${PAYMENT_METHODS.CASH}">💵 Tiền mặt (Xuất Phiếu Chi PC - Chỉ áp dụng dưới 5 triệu)</option>
          </select>
          <div style="font-size: 0.725rem; color: #b45309; margin-top: 3px;">
            * Quy định kế toán: Thanh toán từ 5.000.000 VNĐ trở lên bắt buộc Chuyển khoản ngân hàng.
          </div>
        </div>

        <!-- Thông tin Ngân hàng Thụ Hưởng (Cố định theo đối tác) -->
        <div id="pr-bank-fields" style="background: var(--bg-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-3); border: 1px solid var(--border-main);">
          <div style="font-weight: 700; font-size: 0.825rem; margin-bottom: var(--space-2); color: var(--primary-700); display: flex; justify-content: space-between; align-items: center;">
            <span>Tài Khoản Thụ Hưởng Của Nhà Cung Cấp</span>
            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #047857; font-size: 0.7rem; font-weight: 600;">
              <i data-lucide="shield-check" style="width: 12px; height: 12px;"></i> Cố định theo Danh bạ NCC
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-2);">
            <div>
              <label style="font-size: 0.75rem; color: var(--text-muted);">Tên Ngân Hàng</label>
              <input type="text" class="form-control form-control-sm" id="pr-bank-name" placeholder="VD: Vietcombank, BIDV..." style="background: #f8fafc; font-weight: 600;">
            </div>
            <div>
              <label style="font-size: 0.75rem; color: var(--text-muted);">Số Tài Khoản</label>
              <input type="text" class="form-control form-control-sm font-mono font-bold" id="pr-bank-acc" placeholder="VD: 001100..." style="background: #f8fafc; color: var(--primary-700);">
            </div>
          </div>
          <div>
            <label style="font-size: 0.75rem; color: var(--text-muted);">Tên Chủ Tài Khoản</label>
            <input type="text" class="form-control form-control-sm font-bold" id="pr-bank-holder" placeholder="VD: CÔNG TY TNHH..." style="background: #f8fafc;">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Lý Do / Nội Dung Thanh Toán Chi Tiết <span class="required">*</span></label>
          <textarea class="form-control" id="pr-reason" rows="2" placeholder="VD: Thanh toán tiền cước vận chuyển và dịch vụ theo hợp đồng và hóa đơn"></textarea>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-primary" id="btn-save-payment-request">Tạo Giấy Đề Nghị</button>
    `;

    Modal.open({
      title: "Lập Giấy Đề Nghị Thanh Toán Mới",
      size: "lg",
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        const partnerSelect = qs("#pr-partner", body);
        const invListEl = qs("#pr-invoices-list", body);
        const amountInput = qs("#pr-amount", body);
        const methodSelect = qs("#pr-method", body);
        const bankFields = qs("#pr-bank-fields", body);
        const bankNameInput = qs("#pr-bank-name", body);
        const bankAccInput = qs("#pr-bank-acc", body);
        const bankHolderInput = qs("#pr-bank-holder", body);
        const dearToInput = qs("#pr-dear-to", body);

        // Quick suggestions for "Kính gửi"
        qsa(".btn-quick-dear", body).forEach(btn => {
          btn.onclick = () => {
            dearToInput.value = btn.dataset.text;
          };
        });

        // Hàm nạp hóa đơn & cố định tài khoản thụ hưởng theo đối tác
        const loadPartnerInvoices = (pId) => {
          const partner = vendors.find(p => p.id === pId);
          if (partner) {
            bankNameInput.value = partner.bankName || "";
            bankAccInput.value = partner.bankAccount || "";
            bankHolderInput.value = partner.bankAccountHolder || partner.name || "";
          }

          const partnerInvs = stateStore.state.invoices.filter(i => 
            i.partnerId === pId && 
            i.type === INVOICE_TYPES.PAYABLE &&
            ((Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0)) > 0
          );

          if (partnerInvs.length === 0) {
            invListEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 8px;">Đối tác này hiện không có hóa đơn mua hàng còn nợ. Bạn có thể tự nhập số tiền đề nghị.</div>`;
            return;
          }

          invListEl.innerHTML = partnerInvs.map(inv => {
            const rem = Math.max(0, inv.totalAmount - inv.paidAmount);
            return `
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.825rem; padding: 4px 6px; border-bottom: 1px solid var(--border-subtle); cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" class="pr-inv-check" value="${inv.id}" data-rem="${rem}">
                  <span class="font-mono font-bold">${escapeHtml(inv.invoiceNumber)}</span>
                  <span style="color: var(--text-muted); font-size: 0.75rem;">(${formatDate(inv.issueDate)})</span>
                </div>
                <div class="font-mono font-bold text-danger">${formatCurrency(rem)}</div>
              </label>
            `;
          }).join('');

          // Lắng nghe click chọn hóa đơn để tự tính tổng tiền
          const checks = invListEl.querySelectorAll(".pr-inv-check");
          const updateSum = () => {
            let sum = 0;
            checks.forEach(c => {
              if (c.checked) sum += Number(c.dataset.rem || 0);
            });
            if (sum > 0) {
              amountInput.value = formatCurrencyNumber(sum);
              amountInput.dispatchEvent(new Event('input'));
            }
          };

          checks.forEach(c => c.onchange = updateSum);

          const selectAllBtn = qs("#pr-select-all-inv", body);
          if (selectAllBtn) {
            selectAllBtn.onclick = () => {
              const allChecked = Array.from(checks).every(c => c.checked);
              checks.forEach(c => c.checked = !allChecked);
              updateSum();
            };
          }
        };

        // Khởi tạo
        loadPartnerInvoices(partnerSelect.value);
        partnerSelect.onchange = (e) => loadPartnerInvoices(e.target.value);

        // Toggle bank info
        methodSelect.onchange = (e) => {
          bankFields.style.display = e.target.value === PAYMENT_METHODS.CASH ? "none" : "";
        };

        // Submit
        qs("#btn-save-payment-request", footer).onclick = () => {
          const partnerId = partnerSelect.value;
          const partner = vendors.find(p => p.id === partnerId);
          const amount = parseCurrency(amountInput.value);

          if (amount <= 0) {
            Toast.warning("Số tiền đề nghị phải lớn hơn 0!");
            return;
          }

          const paymentMethod = methodSelect.value;

          // Validation quy tắc tiền mặt < 5.000.000 VNĐ
          if (paymentMethod === PAYMENT_METHODS.CASH && amount >= 5000000) {
            Toast.error("Thanh toán tiền mặt chỉ áp dụng cho số tiền dưới 5.000.000 VNĐ. Số tiền từ 5.000.000 VNĐ trở lên bắt buộc Chuyển khoản qua Ngân hàng!");
            return;
          }

          const selectedInvIds = Array.from(invListEl.querySelectorAll(".pr-inv-check:checked")).map(c => c.value);

          const requestData = {
            requestNumber: qs("#pr-number", body).value.trim(),
            dearTo: dearToInput.value.trim() || "Ban Giám Đốc - Phòng Kế Toán - Tài Chính",
            partnerId,
            partnerName: partner ? partner.name : "",
            amount,
            requestDate: qs("#pr-date", body).value,
            deadlineDate: qs("#pr-deadline", body).value,
            requesterName: qs("#pr-requester", body).value.trim(),
            department: qs("#pr-dept", body).value.trim(),
            paymentMethod: paymentMethod,
            bankName: bankNameInput.value.trim(),
            bankAccount: bankAccInput.value.trim(),
            bankAccountHolder: bankHolderInput.value.trim(),
            reason: qs("#pr-reason", body).value.trim(),
            invoiceIds: selectedInvIds,
            status: PAYMENT_REQUEST_STATUS.PENDING
          };

          const newReq = stateStore.addPaymentRequest(requestData);
          Toast.success(`Đã tạo Giấy Đề Nghị Thanh Toán ${newReq.requestNumber}!`);
          Modal.close();

          // Hỏi in ngay
          setTimeout(() => {
            const settings = stateStore.state.settings || {};
            const invList = (newReq.invoiceIds || []).map(id => stateStore.state.invoices.find(i => i.id === id)).filter(Boolean);
            const html = VoucherTemplates.renderPaymentRequestHTML(newReq, settings, partner, invList);
            VoucherTemplates.openPreviewModal({
              title: `In Giấy Đề Nghị Thanh Toán (${newReq.requestNumber})`,
              htmlContent: html,
              printTitle: `${newReq.requestNumber}_De_Nghi_Thanh_Toan`
            });
          }, 300);
        };
      }
    });
  }

  /**
   * Xác nhận Duyệt và Chuyển thành UNC / Phiếu Chi
   */
  confirmExecutePaymentRequest(req) {
    const isCash = req.paymentMethod === PAYMENT_METHODS.CASH;

    // Validation tiền mặt >= 5 triệu khi duyệt
    if (isCash && req.amount >= 5000000) {
      Toast.error("Đề nghị thanh toán tiền mặt từ 5.000.000 VNĐ trở lên không hợp lệ, bắt buộc chuyển đổi sang Chuyển khoản ngân hàng!");
      return;
    }

    const actionName = isCash ? "Lập Phiếu Chi (Tiền mặt)" : "Lập Ủy Nhiệm Chi (Ngân hàng)";
    const todayStr = toInputDateFormat(new Date());

    const bodyHtml = `
      <div style="margin-bottom: var(--space-4);">
        <p style="font-size: 0.9rem; margin-bottom: var(--space-3);">
          Bạn đang tiến hành <b>phê duyệt và chi tiền</b> cho Giấy đề nghị:
        </p>

        <div style="background: var(--bg-surface-subtle); padding: var(--space-3); border-radius: var(--radius-md); border-left: 4px solid var(--primary-500); margin-bottom: var(--space-3);">
          <div>Số đề nghị: <b class="font-mono">${escapeHtml(req.requestNumber)}</b></div>
          <div>Đơn vị nhận: <b>${escapeHtml(req.partnerName)}</b></div>
          <div>Số tiền: <b class="font-mono text-danger" style="font-size: 1.1rem;">${formatCurrency(req.amount)}</b></div>
          <div>Hình thức: <b>${isCash ? '💵 Tiền mặt' : '🏦 Chuyển khoản ngân hàng'}</b></div>
          ${req.bankName ? `<div>Tài khoản nhận: ${escapeHtml(req.bankName)} - TK: ${escapeHtml(req.bankAccount || '-')} (${escapeHtml(req.bankAccountHolder || '-')})</div>` : ''}
        </div>

        <div class="form-group">
          <label class="form-label">Ngày Xuất Chứng Từ Chi</label>
          <input type="date" class="form-control" id="exec-pay-date" value="${todayStr}">
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted);">
          <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle;"></i>
          Khi xác nhận, hệ thống sẽ tự động tạo <b>${isCash ? 'Phiếu Chi (PC)' : 'Ủy Nhiệm Chi (UNC)'}</b> và tự động <b>cấn trừ công nợ FIFO</b> cho các hóa đơn mua hàng của đối tác này.
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-success" id="btn-confirm-exec-pay">${actionName}</button>
    `;

    Modal.open({
      title: `Duyệt & ${actionName}`,
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        qs("#btn-confirm-exec-pay", footer).onclick = () => {
          const payDate = qs("#exec-pay-date", body).value;
          try {
            const payment = stateStore.executePaymentRequestToVoucher(req.id, {
              paymentDate: payDate,
              bankName: req.bankName,
              bankAccount: req.bankAccount,
              bankAccountHolder: req.bankAccountHolder
            });

            Toast.success(`Đã phê duyệt và tạo chứng từ ${payment.paymentNumber} thành công!`);
            Modal.close();

            // Mở preview in UNC / Phiếu Chi
            setTimeout(() => {
              const partner = stateStore.state.partners.find(p => p.id === req.partnerId) || { name: req.partnerName };
              const settings = stateStore.state.settings || {};
              const html = isCash 
                ? VoucherTemplates.renderPaymentCashHTML(payment, settings, partner)
                : VoucherTemplates.renderPaymentBankUNC_HTML(payment, settings, partner);

              VoucherTemplates.openPreviewModal({
                title: `In Chứng Từ ${payment.paymentNumber}`,
                htmlContent: html,
                printTitle: `${payment.paymentNumber}_${payment.partnerName}`
              });
            }, 300);

          } catch (err) {
            Toast.error("Lỗi: " + err.message);
          }
        };
      }
    });
  }
}
