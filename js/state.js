/**
 * STATE STORE - QUẢN LÝ CÔNG NỢ
 * Singleton State Management (Pub/Sub pattern).
 * Quản lý nguồn dữ liệu duy nhất (Single Source of Truth) cho toàn bộ ứng dụng.
 */

import { StorageService } from './services/storage.js';
import { recalculatePartnerBalances, calculateInvoiceStatus } from './services/debt-engine.js';

class StateStore {
  constructor() {
    this.subscribers = new Set();
    this.state = {
      partners: [],
      invoices: [],
      payments: [],
      settings: {},
      activeView: "dashboard",
      searchQuery: ""
    };
  }

  /**
   * Khởi tạo State từ Storage
   */
  init() {
    const loaded = StorageService.loadAll();
    this.state.partners = loaded.partners || [];
    this.state.invoices = loaded.invoices || [];
    this.state.payments = loaded.payments || [];
    this.state.settings = loaded.settings || {};

    this.recomputeAndPersist(false);
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
   * Tự động tính toán lại số dư đối tác và lưu trữ
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

    // 3. Ghi dữ liệu xuống Storage
    StorageService.saveAll({
      partners: this.state.partners,
      invoices: this.state.invoices,
      payments: this.state.payments,
      settings: this.state.settings
    });

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
    this.recomputeAndPersist();
  }
}

export const stateStore = new StateStore();
