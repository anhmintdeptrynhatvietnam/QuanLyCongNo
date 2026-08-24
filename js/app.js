/**
 * MAIN APP CONTROLLER - QUẢN LÝ CÔNG NỢ
 * Khởi động ứng dụng, định tuyến View, bắt sự kiện toàn cục & phím tắt.
 */

import { stateStore } from './state.js';
import { Navigation } from './components/navigation.js';
import { DashboardView } from './components/dashboard.js';
import { PartnersView } from './components/partners.js';
import { InvoicesView } from './components/invoices.js';
import { PaymentRequestsView } from './components/payment-requests.js';
import { PaymentsView } from './components/payments.js';
import { ReportsView } from './components/reports.js';
import { ExchangeRatesView } from './components/exchange-rates.js';
import { CatalogsView } from './components/catalogs.js';
import { ManifestsView } from './components/manifests.js';
import { SettingsView } from './components/settings.js';
import { Modal } from './components/modal.js';
import { qs } from './utils/dom.js';

class App {
  constructor() {
    this.currentViewInstance = null;
    this.views = {
      dashboard: new DashboardView("main-content"),
      partners: new PartnersView("main-content"),
      invoices: new InvoicesView("main-content"),
      "payment-requests": new PaymentRequestsView("main-content"),
      payments: new PaymentsView("main-content"),
      reports: new ReportsView("main-content"),
      "exchange-rates": new ExchangeRatesView("main-content"),
      catalogs: new CatalogsView("main-content"),
      manifests: new ManifestsView("main-content"),
      settings: new SettingsView("main-content")
    };
  }

  init() {
    console.log("[App] Khởi động Hệ Thống Quản Lý Công Nợ...");

    // 1. Tải và tính toán State ban đầu
    stateStore.init();

    // 2. Lắng nghe thay đổi State để render lại View hiện tại
    stateStore.subscribe((state) => {
      if (this.currentViewInstance) {
        this.currentViewInstance.mount(state);
      }
    });

    // 3. Khởi tạo Navigation & Router
    Navigation.init((route) => this.switchView(route));

    // 4. Lắng nghe ô Tìm kiếm toàn cục (Global Search)
    this.initGlobalSearch();

    // 5. Nút Tạo nhanh trên Header
    this.initQuickActions();

    // 6. Phím tắt toàn cục (Ctrl+K, Escape)
    this.initGlobalHotkeys();
  }

  switchView(route) {
    if (this.currentViewInstance && typeof this.currentViewInstance.destroy === "function") {
      this.currentViewInstance.destroy();
    }

    const nextView = this.views[route] || this.views.dashboard;
    this.currentViewInstance = nextView;
    stateStore.state.activeView = route;
    nextView.mount(stateStore.state);
  }

  initGlobalSearch() {
    const searchInput = qs("#global-search-input");
    if (!searchInput) return;

    let debounceTimer = null;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        stateStore.state.searchQuery = e.target.value.trim();
        if (this.currentViewInstance) {
          this.currentViewInstance.mount(stateStore.state);
        }
      }, 200);
    });
  }

  initQuickActions() {
    const quickBtn = qs("#btn-quick-create");
    if (quickBtn) {
      quickBtn.onclick = () => {
        Modal.open({
          title: "Chọn Loại Giao Dịch Cần Tạo",
          bodyHtml: `
            <div style="display: grid; grid-template-columns: 1fr; gap: var(--space-3);">
              <button class="btn btn-secondary" id="btn-quick-add-inv" style="justify-content: flex-start; height: 48px;">
                <i data-lucide="file-plus" style="color: var(--primary-600);"></i>
                <div style="text-align: left;">
                  <div style="font-weight: 600;">Tạo Hóa Đơn / Nợ Phát Sinh</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Ghi nhận nợ bán hàng hoặc nợ mua hàng</div>
                </div>
              </button>

              <button class="btn btn-secondary" id="btn-quick-add-pr" style="justify-content: flex-start; height: 48px;">
                <i data-lucide="clipboard-check" style="color: var(--primary-600);"></i>
                <div style="text-align: left;">
                  <div style="font-weight: 600;">Lập Giấy Đề Nghị Thanh Toán</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Yêu cầu chi tiền thanh toán nợ cho Nhà cung cấp</div>
                </div>
              </button>

              <button class="btn btn-secondary" id="btn-quick-add-pay" style="justify-content: flex-start; height: 48px;">
                <i data-lucide="receipt" style="color: var(--success-600);"></i>
                <div style="text-align: left;">
                  <div style="font-weight: 600;">Lập Thu Chi / Ủy Nhiệm (PT/PC/UNT/UNC)</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Phiếu thu/chi tiền mặt hoặc Ủy nhiệm thu/chi ngân hàng</div>
                </div>
              </button>

              <button class="btn btn-secondary" id="btn-quick-add-part" style="justify-content: flex-start; height: 48px;">
                <i data-lucide="user-plus" style="color: var(--warning-600);"></i>
                <div style="text-align: left;">
                  <div style="font-weight: 600;">Thêm Khách Hàng / Nhà Cung Cấp</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Đăng ký thông tin đối tác & hạn mức tín dụng</div>
                </div>
              </button>
            </div>
          `,
          footerHtml: `<button class="btn btn-secondary" id="btn-modal-cancel">Đóng</button>`,
          onOpen: (body) => {
            qs("#btn-quick-add-inv", body).onclick = () => {
              Modal.close();
              this.views.invoices.showInvoiceModal();
            };
            qs("#btn-quick-add-pr", body).onclick = () => {
              Modal.close();
              this.views["payment-requests"].showPaymentRequestModal();
            };
            qs("#btn-quick-add-pay", body).onclick = () => {
              Modal.close();
              this.views.payments.showPaymentModal();
            };
            qs("#btn-quick-add-part", body).onclick = () => {
              Modal.close();
              this.views.partners.showPartnerModal();
            };
          }
        });
      };
    }
  }

  initGlobalHotkeys() {
    window.addEventListener("keydown", (e) => {
      // Ctrl + K hoặc Cmd + K -> Focus Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const searchInput = qs("#global-search-input");
        if (searchInput) searchInput.focus();
      }

      // Escape -> Đóng modal
      if (e.key === "Escape") {
        Modal.close();
      }
    });
  }
}

// Khởi tạo App khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
