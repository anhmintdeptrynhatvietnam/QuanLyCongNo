/**
 * SETTINGS VIEW - QUẢN LÝ CÔNG NỢ
 * Cấu hình thông tin doanh nghiệp, Firebase Cloud Sync, Quản lý dữ liệu mẫu demo, Sao lưu & Khôi phục.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { StorageService } from '../services/storage.js';
import { FirebaseService } from '../services/firebase.js';
import { Toast } from './toast.js';
import { qs, escapeHtml } from '../utils/dom.js';

export class SettingsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
  }

  render(state) {
    const s = state.settings || {};
    const hasSyncError = state.syncStatus === "error";

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

        <!-- Cột 2: Tài Khoản Google & Đồng Bộ Đám Mây -->
        <div style="display: flex; flex-direction: column; gap: var(--space-6);">
          <!-- Thẻ Đăng nhập Google & Cloud Sync -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="cloud" style="color: var(--primary-600);"></i>
                <span>Tài Khoản & Đồng Bộ Đám Mây</span>
              </div>
            </div>

            ${state.currentUser ? `
              <!-- Đã đăng nhập Google -->
              <div class="user-profile-box">
                <div class="user-profile-header">
                  ${state.currentUser.photoURL ? `
                    <img class="user-avatar" src="${escapeHtml(state.currentUser.photoURL)}" alt="Avatar" referrerpolicy="no-referrer">
                  ` : `
                    <div class="user-avatar user-avatar-fallback">
                      ${escapeHtml(state.currentUser.displayName.charAt(0).toUpperCase())}
                    </div>
                  `}
                  <div class="user-info">
                    <div class="user-name">${escapeHtml(state.currentUser.displayName)}</div>
                    <div class="user-email">${escapeHtml(state.currentUser.email)}</div>
                    <div class="user-badge-wrap">
                      ${hasSyncError ? `
                        <span class="badge badge-danger" style="font-size: 0.75rem; padding: 4px 8px;">
                          <span class="badge-dot" style="background-color: var(--danger-500);"></span>
                          Lỗi Đồng Bộ Cloud
                        </span>
                      ` : state.syncStatus === 'syncing' ? `
                        <span class="badge badge-warning" style="font-size: 0.75rem; padding: 4px 8px;">
                          <span class="badge-dot" style="background-color: var(--warning-500);"></span>
                          Đang đồng bộ...
                        </span>
                      ` : `
                        <span class="badge badge-paid" style="font-size: 0.75rem; padding: 4px 8px;">
                          <span class="badge-dot"></span>
                          Đã kết nối Cloud Firestore
                        </span>
                      `}
                    </div>
                  </div>
                </div>

                ${hasSyncError ? `
                  <div class="alert alert-danger" style="margin: var(--space-3) 0; font-size: 0.8rem; line-height: 1.4; padding: 8px 12px; border-radius: var(--radius-md); background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;">
                    <strong>⚠️ Chi tiết lỗi:</strong> ${escapeHtml(state.lastSyncError || 'Không thể ghi/đọc Cloud Firestore')}<br>
                    <span style="font-size: 0.75rem; color: #b91c1c;">Hãy bấm nút <em>"Kiểm Tra Quyền Firestore"</em> bên dưới để chẩn đoán xem Security Rules trên Firebase Console đã mở chưa.</span>
                  </div>
                ` : ''}

                <div class="user-actions-row" style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3);">
                  <button type="button" class="btn btn-primary btn-sm" id="btn-force-upload" title="Đẩy toàn bộ dữ liệu trên máy này lên Cloud Firestore">
                    <i data-lucide="cloud-upload"></i>
                    <span>Đẩy Dữ Liệu Lên Cloud</span>
                  </button>

                  <button type="button" class="btn btn-secondary btn-sm" id="btn-force-download" title="Tải lại toàn bộ dữ liệu từ Cloud Firestore về máy này">
                    <i data-lucide="cloud-download"></i>
                    <span>Tải Lại Từ Cloud</span>
                  </button>

                  <button type="button" class="btn btn-secondary btn-sm" id="btn-test-firestore" title="Kiểm tra quyền đọc/ghi trên Cloud Firestore">
                    <i data-lucide="shield-alert"></i>
                    <span>Kiểm Tra Quyền Firestore</span>
                  </button>

                  <button type="button" class="btn btn-danger btn-sm" id="btn-google-signout">
                    <i data-lucide="log-out"></i>
                    <span>Đăng Xuất</span>
                  </button>
                </div>
              </div>
            ` : `
              <!-- Chưa đăng nhập Google -->
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-4);">
                Đăng nhập tài khoản Google để tự động đồng bộ dữ liệu đa thiết bị (máy công ty & máy ở nhà), sao lưu đám mây thời gian thực.
              </p>

              <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                <button type="button" class="btn btn-google" id="btn-google-login">
                  <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  <span>Đăng Nhập Với Google</span>
                </button>

                <div style="font-size: 0.775rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--success-600);"></i>
                  <span>Dữ liệu từng tài khoản được lưu riêng biệt và mã hóa an toàn.</span>
                </div>
              </div>
            `}
          </div>

          <!-- Quản trị CSDL & Sao Lưu -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="database" style="color: var(--primary-600);"></i>
                <span>Quản Trị Dữ Liệu & Sao Lưu</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <!-- Sao lưu JSON -->
              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;">Sao Lưu Toàn Bộ Dữ Liệu (Backup JSON)</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Tải toàn bộ danh bạ, hóa đơn, phiếu thu chi về máy tính dạng file JSON.</div>
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-export-backup">
                  <i data-lucide="download"></i>
                  <span>Tải File JSON</span>
                </button>
              </div>

              <hr style="border: none; border-top: 1px solid var(--border-subtle);">

              <!-- Phục hồi JSON -->
              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;">Phục Hồi Dữ Liệu Từ File JSON (Restore)</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Nhập lại dữ liệu từ file backup JSON đã lưu trước đó.</div>
                </div>
                <div>
                  <input type="file" id="input-import-json" accept=".json" style="display: none;">
                  <button class="btn btn-secondary btn-sm" id="btn-trigger-import-json">
                    <i data-lucide="upload"></i>
                    <span>Khôi Phục JSON</span>
                  </button>
                </div>
              </div>

              <hr style="border: none; border-top: 1px solid var(--border-subtle);">

              <!-- Nạp Demo -->
              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;">Nạp Bộ Dữ Liệu Mẫu Kế Toán (Demo Data)</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Gồm 5 đối tác lớn, 6 hóa đơn thực tế và các phiếu thanh toán cấn trừ.</div>
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-load-demo">Nạp Demo</button>
              </div>

              <hr style="border: none; border-top: 1px solid var(--border-subtle);">

              <!-- Xóa trắng -->
              <div class="flex justify-between items-center">
                <div>
                  <div style="font-weight: 600;" class="text-danger">Xóa Trắng Dữ Liệu</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Xóa toàn bộ chứng từ hiện tại để bắt đầu nhập lại từ đầu.</div>
                </div>
                <button class="btn btn-danger btn-sm" id="btn-reset-data">Xóa Hết</button>
              </div>
            </div>
          </div>

          <!-- Card Hướng dẫn Cấu hình Rules Firebase Console -->
          <div class="card" style="background: var(--bg-surface-secondary, #f8fafc); border: 1px dashed var(--border-subtle);">
            <div class="card-header" style="padding-bottom: var(--space-2);">
              <div class="card-title" style="font-size: 0.875rem;">
                <i data-lucide="help-circle" style="color: var(--primary-600);"></i>
                <span>Hướng Dẫn Cấu Hình Cloud Firestore (Dành cho Admin)</span>
              </div>
            </div>
            <p style="font-size: 0.775rem; color: var(--text-muted); line-height: 1.5; margin-bottom: var(--space-2);">
              Nếu tài khoản báo <strong>Permission Denied (Bị chặn quyền)</strong>, bạn cần vào <strong>Firebase Console &gt; Firestore Database &gt; Rules</strong> và dán quy tắc sau:
            </p>
            <pre style="background: #1e293b; color: #38bdf8; padding: 10px; border-radius: var(--radius-sm); font-size: 0.75rem; overflow-x: auto; user-select: all;">rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}</pre>
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

    // Google Sign-In button
    const googleLoginBtn = qs("#btn-google-login", this.container);
    if (googleLoginBtn) {
      googleLoginBtn.onclick = async () => {
        try {
          googleLoginBtn.disabled = true;
          googleLoginBtn.innerHTML = `<span>Đang kết nối Google...</span>`;
          await FirebaseService.signInWithGoogle();
          Toast.success("Đăng nhập tài khoản Google thành công!");
        } catch (err) {
          googleLoginBtn.disabled = false;
          googleLoginBtn.innerHTML = `<span>Đăng Nhập Với Google</span>`;
          if (err.message === "CONFIG_MISSING") {
            Toast.warning("Vui lòng điền FIREBASE_CONFIG trong file js/config.js!");
          } else {
            Toast.error(err.message || "Đăng nhập Google thất bại!");
          }
        }
      };
    }

    // Google Sign-Out button
    const googleSignoutBtn = qs("#btn-google-signout", this.container);
    if (googleSignoutBtn) {
      googleSignoutBtn.onclick = async () => {
        if (confirm("Bạn có chắc muốn đăng xuất tài khoản Google này?")) {
          await FirebaseService.signOut();
          Toast.info("Đã đăng xuất tài khoản Google.");
        }
      };
    }

    // Force Upload button (Đẩy từ máy này lên Cloud)
    const forceUploadBtn = qs("#btn-force-upload", this.container);
    if (forceUploadBtn) {
      forceUploadBtn.onclick = async () => {
        if (!state.currentUser?.uid) {
          Toast.warning("Vui lòng đăng nhập tài khoản Google trước!");
          return;
        }

        try {
          forceUploadBtn.disabled = true;
          forceUploadBtn.innerHTML = `<span>Đang đẩy lên Cloud...</span>`;
          await FirebaseService.saveUserData(state.currentUser.uid, stateStore.state);
          stateStore.state.syncStatus = "synced";
          stateStore.state.lastSyncError = null;
          stateStore.notify();
          Toast.success("Đã tải toàn bộ dữ liệu máy này lên Cloud Firestore thành công!");
        } catch (e) {
          Toast.error("Lỗi đẩy dữ liệu lên Cloud: " + (e.message || e.code));
        } finally {
          forceUploadBtn.disabled = false;
          forceUploadBtn.innerHTML = `<i data-lucide="cloud-upload"></i><span>Đẩy Dữ Liệu Lên Cloud</span>`;
        }
      };
    }

    // Force Download button (Tải từ Cloud về máy này)
    const forceDownloadBtn = qs("#btn-force-download", this.container);
    if (forceDownloadBtn) {
      forceDownloadBtn.onclick = async () => {
        if (!state.currentUser?.uid) {
          Toast.warning("Vui lòng đăng nhập tài khoản Google trước!");
          return;
        }

        try {
          forceDownloadBtn.disabled = true;
          forceDownloadBtn.innerHTML = `<span>Đang tải từ Cloud...</span>`;
          const cloudData = await FirebaseService.fetchUserData(state.currentUser.uid);
          if (cloudData) {
            stateStore.state.partners = cloudData.partners || [];
            stateStore.state.invoices = cloudData.invoices || [];
            stateStore.state.payments = cloudData.payments || [];
            stateStore.state.paymentRequests = cloudData.paymentRequests || [];
            stateStore.state.settings = cloudData.settings || { ...stateStore.state.settings };
            stateStore.state.syncStatus = "synced";
            stateStore.state.lastSyncError = null;
            stateStore.recomputeAndPersist(true);
            Toast.success(`Đã tải thành công ${stateStore.state.invoices.length} hóa đơn và ${stateStore.state.partners.length} đối tác từ Cloud Firestore!`);
          } else {
            Toast.info("Trên Cloud Firestore chưa có bản ghi nào của tài khoản này.");
          }
        } catch (e) {
          Toast.error("Lỗi tải từ Cloud: " + (e.message || e.code));
        } finally {
          forceDownloadBtn.disabled = false;
          forceDownloadBtn.innerHTML = `<i data-lucide="cloud-download"></i><span>Tải Lại Từ Cloud</span>`;
        }
      };
    }

    // Test Firestore Access button
    const testFirestoreBtn = qs("#btn-test-firestore", this.container);
    if (testFirestoreBtn) {
      testFirestoreBtn.onclick = async () => {
        if (!state.currentUser?.uid) {
          Toast.warning("Vui lòng đăng nhập tài khoản Google trước!");
          return;
        }

        testFirestoreBtn.disabled = true;
        testFirestoreBtn.innerHTML = `<span>Đang kiểm tra...</span>`;
        const res = await FirebaseService.testFirestoreAccess(state.currentUser.uid);
        testFirestoreBtn.disabled = false;
        testFirestoreBtn.innerHTML = `<i data-lucide="shield-alert"></i><span>Kiểm Tra Quyền Firestore</span>`;

        if (res.success) {
          Toast.success(res.message);
        } else {
          Toast.error(res.message, 8000);
        }
      };
    }

    // Export Backup JSON
    const exportBackupBtn = qs("#btn-export-backup", this.container);
    if (exportBackupBtn) {
      exportBackupBtn.onclick = () => {
        const userId = state.currentUser?.uid || null;
        StorageService.exportBackupJSON(userId);
        Toast.success("Đã xuất file sao lưu JSON thành công!");
      };
    }

    // Trigger Import JSON
    const triggerImportBtn = qs("#btn-trigger-import-json", this.container);
    const importInput = qs("#input-import-json", this.container);
    if (triggerImportBtn && importInput) {
      triggerImportBtn.onclick = () => importInput.click();

      importInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const parsed = JSON.parse(event.target?.result);
            const userId = state.currentUser?.uid || null;
            StorageService.importBackupJSON(parsed, userId);
            
            // Cập nhật StateStore
            stateStore.state.partners = parsed.partners || [];
            stateStore.state.invoices = parsed.invoices || [];
            stateStore.state.payments = parsed.payments || [];
            stateStore.state.paymentRequests = parsed.paymentRequests || [];
            if (parsed.settings) stateStore.state.settings = parsed.settings;
            
            stateStore.recomputeAndPersist(true);
            Toast.success(`Phục hồi thành công ${stateStore.state.invoices.length} hóa đơn và ${stateStore.state.partners.length} đối tác!`);
          } catch (err) {
            Toast.error("Lỗi đọc file JSON: " + err.message);
          } finally {
            importInput.value = "";
          }
        };
        reader.readAsText(file);
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
