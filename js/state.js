/**
 * STATE STORE - QUẢN LÝ CÔNG NỢ
 * Singleton State Management (Pub/Sub pattern).
 * Quản lý nguồn dữ liệu duy nhất (Single Source of Truth) cho toàn bộ ứng dụng.
 */

import { StorageService } from './services/storage.js';
import { recalculatePartnerBalances, calculateInvoiceStatus } from './services/debt-engine.js';
import { DEFAULT_SETTINGS } from './config.js';
import { FirebaseService } from './services/firebase.js';

class StateStore {
  constructor() {
    this.subscribers = new Set();
    this.state = {
      partners: [],
      invoices: [],
      payments: [],
      settings: { ...DEFAULT_SETTINGS },
      activeView: "dashboard",
      searchQuery: "",
      currentUser: null, // { uid, displayName, email, photoURL, isLoggedIn }
      syncStatus: "offline" // "offline" | "syncing" | "synced" | "error"
    };
  }

  /**
   * Khởi tạo State từ Storage và lắng nghe Firebase Auth
   */
  async init() {
    const loaded = StorageService.loadAll(null);
    this.state.partners = loaded.partners || [];
    this.state.invoices = loaded.invoices || [];
    this.state.payments = loaded.payments || [];
    this.state.settings = loaded.settings || { ...DEFAULT_SETTINGS };

    this.recomputeAndPersist(false);

    // Khởi tạo Firebase SDK
    if (FirebaseService.isConfigured()) {
      await FirebaseService.init();
      FirebaseService.onAuthStateChanged((user) => {
        this.handleAuthStateChange(user);
      });
    }
  }

  /**
   * Xử lý chuyển đổi tài khoản người dùng (Đăng nhập / Đổi tài khoản / Đăng xuất)
   */
  async handleAuthStateChange(user) {
    if (user) {
      this.state.currentUser = user;
      this.state.syncStatus = "syncing";
      this.notify();

      const userId = user.uid;
      // 1. Tải cache cục bộ của user trước để hiển thị tức thì
      const localData = StorageService.loadAll(userId);
      this.state.partners = localData.partners || [];
      this.state.invoices = localData.invoices || [];
      this.state.payments = localData.payments || [];
      this.state.settings = localData.settings || { ...DEFAULT_SETTINGS };

      // 2. Kéo dữ liệu từ Cloud Firestore
      const cloudData = await FirebaseService.fetchUserData(userId);
      if (cloudData) {
        this.state.partners = cloudData.partners || [];
        this.state.invoices = (cloudData.invoices || []).map(inv => ({
          ...inv,
          status: calculateInvoiceStatus(inv)
        }));
        this.state.payments = cloudData.payments || [];
        this.state.settings = cloudData.settings || { ...DEFAULT_SETTINGS };
      } else if (this.state.partners.length > 0 || this.state.invoices.length > 0) {
        // Nếu trên Cloud chưa có dữ liệu mà máy có dữ liệu thì đẩy lên Cloud
        await FirebaseService.saveUserData(userId, this.state);
      }

      // 3. Lắng nghe Realtime sync từ Cloud
      FirebaseService.listenUserData(userId, (remoteData) => {
        if (remoteData) {
          this.state.partners = remoteData.partners || [];
          this.state.invoices = (remoteData.invoices || []).map(inv => ({
            ...inv,
            status: calculateInvoiceStatus(inv)
          }));
          this.state.payments = remoteData.payments || [];
          this.state.settings = remoteData.settings || { ...DEFAULT_SETTINGS };
          this.state.partners = recalculatePartnerBalances(this.state.partners, this.state.invoices);
          this.state.syncStatus = "synced";
          StorageService.saveAll(this.state, userId);
          this.notify();
        }
      });

      this.state.syncStatus = "synced";
      this.recomputeAndPersist(true);
    } else {
      // Đăng xuất -> Chuyển về chế độ Khách (Offline Guest)
      this.state.currentUser = null;
      this.state.syncStatus = "offline";

      const guestData = StorageService.loadAll(null);
      this.state.partners = guestData.partners || [];
      this.state.invoices = guestData.invoices || [];
      this.state.payments = guestData.payments || [];
      this.state.settings = guestData.settings || { ...DEFAULT_SETTINGS };

      this.recomputeAndPersist(true);
    }
  }

