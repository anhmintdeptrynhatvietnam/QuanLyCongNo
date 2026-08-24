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
  PAYMENT_REQUESTS: "qlcn_payment_requests_v1",
  SETTINGS: "qlcn_settings_v1",
  EXCHANGE_RATES: "qlcn_exchange_rates_v1",
  AUDIT_LOGS: "qlcn_audit_logs_v1",
  THEME: "qlcn_theme_mode",
  CURRENT_USER: "qlcn_current_user_v1"
};

/**
 * Tạo key lưu trữ phân tách theo từng tài khoản người dùng
 * @param {string} key 
 * @param {string|null} userId 
 * @returns {string}
 */
export function getUserStorageKey(key, userId = null) {
  return userId ? `${key}_u_${userId}` : key;
}

// CẤU HÌNH DỰ ÁN FIREBASE (Lưu sẵn trong mã nguồn hệ thống)
// Điền thông tin dự án Firebase của bạn tại đây để dùng Đăng nhập Google & Firestore Cloud Realtime
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCQdG0S0PaK10r8yf-Lcr5xr3x7Uw2ZSNk",
  authDomain: "quanlytaichinhdoanhnghiep.firebaseapp.com",
  projectId: "quanlytaichinhdoanhnghiep",
  storageBucket: "quanlytaichinhdoanhnghiep.firebasestorage.app",
  messagingSenderId: "532074307137",
  appId: "1:532074307137:web:81d62875c3a78eaaef70c0"
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

// Nhóm loại giao dịch thanh toán cơ sở
export const PAYMENT_TYPES = {
  RECEIPT: "RECEIPT", // Thu tiền từ khách hàng
  PAYMENT: "PAYMENT"  // Trả tiền cho NCC
};

export const PAYMENT_TYPE_LABELS = {
  RECEIPT: "Thu Tiền",
  PAYMENT: "Chi Tiền"
};

// Phương thức thanh toán (Tiền mặt vs Ngân hàng)
export const PAYMENT_METHODS = {
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH"
};

export const PAYMENT_METHOD_LABELS = {
  BANK_TRANSFER: "Chuyển khoản ngân hàng",
  CASH: "Tiền mặt"
};

// Loại chứng từ thanh toán chi tiết chuẩn Kế toán Việt Nam
export const VOUCHER_TYPES = {
  RECEIPT_CASH: "RECEIPT_CASH",   // Phiếu Thu (Tiền mặt) -> PT-xxxx
  RECEIPT_BANK: "RECEIPT_BANK",   // Ủy Nhiệm Thu (Ngân hàng) -> UNT-xxxx
  PAYMENT_CASH: "PAYMENT_CASH",   // Phiếu Chi (Tiền mặt) -> PC-xxxx
  PAYMENT_BANK: "PAYMENT_BANK"    // Ủy Nhiệm Chi (Ngân hàng) -> UNC-xxxx
};

export const VOUCHER_TYPE_LABELS = {
  RECEIPT_CASH: "Phiếu Thu (Tiền mặt)",
  RECEIPT_BANK: "Ủy Nhiệm Thu (Ngân hàng)",
  PAYMENT_CASH: "Phiếu Chi (Tiền mặt)",
  PAYMENT_BANK: "Ủy Nhiệm Chi (Ngân hàng)"
};

export const VOUCHER_TYPE_SHORT_LABELS = {
  RECEIPT_CASH: "Phiếu Thu (PT)",
  RECEIPT_BANK: "Ủy Nhiệm Thu (UNT)",
  PAYMENT_CASH: "Phiếu Chi (PC)",
  PAYMENT_BANK: "Ủy Nhiệm Chi (UNC)"
};

export const VOUCHER_TYPE_PREFIXES = {
  RECEIPT_CASH: "PT",
  RECEIPT_BANK: "UNT",
  PAYMENT_CASH: "PC",
  PAYMENT_BANK: "UNC"
};

/**
 * Tự động xác định VoucherType từ paymentType (RECEIPT/PAYMENT) và paymentMethod (CASH/BANK_TRANSFER)
 */
