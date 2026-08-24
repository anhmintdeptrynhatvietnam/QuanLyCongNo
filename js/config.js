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
  CATALOGS: "qlcn_catalogs_v1",
  RATE_CARDS: "qlcn_rate_cards_v1",
  MANIFESTS: "qlcn_manifests_v1",
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

/** Các loại danh mục dùng chung của bảng kê cước quốc tế. */
export const CATALOG_TYPES = ["shippers", "consignees", "flights", "ports", "items"];

/** Danh mục rỗng, dùng làm giá trị mặc định và khi reset dữ liệu. */
export function emptyCatalogs() {
  return CATALOG_TYPES.reduce((acc, type) => ({ ...acc, [type]: [] }), {});
}

/**
 * Đăng ký các nhánh state được lưu trữ lâu dài.
 *
 * StorageService.loadAll / saveAll / exportBackupJSON và
 * FirebaseService.saveUserData đều duyệt danh sách này, nên thêm một nhánh dữ
 * liệu mới chỉ cần thêm một dòng ở đây. Trước đây bốn hàm đó liệt kê tên nhánh
 * bằng tay, khiến nhánh mới bị bỏ khỏi bản sao lưu JSON và khỏi payload đồng bộ
 * Cloud mà không báo lỗi.
 */
export const PERSISTED_BRANCHES = [
  { key: "partners", storageKey: STORAGE_KEYS.PARTNERS, fallback: () => [] },
  { key: "invoices", storageKey: STORAGE_KEYS.INVOICES, fallback: () => [] },
  { key: "payments", storageKey: STORAGE_KEYS.PAYMENTS, fallback: () => [] },
  { key: "paymentRequests", storageKey: STORAGE_KEYS.PAYMENT_REQUESTS, fallback: () => [] },
  { key: "exchangeRates", storageKey: STORAGE_KEYS.EXCHANGE_RATES, fallback: () => [] },
  { key: "rateCards", storageKey: STORAGE_KEYS.RATE_CARDS, fallback: () => [] },
  { key: "manifests", storageKey: STORAGE_KEYS.MANIFESTS, fallback: () => [] },
  // Hai nhánh dưới là object, không phải mảng -> đánh dấu isObject
  { key: "catalogs", storageKey: STORAGE_KEYS.CATALOGS, fallback: () => emptyCatalogs(), isObject: true },
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

// ============================================================
// DANH MỤC DÙNG CHUNG & BẢNG GIÁ
// ============================================================

/** Vai trò của một sân bay trong tuyến vận chuyển */
export const PORT_KINDS = {
  POL: "POL",   // Port of Loading - điểm đi
  POD: "POD",   // Port of Discharge - điểm đến
  BOTH: "BOTH"
};

export const PORT_KIND_LABELS = {
  POL: "POL - Điểm đi",
  POD: "POD - Điểm đến",
  BOTH: "Cả hai chiều"
};

/**
 * Hậu tố thông quan trong cột SHIPPER của bảng kê.
 *
 * KTQ phải đứng TRƯỚC TQ trong danh sách: chuỗi "KTQ" chứa "TQ", nên thử "TQ"
 * trước sẽ nhận diện sai "...KTQ" thành "...K" + thông quan, tức cộng oan
 * 300.000đ cho một lô không thông quan.
 */
export const CUSTOMS_SUFFIXES = [
  { suffix: "KTQ", customsCleared: false },
  { suffix: "TQ", customsCleared: true }
];

// ============================================================
// BẢNG KÊ: HẰNG SỐ TÍNH TOÁN
// ============================================================

/**
 * Hệ số nguyên hoá tỷ giá khi quy đổi KRW sang VND.
 *
 * Tỷ giá nguồn có 2 chữ số thập phân; dùng 4 để dư biên. Nhân bằng số nguyên rồi
 * mới chia giữ cho các giá trị rơi đúng .5 không bị dấu phẩy động làm lệch 1đ —
 * trong bảng kê tháng 6 có 5 dòng rơi vào trường hợp này.
 */
export const RATE_SCALE = 10000;

/**
 * Phí giao nhận mặc định cho dòng mới (KRW), cột DELIVERY CHARGE.
 *
 * Trong bảng kê tháng 6, cột FUEL và CUSTOMS CHARGE trống cả 42 dòng; phí theo
 * từng lô được nhập ở cột DELIVERY CHARGE, và mọi dòng đều >= 5.000.
 * Không suy ra được công thức (cùng 3 kg có dòng 5.000, dòng 6.000, dòng 50.000)
 * nên đây chỉ là giá trị khởi tạo, người dùng nhập lại theo báo phí thực tế.
 */
export const DEFAULT_DELIVERY_CHARGE = 5000;

/** Template diễn giải mặc định, thay cho công thức CONCATENATE trong file gốc. */
export const DEFAULT_DESCRIPTION_TEMPLATE =
  "Cước vận chuyển {route} theo bill số {blNo}, BKS: {truckPlate}, Mã CB: {flightCode}";

/**
 * Nguồn phát sinh của một hóa đơn.
 * Thiếu field này = hóa đơn nhập tay (dữ liệu cũ), không cần migration.
 */
export const INVOICE_SOURCE_TYPES = {
  MANUAL: "MANUAL",
  MANIFEST: "MANIFEST"
};

/** Trạng thái bảng kê */
export const MANIFEST_STATUS = {
  DRAFT: "DRAFT",     // đang lập, sửa tự do
  ISSUED: "ISSUED"    // đã phát hành, đã chốt tổng và sinh công nợ
};

export const MANIFEST_STATUS_LABELS = {
  DRAFT: "Nháp",
  ISSUED: "Đã phát hành"
};

/**
 * Định nghĩa cột của bảng nhập bảng kê, theo đúng thứ tự cột file mẫu để kế toán
 * đối chiếu được bằng mắt.
 *
 * `kind` quyết định loại ô nhập — đây là chỗ dễ gây sai tiền nhất:
 *   integer  -> input number step 1
 *   decimal  -> input number step 0.01  (TUYỆT ĐỐI không dùng .currency-input:
 *               helper tiền tệ xoá mọi ký tự không phải số nên 10.5 thành 105)
 *   currency -> .currency-input, chỉ dành cho số tiền nguyên
 *   computed -> tính từ engine, cho phép override
 *   text / select / date / checkbox -> như tên gọi
 *
 * `extra: true` = cột file mẫu để trống toàn bộ, gom vào nhóm ẩn được cho gọn bảng.
 */
export const MANIFEST_COLUMNS = [
  { key: "no", label: "NO", kind: "readonly", width: 44, sticky: true },
  { key: "date", label: "DATE", kind: "date", width: 130, sticky: true },
  { key: "blNo", label: "B/L NO", kind: "text", width: 120, sticky: true },
  { key: "description", label: "Diễn giải", kind: "description", width: 240 },
  { key: "flightCode", label: "Mã CB", kind: "select", source: "flights", width: 96 },
  { key: "itemsText", label: "ITEMS", kind: "text", width: 150 },
  { key: "shipperId", label: "SHIPPER", kind: "select", source: "shippers", width: 190 },
  { key: "customsCleared", label: "TQ", kind: "checkbox", width: 52,
    hint: "Bật = thông quan (TQ), cộng phí giám sát tờ khai. Tắt = KTQ." },
  { key: "consigneeId", label: "CONSIGNEE", kind: "select", source: "consignees", width: 200 },
  { key: "mode", label: "MODE", kind: "readonly", width: 60 },
  { key: "pol", label: "POL", kind: "select", source: "ports", width: 80 },
  { key: "pod", label: "POD", kind: "select", source: "ports", width: 80 },
  { key: "ct", label: "C/T", kind: "integer", width: 64 },
  { key: "gwt", label: "G.W/T", kind: "decimal", width: 80 },
  { key: "cwt", label: "C.WT", kind: "decimal", width: 80 },
  { key: "freightCharge", label: "FREIGHT (KRW)", kind: "computed", width: 118 },
  { key: "deliveryCharge", label: "DELIVERY (KRW)", kind: "currency", width: 118 },
  { key: "fuel", label: "FUEL", kind: "currency", width: 100, extra: true },
  { key: "customsCharge", label: "CUSTOMS", kind: "currency", width: 100, extra: true },
  { key: "pickFee", label: "PHÍ PICK (VND)", kind: "currency", width: 110, extra: true },
  { key: "declarationSupervisionFee", label: "PHÍ GIÁM SÁT (VND)", kind: "computed", width: 130 },
  { key: "totalKrw", label: "TOTAL (KRW)", kind: "computed", width: 118 },
  { key: "exchangeRate", label: "Tỷ giá", kind: "computed", width: 84 },
  { key: "totalVnd", label: "TOTAL (VND)", kind: "computed", width: 130 },
  { key: "remark", label: "REMARK", kind: "text", width: 120 }
];

/**
 * Định nghĩa 5 danh mục dùng chung. Một component CRUD duy nhất dựng bảng và form
 * từ cấu hình này, nên thêm loại danh mục mới không phải viết thêm màn hình.
 */
export const CATALOG_DEFS = {
  shippers: {
    label: "Shipper (Người gửi)",
    icon: "package",
    // Không có cờ thông quan ở đây: trong dữ liệu thật cùng một công ty xuất hiện
    // ở cả hai dạng TQ và KTQ trên các dòng khác nhau, nên thông quan là dữ kiện
    // của từng lô hàng, không phải thuộc tính của công ty. Cờ nằm trên ManifestLine.
    fields: [
      { key: "name", label: "Tên người gửi", type: "text", required: true, placeholder: "COVATEC VIETNAM CO., LTD" }
    ]
  },
  consignees: {
    label: "Consignee (Người nhận)",
    icon: "package-check",
    fields: [
      { key: "name", label: "Tên người nhận", type: "text", required: true, placeholder: "COVATEC CO.,LTD. (JOONGBU BRANCH)" }
    ]
  },
  flights: {
    label: "Mã chuyến bay",
    icon: "plane",
    fields: [
      { key: "code", label: "Mã chuyến bay", type: "text", required: true, uppercase: true, placeholder: "OZ734" }
    ]
  },
  ports: {
    label: "Sân bay",
    icon: "map-pin",
    fields: [
      { key: "code", label: "Mã IATA", type: "text", required: true, uppercase: true, placeholder: "HAN" },
      { key: "name", label: "Tên đầy đủ", type: "text", placeholder: "Hà Nội - Nội Bài" },
      { key: "kind", label: "Vai trò", type: "select", options: PORT_KIND_LABELS, defaultValue: PORT_KINDS.BOTH }
    ]
  },
  items: {
    label: "Tên sản phẩm",
    icon: "box",
    fields: [
      { key: "name", label: "Tên sản phẩm", type: "text", required: true, placeholder: "PIN BLOCK" }
    ]
  }
};