  /**
   * Đăng ký subscriber lắng nghe thay đổi State
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Thông báo cho tất cả subscribers
   */
  notify() {
    this.subscribers.forEach(cb => {
      try {
        cb(this.state);
      } catch (err) {
        console.error("[StateStore] Lỗi khi thực thi subscriber:", err);
      }
    });
  }

  /**
   * Tự động tính toán lại số dư đối tác và lưu trữ xuống Local & Cloud
   * @param {boolean} shouldNotify
   */
  recomputeAndPersist(shouldNotify = true) {
    // 1. Cập nhật trạng thái từng hóa đơn theo ngày hiện tại
    this.state.invoices = this.state.invoices.map(inv => ({
      ...inv,
      status: calculateInvoiceStatus(inv)
    }));

    // 2. Tính lại số dư 2 chiều cho từng khách hàng & NCC
    this.state.partners = recalculatePartnerBalances(this.state.partners, this.state.invoices);

    const userId = this.state.currentUser?.uid || null;

    // 3. Ghi dữ liệu xuống LocalStorage
    StorageService.saveAll({
      partners: this.state.partners,
      invoices: this.state.invoices,
      payments: this.state.payments,
      settings: this.state.settings
    }, userId);

    // 4. Đồng bộ lên Cloud Firestore nếu đang đăng nhập
    if (userId && FirebaseService.isInitialized) {
      FirebaseService.saveUserData(userId, this.state)
        .then(() => {
          this.state.syncStatus = "synced";
        })
        .catch(err => {
          console.error("[StateStore] Lỗi đồng bộ Cloud Firestore:", err);
          this.state.syncStatus = "error";
        });
    }

    if (shouldNotify) {
      this.notify();
    }
  }

  // ==========================================
  // PARTNERS (KHÁCH HÀNG & NHÀ CUNG CẤP)
  // ==========================================

  addPartner(partnerData) {
    const id = partnerData.id || `P-${Date.now().toString(36).toUpperCase()}`;
    const newPartner = {
      ...partnerData,
      id,
      createdAt: new Date().toISOString()
    };
    this.state.partners.push(newPartner);
    this.recomputeAndPersist();
    return newPartner;
  }

  /**
   * Thêm hàng loạt đối tác (Batch Import từ Excel)
   * @param {Array<Object>} partnersList
   * @returns {Array<Object>}
   */
  addPartnersBatch(partnersList = []) {
    const now = new Date().toISOString();
    const addedList = [];

    partnersList.forEach((p, idx) => {
      const id = p.id || `P-${Date.now().toString(36).toUpperCase()}-${idx + 1}`;
      const partnerObj = {
        ...p,
        id,
        code: p.code || id,
        creditLimit: Number(p.creditLimit) || 0,
        creditTermDays: Number(p.creditTermDays) || 30,
        totalReceivable: 0,
        totalPayable: 0,
        createdAt: now
      };
      this.state.partners.push(partnerObj);
      addedList.push(partnerObj);
    });

    this.recomputeAndPersist();
    return addedList;
  }

  updatePartner(id, updatedFields) {
    const index = this.state.partners.findIndex(p => p.id === id);
    if (index !== -1) {
      this.state.partners[index] = {
        ...this.state.partners[index],
        ...updatedFields,
        updatedAt: new Date().toISOString()
      };
      this.recomputeAndPersist();
      return true;
    }
    return false;
  }

  deletePartner(id) {
    // Kiểm tra xem đối tác có hóa đơn phát sinh không
    const hasInvoices = this.state.invoices.some(inv => inv.partnerId === id);
    if (hasInvoices) {
      throw new Error("Không thể xóa đối tác đã có hóa đơn phát sinh trong hệ thống!");
    }
    this.state.partners = this.state.partners.filter(p => p.id !== id);
    this.recomputeAndPersist();
  }

