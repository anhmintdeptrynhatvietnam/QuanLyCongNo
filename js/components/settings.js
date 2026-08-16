/**
 * SETTINGS VIEW - QUẢN LÝ CÔNG NỢ
 * Cấu hình thông tin doanh nghiệp, Firebase Cloud Sync, Quản lý dữ liệu mẫu demo, Sao lưu & Khôi phục.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { StorageService } from '../services/storage.js';
import { Toast } from './toast.js';
import { qs, escapeHtml } from '../utils/dom.js';

export class SettingsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
  }

  render(state) {
    const s = state.settings || {};
    const fb = s.firebaseConfig || {};

    return `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6);">
        <!-- Cột 1: Thông tin Doanh Nghiệp -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="building-2" style="color: var(--primary-600);"></i>
              <span>Thông Tin Đơn Vị Doanh Nghiệp</span>
            </div>
          </div>

          <form id="company-form">
            <div class="form-group">
              <label class="form-label">Tên Công Ty (Hiển thị trên Biên bản đối chiếu) <span class="required">*</span></label>
              <input type="text" class="form-control" id="s-company-name" value="${escapeHtml(s.companyName || '')}" placeholder="VD: Công ty Cổ phần Thương mại & Dịch vụ ABC" required>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label">Mã Số Thuế</label>
                <input type="text" class="form-control" id="s-tax-code" value="${escapeHtml(s.companyTaxCode || '')}" placeholder="VD: 0108999888">
              </div>
              <div class="form-group">
                <label class="form-label">Số Điện Thoại</label>
                <input type="text" class="form-control" id="s-phone" value="${escapeHtml(s.companyPhone || '')}" placeholder="VD: 024.3789.9999">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Địa Chỉ Trụ Sở</label>
              <input type="text" class="form-control" id="s-address" value="${escapeHtml(s.companyAddress || '')}" placeholder="VD: Tầng 5, Tòa nhà Golden Palm, Thanh Xuân, Hà Nội">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label">Tên Ngân Hàng</label>
                <input type="text" class="form-control" id="s-bank-name" value="${escapeHtml(s.companyBankName || '')}" placeholder="VD: Vietcombank - CN Thăng Long">
              </div>
              <div class="form-group">
                <label class="form-label">Số Tài Khoản</label>
                <input type="text" class="form-control" id="s-bank-account" value="${escapeHtml(s.companyBankAccount || '')}" placeholder="VD: 0011004455668">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Thời Hạn Nợ Mặc Định (Ngày)</label>
              <input type="number" class="form-control" id="s-term-days" value="${s.defaultCreditTermDays || 30}">
            </div>

            <button type="button" class="btn btn-primary" id="btn-save-company-info">
              <i data-lucide="save"></i>
              <span>Lưu Thông Tin Đơn Vị</span>
            </button>
          </form>
        </div>

        <!-- Cột 2: Cấu hình Firebase & Dữ liệu -->
        <div style="display: flex; flex-direction: column; gap: var(--space-6);">
          <!-- Cấu hình Firebase -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="cloud" style="color: var(--primary-600);"></i>
                <span>Đồng Bộ Cloud Firestore (Firebase)</span>
              </div>
            </div>

            <p style="font-size: 0.8rem; margin-bottom: var(--space-3);">
              Tùy chọn kết nối Firebase để đồng bộ số liệu tức thời giữa nhiều máy kế toán. Nếu để trống, hệ thống hoạt động hoàn toàn offline trên trình duyệt.
            </p>

            <form id="firebase-form">
              <div class="form-group">
                <label class="form-label">API Key</label>
                <input type="text" class="form-control" id="fb-api-key" value="${escapeHtml(fb.apiKey || '')}" placeholder="AIzaSy...">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
                <div class="form-group">
                  <label class="form-label">Project ID</label>
                  <input type="text" class="form-control" id="fb-project-id" value="${escapeHtml(fb.projectId || '')}" placeholder="my-debt-app">
                </div>
                <div class="form-group">
                  <label class="form-label">App ID</label>
                  <input type="text" class="form-control" id="fb-app-id" value="${escapeHtml(fb.appId || '')}" placeholder="1:123456:web:abcd">
                </div>
              </div>

              <button type="button" class="btn btn-secondary" id="btn-save-firebase">
                <i data-lucide="check"></i>
                <span>Lưu Cấu Hình Firebase</span>
              </button>
            </form>
          </div>

          <!-- Quản trị CSDL & Dữ liệu mẫu Demo -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="database" style="color: var(--primary-600);"></i>
                <span>Quản Trị Dữ Liệu & Sao Lưu</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;">Nạp Bộ Dữ Liệu Mẫu Kế Toán (Demo Data)</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Gồm 5 đối tác lớn, 6 hóa đơn thực tế và các phiếu thanh toán cấn trừ.</div>
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-load-demo">Nạp Demo</button>
              </div>

              <hr style="border: none; border-top: 1px solid var(--border-subtle);">

              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;">Sao Lưu Toàn Bộ Dữ Liệu (Backup JSON)</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Tải toàn bộ danh bạ, hóa đơn, phiếu thu chi về máy tính.</div>
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-export-backup">Tải File JSON</button>
              </div>

              <hr style="border: none; border-top: 1px solid var(--border-subtle);">

              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;" class="text-danger">Xóa Trắng Dữ Liệu</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Xóa toàn bộ chứng từ để bắt đầu nhập dữ liệu mới cho công ty.</div>
                </div>
                <button class="btn btn-danger btn-sm" id="btn-reset-data">Xóa Hết</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  afterRender(state) {
    // Save company info
    const saveCompanyBtn = qs("#btn-save-company-info", this.container);
    if (saveCompanyBtn) {
      saveCompanyBtn.onclick = () => {
        const name = qs("#s-company-name", this.container).value.trim();
        if (!name) {
          Toast.warning("Vui lòng nhập tên công ty!");
          return;
        }

        stateStore.updateSettings({
          companyName: name,
          companyTaxCode: qs("#s-tax-code", this.container).value.trim(),
          companyPhone: qs("#s-phone", this.container).value.trim(),
          companyAddress: qs("#s-address", this.container).value.trim(),
          companyBankName: qs("#s-bank-name", this.container).value.trim(),
          companyBankAccount: qs("#s-bank-account", this.container).value.trim(),
          defaultCreditTermDays: Number(qs("#s-term-days", this.container).value) || 30
        });

        Toast.success("Đã cập nhật thông tin doanh nghiệp!");
      };
    }

    // Save Firebase Config
    const saveFbBtn = qs("#btn-save-firebase", this.container);
    if (saveFbBtn) {
      saveFbBtn.onclick = () => {
        stateStore.updateSettings({
          firebaseConfig: {
            apiKey: qs("#fb-api-key", this.container).value.trim(),
            projectId: qs("#fb-project-id", this.container).value.trim(),
            appId: qs("#fb-app-id", this.container).value.trim()
          }
        });
        Toast.success("Đã lưu cấu hình Firebase!");
      };
    }

    // Load Demo Data
    const loadDemoBtn = qs("#btn-load-demo", this.container);
    if (loadDemoBtn) {
      loadDemoBtn.onclick = () => {
        if (confirm("Nạp dữ liệu mẫu sẽ khôi phục lại danh mục và chứng từ demo. Tiếp tục?")) {
          stateStore.loadDemoData();
          Toast.success("Đã nạp thành công bộ dữ liệu mẫu Kế toán!");
        }
      };
    }

    // Export Backup JSON
    const exportBackupBtn = qs("#btn-export-backup", this.container);
    if (exportBackupBtn) {
      exportBackupBtn.onclick = () => {
        StorageService.exportBackupJSON();
        Toast.success("Đã xuất file sao lưu JSON!");
      };
    }

    // Reset Data
    const resetBtn = qs("#btn-reset-data", this.container);
    if (resetBtn) {
      resetBtn.onclick = () => {
        if (confirm("CẢNH BÁO: Toàn bộ dữ liệu công nợ, đối tác và thanh toán sẽ bị xóa vĩnh viễn! Bạn có chắc chắn?")) {
          stateStore.resetAllData();
          Toast.success("Đã xóa trắng dữ liệu!");
        }
      };
    }
  }
}
