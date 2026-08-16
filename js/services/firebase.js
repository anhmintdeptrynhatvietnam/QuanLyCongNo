/**
 * FIREBASE SERVICE - QUẢN LÝ CÔNG NỢ
 * Tích hợp Firebase Authentication (Google Sign-In) & Cloud Firestore.
 * Hỗ trợ Đa tài khoản người dùng, đồng bộ Realtime 2 chiều giữa Thiết bị & Đám mây.
 */

import { FIREBASE_CONFIG } from '../config.js';

export class FirebaseService {
  static isInitialized = false;
  static app = null;
  static auth = null;
  static db = null;
  static googleProvider = null;
  static activeSnapshotUnsub = null;
  static authStateListeners = new Set();
  static currentUser = null;

  /**
   * Kiểm tra cấu hình Firebase đã được điền trong mã nguồn hay chưa
   * @returns {boolean}
   */
  static isConfigured() {
    return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey.trim() !== "");
  }

  /**
   * Khởi tạo Firebase SDK từ FIREBASE_CONFIG trong config.js
   */
  static async init() {
    if (this.isInitialized) return true;

    if (!this.isConfigured()) {
      console.log("[FirebaseService] FIREBASE_CONFIG chưa được điền thông tin dự án. Ứng dụng chạy ở chế độ Offline LocalStorage.");
      return false;
    }

    try {
      // Dynamic import Firebase modules từ CDN ESM
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
      const { getAuth, GoogleAuthProvider, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
      const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

      this.app = initializeApp(FIREBASE_CONFIG);
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);

      this.googleProvider = new GoogleAuthProvider();
      // Cho phép luôn hiển thị hộp thoại chọn tài khoản Google để dễ dàng chuyển đổi đa tài khoản
      this.googleProvider.setCustomParameters({
        prompt: "select_account"
      });

      // Lắng nghe trạng thái đăng nhập Firebase Auth
      onAuthStateChanged(this.auth, (user) => {
        if (user) {
          this.currentUser = {
            uid: user.uid,
            displayName: user.displayName || user.email?.split("@")[0] || "Người dùng",
            email: user.email || "",
            photoURL: user.photoURL || "",
            isLoggedIn: true
          };
        } else {
          this.currentUser = null;
        }

        // Bắn sự kiện cho tất cả listeners
        this.authStateListeners.forEach(listener => {
          try {
            listener(this.currentUser);
          } catch (err) {
            console.error("[FirebaseService] Lỗi trong auth state listener:", err);
          }
        });
      });

      this.isInitialized = true;
      console.log("[FirebaseService] Khởi tạo Firebase Auth & Firestore thành công!");
      return true;
    } catch (e) {
      console.error("[FirebaseService] Lỗi khởi tạo Firebase SDK:", e);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Đăng ký lắng nghe thay đổi Auth State (Đăng nhập / Đăng xuất)
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  static onAuthStateChanged(callback) {
    this.authStateListeners.add(callback);
    // Gọi ngay lập tức với trạng thái hiện tại
    callback(this.currentUser);
    return () => this.authStateListeners.delete(callback);
  }

  /**
   * Đăng nhập bằng tài khoản Google (Google Sign-In Popup)
   * @returns {Promise<Object>}
   */
  static async signInWithGoogle() {
    if (!this.isConfigured()) {
      throw new Error("CONFIG_MISSING");
    }

    if (!this.isInitialized) {
      await this.init();
    }

    if (!this.auth || !this.googleProvider) {
      throw new Error("Không thể khởi tạo Firebase Auth.");
    }

    const { signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    const result = await signInWithPopup(this.auth, this.googleProvider);
    const user = result.user;

    this.currentUser = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split("@")[0] || "Người dùng",
      email: user.email || "",
      photoURL: user.photoURL || "",
      isLoggedIn: true
    };

    return this.currentUser;
  }

  /**
   * Đăng xuất tài khoản Google hiện tại
   */
  static async signOut() {
    if (this.activeSnapshotUnsub) {
      this.activeSnapshotUnsub();
      this.activeSnapshotUnsub = null;
    }

    if (this.auth) {
      const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
      await signOut(this.auth);
    }

    this.currentUser = null;
  }

  /**
   * Lắng nghe thay đổi dữ liệu Realtime của User từ Firestore
   * @param {string} userId
   * @param {Function} onDataUpdate
   * @returns {Promise<Function>} unsubscribe function
   */
  static async listenUserData(userId, onDataUpdate) {
    if (!this.isInitialized || !this.db || !userId) return () => {};

    // Hủy listener cũ nếu có
    if (this.activeSnapshotUnsub) {
      this.activeSnapshotUnsub();
      this.activeSnapshotUnsub = null;
    }

    try {
      const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const userDocRef = doc(this.db, "users", userId, "state", "current");

      this.activeSnapshotUnsub = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof onDataUpdate === "function") {
            onDataUpdate(data);
          }
        }
      }, (err) => {
        console.error("[FirebaseService] Lỗi Realtime Snapshot:", err);
      });

      return this.activeSnapshotUnsub;
    } catch (e) {
      console.error("[FirebaseService] Lỗi thiết lập listener Firestore:", e);
      return () => {};
    }
  }

  /**
   * Đọc dữ liệu 1 lần từ Cloud Firestore của User
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  static async fetchUserData(userId) {
    if (!this.isInitialized || !this.db || !userId) return null;

    try {
      const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const userDocRef = doc(this.db, "users", userId, "state", "current");
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (e) {
      console.error("[FirebaseService] Lỗi tải dữ liệu Firestore:", e);
      return null;
    }
  }

  /**
   * Lưu và đồng bộ dữ liệu của User lên Cloud Firestore
   * @param {string} userId
   * @param {Object} stateData
   */
  static async saveUserData(userId, stateData) {
    if (!this.isInitialized || !this.db || !userId) return false;

    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const userDocRef = doc(this.db, "users", userId, "state", "current");

      const payload = {
        partners: stateData.partners || [],
        invoices: stateData.invoices || [],
        payments: stateData.payments || [],
        settings: stateData.settings || {},
        updatedAt: new Date().toISOString(),
        updatedByEmail: this.currentUser?.email || ""
      };

      await setDoc(userDocRef, payload, { merge: true });
      return true;
    } catch (e) {
      console.error("[FirebaseService] Lỗi lưu Firestore:", e);
      return false;
    }
  }
}