  // ==========================================
  // INVOICES (HÓA ĐƠN / CHỨNG TỪ NỢ)
  // ==========================================

  addInvoice(invoiceData) {
    const id = invoiceData.id || `INV-${Date.now().toString(36).toUpperCase()}`;
    const newInvoice = {
      ...invoiceData,
      id,
      paidAmount: Number(invoiceData.paidAmount) || 0,
      totalAmount: Number(invoiceData.totalAmount) || 0,
      createdAt: new Date().toISOString()
    };
    newInvoice.status = calculateInvoiceStatus(newInvoice);

    this.state.invoices.unshift(newInvoice);
    this.recomputeAndPersist();
    return newInvoice;
  }

  updateInvoice(id, updatedFields) {
    const index = this.state.invoices.findIndex(inv => inv.id === id);
    if (index !== -1) {
      this.state.invoices[index] = {
        ...this.state.invoices[index],
        ...updatedFields,
        updatedAt: new Date().toISOString()
      };
      this.recomputeAndPersist();
      return true;
    }
    return false;
  }

  deleteInvoice(id) {
    // Kiểm tra xem hóa đơn đã có phiếu thanh toán cấn trừ chưa
    const hasPayments = this.state.payments.some(pay =>
      (pay.allocations || []).some(alloc => alloc.invoiceId === id)
    );
    if (hasPayments) {
      throw new Error("Không thể xóa hóa đơn đã có phiếu thu/chi thanh toán!");
    }
    this.state.invoices = this.state.invoices.filter(inv => inv.id !== id);
    this.recomputeAndPersist();
  }

  // ==========================================
  // PAYMENTS (PHIẾU THU / PHIẾU CHI)
  // ==========================================

  addPayment(paymentData) {
    const id = paymentData.id || `PAY-${Date.now().toString(36).toUpperCase()}`;
    const newPayment = {
      ...paymentData,
      id,
      amount: Number(paymentData.amount) || 0,
      createdAt: new Date().toISOString()
    };

    // Cập nhật paidAmount cho các hóa đơn được phân bổ
    (newPayment.allocations || []).forEach(alloc => {
      const inv = this.state.invoices.find(i => i.id === alloc.invoiceId);
      if (inv) {
        inv.paidAmount = (Number(inv.paidAmount) || 0) + (Number(alloc.amount) || 0);
        inv.status = calculateInvoiceStatus(inv);
      }
    });

    this.state.payments.unshift(newPayment);
    this.recomputeAndPersist();
    return newPayment;
  }

  deletePayment(id) {
    const payment = this.state.payments.find(p => p.id === id);
    if (!payment) return;

    // Hoàn trả lại paidAmount cho các hóa đơn đã được cấn trừ
    (payment.allocations || []).forEach(alloc => {
      const inv = this.state.invoices.find(i => i.id === alloc.invoiceId);
      if (inv) {
        inv.paidAmount = Math.max(0, (Number(inv.paidAmount) || 0) - (Number(alloc.amount) || 0));
        inv.status = calculateInvoiceStatus(inv);
      }
    });

    this.state.payments = this.state.payments.filter(p => p.id !== id);
    this.recomputeAndPersist();
  }

  // ==========================================
  // SETTINGS & DEMO DATA
  // ==========================================

  updateSettings(newSettings) {
    this.state.settings = {
      ...this.state.settings,
      ...newSettings
    };
    this.recomputeAndPersist();
  }

  loadDemoData() {
    const demo = StorageService.generateDemoData();
    this.state.partners = demo.partners;
    this.state.invoices = demo.invoices;
    this.state.payments = demo.payments;
    this.state.settings = demo.settings;
    this.recomputeAndPersist();
  }

  resetAllData() {
    this.state.partners = [];
    this.state.invoices = [];
    this.state.payments = [];
    this.state.settings = { ...DEFAULT_SETTINGS };
    this.recomputeAndPersist();
  }
}

export const stateStore = new StateStore();
