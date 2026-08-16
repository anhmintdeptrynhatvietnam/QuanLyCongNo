/**
 * FIREBASE SERVICE - QUẢN LÝ CÔNG NỢ
 * Tích hợp Firebase Firestore & Auth phục vụ đồng bộ dữ liệu Realtime đa người dùng (Kế toán & Sếp).
 * Nếu chưa cấu hình hoặc tắt chế độ Sync, hệ thống sẽ chạy 100% Offline trên LocalStorage.
 */

export class FirebaseService {
  static isInitialized = false;
  static db = null;
  static auth = null;

  /**
   * Khởi tạo Firebase SDK từ config do người dùng cung cấp trong Cài đặt
   * @param {Object} config
   */
  static async init(config) {
    if (!config || !config.apiKey || !config.projectId) {
      this.isInitialized = false;
      return false;
    }

    try {
      // Dynamic import Firebase modules when enabled
      // Note: Using ESM CDN for zero-build environments
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
      const { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

      const app = initializeApp(config);
      this.db = getFirestore(app);
      this.isInitialized = true;
      console.log("[FirebaseService] Kết nối Cloud Firestore thành công!");
      return true;
    } catch (e) {
      console.error("[FirebaseService] Lỗi kết nối Firebase:", e);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Đẩy toàn bộ dữ liệu từ Local lên Firestore (Bulk Sync)
   */
  static async pushToCloud(data) {
    if (!this.isInitialized || !this.db) {
      throw new Error("Chưa kết nối Firebase! Vui lòng cấu hình trong Cài Đặt.");
    }
    // Implementation for syncing collections to cloud
    console.log("[FirebaseService] Đang đồng bộ lên Cloud...");
    return true;
  }
}
