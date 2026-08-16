/**
 * CONFIG & CONSTANTS - QUẢN LÝ CÔNG NỢ
 * Chứa toàn bộ Enums, Constants, Storage Keys, và Cấu hình mặc định.
 */

export const APP_NAME = "Quản Lý Công Nợ";
export const APP_VERSION = "1.0.0";

// LocalStorage Keys
export const STORAGE_KEYS = {
  PARTNERS: "qlcn_partners_v1",
  INVOICES: "qlcn_invoices_v1",
  PAYMENTS: "qlcn_payments_v1",
  SETTINGS: "qlcn_settings_v1",
  AUDIT_LOGS: "qlcn_audit_logs_v1",
  THEME: "qlcn_theme_mode"
};

// Loại đối tượng công nợ
export const PARTNER_TYPES = {
  CUSTOMER: "CUSTOMER", // Khách hàng (Phải thu)
  VENDOR: "VENDOR",     // Nhà cung cấp (Phải trả)
  BOTH: "BOTH"          // Vừa là khách hàng vừa là NCC
};

export const PARTNER_TYPE_LABELS = {
  CUSTOMER: "Khách hàng (Phải thu)",
  VENDOR: "Nhà cung cấp (Phải trả)",
  BOTH: "Đối tác 2 chiều (KH & NCC)"
};

// Loại chứng từ phát sinh nợ
export const INVOICE_TYPES = {
  RECEIVABLE: "RECEIVABLE", // Bán hàng cho nợ (Phải thu tăng)
  PAYABLE: "PAYABLE"        // Mua hàng nợ (Phải trả tăng)
};

export const INVOICE_TYPE_LABELS = {
  RECEIVABLE: "Phải thu (Bán hàng)",
  PAYABLE: "Phải trả (Mua hàng)"
};

// Trạng thái hóa đơn / nợ
export const INVOICE_STATUS = {
  UNPAID: "UNPAID",   // Chưa thanh toán
  PARTIAL: "PARTIAL", // Thanh toán 1 phần
  PAID: "PAID",       // Đã thanh toán đủ
  OVERDUE: "OVERDUE"  // Quá hạn
};

export const INVOICE_STATUS_LABELS = {
  UNPAID: "Chưa thanh toán",
  PARTIAL: "Trả 1 phần",
  PAID: "Đã hoàn tất",
  OVERDUE: "Quá hạn"
};

// Loại phiếu thanh toán
export const PAYMENT_TYPES = {
  RECEIPT: "RECEIPT", // Thu tiền từ khách hàng
  PAYMENT: "PAYMENT"  // Trả tiền cho NCC
};

export const PAYMENT_TYPE_LABELS = {
  RECEIPT: "Phiếu Thu",
  PAYMENT: "Phiếu Chi"
};

// Phương thức thanh toán
export const PAYMENT_METHODS = {
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH"
};

export const PAYMENT_METHOD_LABELS = {
  BANK_TRANSFER: "Chuyển khoản ngân hàng",
  CASH: "Tiền mặt"
};

// Các nhóm phân loại tuổi nợ (Aging Buckets)
export const AGING_BUCKETS = {
  CURRENT: { id: "CURRENT", label: "Trong hạn", color: "#10b981", minDays: -9999, maxDays: 0 },
  OVERDUE_1_30: { id: "OVERDUE_1_30", label: "Quá hạn 1-30 ngày", color: "#0284c7", minDays: 1, maxDays: 30 },
  OVERDUE_31_60: { id: "OVERDUE_31_60", label: "Quá hạn 31-60 ngày", color: "#f59e0b", minDays: 31, maxDays: 60 },
  OVERDUE_61_90: { id: "OVERDUE_61_90", label: "Quá hạn 61-90 ngày", color: "#ea580c", minDays: 61, maxDays: 90 },
  OVERDUE_OVER_90: { id: "OVERDUE_OVER_90", label: "Quá hạn > 90 ngày (Khó đòi)", color: "#dc2626", minDays: 91, maxDays: 99999 }
};

// Cài đặt công ty & hệ thống mặc định (Trắng dữ liệu cho Production)
export const DEFAULT_SETTINGS = {
  companyName: "",
  companyTaxCode: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyBankName: "",
  companyBankAccount: "",
  defaultCreditTermDays: 30, // Hạn nợ mặc định: 30 ngày
  firebaseConfig: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  enableFirebaseSync: false
};