export function getVoucherType(type, method = PAYMENT_METHODS.BANK_TRANSFER) {
  const isReceipt = type === PAYMENT_TYPES.RECEIPT || type === "RECEIPT";
  const isCash = method === PAYMENT_METHODS.CASH || method === "CASH";

  if (isReceipt) {
    return isCash ? VOUCHER_TYPES.RECEIPT_CASH : VOUCHER_TYPES.RECEIPT_BANK;
  } else {
    return isCash ? VOUCHER_TYPES.PAYMENT_CASH : VOUCHER_TYPES.PAYMENT_BANK;
  }
}

// Trạng thái Giấy Đề Nghị Thanh Toán (Payment Requests)
export const PAYMENT_REQUEST_STATUS = {
  PENDING: "PENDING",     // Chờ duyệt
  APPROVED: "APPROVED",   // Đã duyệt (Chờ chi)
  PAID: "PAID",           // Đã thanh toán / Đã xuất UNC/PC
  REJECTED: "REJECTED"    // Từ chối
};

export const PAYMENT_REQUEST_STATUS_LABELS = {
  PENDING: "Chờ Duyệt",
  APPROVED: "Đã Duyệt",
  PAID: "Đã Thanh Toán",
  REJECTED: "Từ Chối"
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

/**
 * Đăng ký các nhánh state được lưu trữ lâu dài.
 *
 * StorageService.loadAll / saveAll / exportBackupJSON đều duyệt danh sách này,
 * nên thêm một nhánh dữ liệu mới chỉ cần thêm một dòng ở đây. Trước đây ba hàm
 * đó liệt kê tên nhánh bằng destructuring riêng lẻ, khiến nhánh mới bị bỏ khỏi
 * bản sao lưu JSON mà không báo lỗi.
 */
export const PERSISTED_BRANCHES = [
  { key: "partners", storageKey: STORAGE_KEYS.PARTNERS, fallback: () => [] },
  { key: "invoices", storageKey: STORAGE_KEYS.INVOICES, fallback: () => [] },
  { key: "payments", storageKey: STORAGE_KEYS.PAYMENTS, fallback: () => [] },
  { key: "paymentRequests", storageKey: STORAGE_KEYS.PAYMENT_REQUESTS, fallback: () => [] },
  { key: "exchangeRates", storageKey: STORAGE_KEYS.EXCHANGE_RATES, fallback: () => [] },
  // settings là object, không phải mảng -> fallback riêng
  { key: "settings", storageKey: STORAGE_KEYS.SETTINGS, fallback: () => ({ ...DEFAULT_SETTINGS }), isObject: true }
];

// ============================================================
// TỶ GIÁ NGOẠI TỆ (phục vụ Bảng kê chi tiết cước quốc tế)
// ============================================================

/**
 * Biên hợp lệ của tỷ giá khi nhập từ Excel.
 *
 * Không phải để làm khó người dùng: file tỷ giá nguồn không có dòng tiêu đề nên
 * cột được nhận diện theo vị trí. Nếu file bị dịch cột, tỷ giá USD (~26.500) sẽ
 * bị lấy làm tỷ giá KRW (~18), tức hóa đơn sai khoảng 1.400 lần mà số liệu vẫn
 * trông bình thường. Biên này chặn đúng trường hợp đó.
 */
export const EXCHANGE_RATE_BOUNDS = {
  krwToVnd: { min: 10, max: 40 },        // thực tế dao động 17,7 - 19,9
  usdToVnd: { min: 15000, max: 40000 }   // thực tế quanh 26.4xx
};

/** Vị trí cột trong file "TH TỈ GIÁ" (0-based) - file không có dòng tiêu đề. */
export const EXCHANGE_RATE_IMPORT = {
  colDate: 1,      // cột B: ngày thật, là khóa tra cứu
  colKrwToVnd: 3,  // cột D: KRW -> VND (cột mà công thức VLOOKUP lấy)
  colUsdToVnd: 4,  // cột E: USD -> VND
  // Quá tỷ lệ này thì dừng cả lần nhập thay vì nhập một phần dữ liệu đáng ngờ
  maxRejectRatio: 0.2
};
