/**
 * STORAGE SERVICE - QUẢN LÝ CÔNG NỢ
 * Quản lý lưu trữ LocalStorage, xuất/nhập JSON backup, và nạp dữ liệu mẫu kế toán.
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, PARTNER_TYPES, INVOICE_TYPES, PAYMENT_METHODS, getUserStorageKey } from '../config.js';
import { calculateInvoiceStatus } from './debt-engine.js';
import { toInputDateFormat } from '../utils/formatters.js';

export class StorageService {
  /**
   * Đọc dữ liệu từ LocalStorage với fallback
   */
  static getItem(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error(`[StorageService] Lỗi đọc key ${key}:`, e);
      return fallback;
    }
  }

  /**
   * Ghi dữ liệu vào LocalStorage
   */
  static setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`[StorageService] Lỗi ghi key ${key}:`, e);
      return false;
    }
  }

  /**
   * Tải toàn bộ state từ Storage theo từng người dùng (User-scoped)
   * @param {string|null} userId
   */
  static loadAll(userId = null) {
    const kPartners = getUserStorageKey(STORAGE_KEYS.PARTNERS, userId);
    const kInvoices = getUserStorageKey(STORAGE_KEYS.INVOICES, userId);
    const kPayments = getUserStorageKey(STORAGE_KEYS.PAYMENTS, userId);
    const kPaymentRequests = getUserStorageKey(STORAGE_KEYS.PAYMENT_REQUESTS, userId);
    const kSettings = getUserStorageKey(STORAGE_KEYS.SETTINGS, userId);

    let partners = this.getItem(kPartners, []);
    let invoices = this.getItem(kInvoices, []);
    let payments = this.getItem(kPayments, []);
    let paymentRequests = this.getItem(kPaymentRequests, []);
    let settings = this.getItem(kSettings, { ...DEFAULT_SETTINGS });

    return {
      partners: Array.isArray(partners) ? partners : [],
      invoices: Array.isArray(invoices) ? invoices : [],
      payments: Array.isArray(payments) ? payments : [],
      paymentRequests: Array.isArray(paymentRequests) ? paymentRequests : [],
      settings: settings || { ...DEFAULT_SETTINGS }
    };
  }

  /**
   * Lưu toàn bộ state vào Storage theo từng người dùng (User-scoped)
   * @param {Object} data
   * @param {string|null} userId
   */
  static saveAll({ partners, invoices, payments, paymentRequests, settings }, userId = null) {
    const kPartners = getUserStorageKey(STORAGE_KEYS.PARTNERS, userId);
    const kInvoices = getUserStorageKey(STORAGE_KEYS.INVOICES, userId);
    const kPayments = getUserStorageKey(STORAGE_KEYS.PAYMENTS, userId);
    const kPaymentRequests = getUserStorageKey(STORAGE_KEYS.PAYMENT_REQUESTS, userId);
    const kSettings = getUserStorageKey(STORAGE_KEYS.SETTINGS, userId);

    if (partners !== undefined) this.setItem(kPartners, partners);
    if (invoices !== undefined) this.setItem(kInvoices, invoices);
    if (payments !== undefined) this.setItem(kPayments, payments);
    if (paymentRequests !== undefined) this.setItem(kPaymentRequests, paymentRequests);
    if (settings !== undefined) this.setItem(kSettings, settings);
  }

  /**
   * Tạo bộ dữ liệu mẫu Kế toán chuẩn doanh nghiệp (Demo Dataset)
   */
  static generateDemoData() {
    const today = new Date();
    const subDays = (d) => toInputDateFormat(new Date(today.getTime() - d * 24 * 60 * 60 * 1000));
    const addDays = (d) => toInputDateFormat(new Date(today.getTime() + d * 24 * 60 * 60 * 1000));

    const partners = [
      {
        id: "KH001",
        code: "KH-VINAMILK",
        name: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        taxCode: "0300588569",
        type: PARTNER_TYPES.CUSTOMER,
        phone: "028.5415.5555",
        email: "contact@vinamilk.com.vn",
        address: "Số 10 Tân Trào, P. Tân Phú, Quận 7, TP.HCM",
        creditLimit: 500000000, // Hạn mức nợ 500 triệu
        creditTermDays: 30
      },
      {
        id: "KH002",
        code: "KH-FPT",
        name: "Công ty Cổ phần FPT Software",
        taxCode: "0101601092",
        type: PARTNER_TYPES.CUSTOMER,
        phone: "024.7300.7300",
        email: "accounting@fpt-software.com",
        address: "Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội",
        creditLimit: 300000000,
        creditTermDays: 15
      },
      {
        id: "KH003",
        code: "KH-VIETTEL",
        name: "Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)",
        taxCode: "0100109106",
        type: PARTNER_TYPES.CUSTOMER,
        phone: "024.6255.6789",
        email: "cskh@viettel.com.vn",
        address: "Lô D26 Khu đô thị mới Cầu Giấy, Yên Hòa, Cầu Giấy, Hà Nội",
        creditLimit: 800000000,
        creditTermDays: 45
      },
      {
        id: "NCC001",
        code: "NCC-CMC",
        name: "Tổng Công ty Công nghệ & Giải pháp CMC",
        taxCode: "0100244115",
        type: PARTNER_TYPES.VENDOR,
        phone: "024.3795.8668",
        email: "billing@cmc.com.vn",
        address: "Tòa nhà CMC, Duy Tân, Cầu Giấy, Hà Nội",
        creditLimit: 200000000,
        creditTermDays: 30
      },
      {
        id: "NCC002",
        code: "NCC-DELL",
        name: "Công ty TNHH Phân Phối Dell Technologies VN",
        taxCode: "0313101234",
        type: PARTNER_TYPES.VENDOR,
        phone: "028.3822.8888",
        email: "orders@dell-partner.vn",
        address: "Tòa nhà Mê Linh Point, Quận 1, TP.HCM",
        creditLimit: 400000000,
        creditTermDays: 30
      }
    ];

    let invoices = [
      {
        id: "INV-2026-001",
        invoiceNumber: "HD-002345",
        itemName: "Phần mềm quản trị chuỗi cung ứng ERP (Đợt 1)",
        partnerId: "KH001",
        partnerName: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(45),
        dueDate: subDays(15), // Quá hạn 15 ngày (Nhóm 1-30)
        totalAmount: 150000000,
        paidAmount: 50000000,
        notes: "Nghiệm thu triển khai giai đoạn 1"
      },
      {
        id: "INV-2026-002",
        invoiceNumber: "HD-002346",
        itemName: "Gói bảo trì & hỗ trợ kỹ thuật quý 1/2026",
        partnerId: "KH001",
        partnerName: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(10),
        dueDate: addDays(20), // Trong hạn
        totalAmount: 85000000,
        paidAmount: 0,
        notes: "Hợp đồng dịch vụ bảo trì định kỳ"
      },
      {
        id: "INV-2026-003",
        invoiceNumber: "HD-002347",
        itemName: "Bản quyền kiến trúc phần mềm Enterprise",
        partnerId: "KH002",
        partnerName: "Công ty Cổ phần FPT Software",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(70),
        dueDate: subDays(55), // Quá hạn 55 ngày (Nhóm 31-60)
        totalAmount: 120000000,
        paidAmount: 0,
        notes: "Gia hạn license hàng năm"
      },
      {
        id: "INV-2026-004",
        invoiceNumber: "HD-002348",
        itemName: "Dự án chuyển đổi số viễn thông",
        partnerId: "KH003",
        partnerName: "Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(100),
        dueDate: subDays(55), // Quá hạn
        totalAmount: 240000000,
        paidAmount: 240000000, // Đã thanh toán hoàn tất
        notes: "Dự án chuyển đổi số viễn thông - Nghiệm thu hoàn tất"
      },
      {
        id: "INV-2026-005",
        invoiceNumber: "HD-NCC-881",
        itemName: "Thuê hạ tầng Cloud Server 6 tháng đầu năm",
        partnerId: "NCC001",
        partnerName: "Tổng Công ty Công nghệ & Giải pháp CMC",
        type: INVOICE_TYPES.PAYABLE,
        issueDate: subDays(20),
        dueDate: addDays(10), // Trong hạn
        totalAmount: 95000000,
        paidAmount: 0,
        notes: "Gói máy chủ Cloud Dedicated"
      },
      {
        id: "INV-2026-006",
        invoiceNumber: "HD-NCC-882",
        itemName: "5 Máy trạm Workstation Dell Precision 3660",
        partnerId: "NCC002",
        partnerName: "Công ty TNHH Phân Phối Dell Technologies VN",
        type: INVOICE_TYPES.PAYABLE,
        issueDate: subDays(40),
        dueDate: subDays(10), // Quá hạn 10 ngày
        totalAmount: 160000000,
        paidAmount: 60000000,
        notes: "Trang bị cho phòng R&D"
      }
    ];

    // Cập nhật trạng thái tự động theo engine
    invoices = invoices.map(inv => ({
      ...inv,
      status: calculateInvoiceStatus(inv)
    }));

    const payments = [
      {
        id: "PAY-2026-001",
        paymentNumber: "PT-000102",
        partnerId: "KH001",
        partnerName: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        type: "RECEIPT",
        paymentDate: subDays(20),
        amount: 50000000,
        paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
        notes: "Thanh toán đợt 1 cho Hóa đơn HD-002345",
        allocations: [
          { invoiceId: "INV-2026-001", invoiceNumber: "HD-002345", amount: 50000000 }
        ]
      },
      {
        id: "PAY-2026-002",
        paymentNumber: "PT-000103",
        partnerId: "KH003",
        partnerName: "Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)",
        type: "RECEIPT",
        paymentDate: subDays(15),
        amount: 240000000,
        paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
        notes: "Tất toán hóa đơn HD-002348 qua VCB",
        allocations: [
          { invoiceId: "INV-2026-004", invoiceNumber: "HD-002348", amount: 240000000 }
        ]
      },
      {
        id: "PAY-2026-003",
        paymentNumber: "PC-000045",
        partnerId: "NCC002",
        partnerName: "Công ty TNHH Phân Phối Dell Technologies VN",
        type: "PAYMENT",
        paymentDate: subDays(12),
        amount: 60000000,
        paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
        notes: "Tạm ứng mua máy trạm HD-NCC-882",
        allocations: [
          { invoiceId: "INV-2026-006", invoiceNumber: "HD-NCC-882", amount: 60000000 }
        ]
      }
    ];

    const paymentRequests = [
      {
        id: "PR-2026-001",
        requestNumber: "ĐNTT-2026-001",
        partnerId: "NCC001",
        partnerName: "Tổng Công ty Công nghệ & Giải pháp CMC",
        amount: 95000000,
        requestDate: subDays(5),
        deadlineDate: addDays(10),
        paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
        bankName: "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)",
        bankAccount: "0011004567890",
        bankAccountHolder: "TỔNG CÔNG TY CÔNG NGHỆ VÀ GIẢI PHÁP CMC",
        bankBranch: "Chi nhánh Hoàn Kiếm, Hà Nội",
        requesterName: "Nguyễn Văn Hưng",
        department: "Phòng CNTT & Hạ tầng",
        reason: "Thanh toán tiền thuê hạ tầng Cloud Server 6 tháng đầu năm theo HĐ HD-NCC-881",
        invoiceIds: ["INV-2026-005"],
        status: "PENDING",
        createdAt: new Date(today.getTime() - 5 * 86400000).toISOString()
      },
      {
        id: "PR-2026-002",
        requestNumber: "ĐNTT-2026-002",
        partnerId: "NCC002",
        partnerName: "Công ty TNHH Phân Phối Dell Technologies VN",
        amount: 100000000,
        requestDate: subDays(2),
        deadlineDate: addDays(5),
        paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
        bankName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
        bankAccount: "12010000987654",
        bankAccountHolder: "CTY TNHH PHAN PHOI DELL TECHNOLOGIES VN",
        bankBranch: "Chi nhánh Bến Thành, TP.HCM",
        requesterName: "Trần Thị Mai",
        department: "Phòng R&D",
        reason: "Thanh toán đợt 2 - Tất toán hợp đồng 5 máy trạm Workstation Dell Precision HD-NCC-882",
        invoiceIds: ["INV-2026-006"],
        status: "APPROVED",
        createdAt: new Date(today.getTime() - 2 * 86400000).toISOString()
      }
    ];

    return {
      partners,
      invoices,
      payments,
      paymentRequests,
      settings: { ...DEFAULT_SETTINGS }
    };
  }

  /**
   * Xuất toàn bộ CSDL ra file JSON tải về máy
   */
  static exportBackupJSON() {
    const data = this.loadAll();
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", jsonStr);
    dlAnchor.setAttribute("download", `QuanLyCongNo_Backup_${toInputDateFormat(new Date())}.json`);
    dlAnchor.click();
    dlAnchor.remove();
  }

  /**
   * Phục hồi CSDL từ file JSON
   */
  static importBackupJSON(jsonData) {
    if (!jsonData || !Array.isArray(jsonData.partners) || !Array.isArray(jsonData.invoices)) {
      throw new Error("File sao lưu không đúng định dạng chuẩn của ứng dụng!");
    }
    this.saveAll(jsonData);
    return true;
  }
}
