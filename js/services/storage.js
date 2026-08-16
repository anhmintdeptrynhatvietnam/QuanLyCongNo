/**
 * STORAGE SERVICE - QUẢN LÝ CÔNG NỢ
 * Quản lý lưu trữ LocalStorage, xuất/nhập JSON backup, và nạp dữ liệu mẫu kế toán.
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, PARTNER_TYPES, INVOICE_TYPES, PAYMENT_METHODS } from '../config.js';
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
   * Tải toàn bộ state từ Storage
   */
  static loadAll() {
    let partners = this.getItem(STORAGE_KEYS.PARTNERS, null);
    let invoices = this.getItem(STORAGE_KEYS.INVOICES, null);
    let payments = this.getItem(STORAGE_KEYS.PAYMENTS, null);
    let settings = this.getItem(STORAGE_KEYS.SETTINGS, null);

    // Nếu chưa từng có dữ liệu, tự động khởi tạo bộ dữ liệu mẫu ban đầu
    if (!partners || !invoices) {
      const initial = this.generateDemoData();
      partners = initial.partners;
      invoices = initial.invoices;
      payments = initial.payments;
      settings = initial.settings;

      this.saveAll({ partners, invoices, payments, settings });
    }

    return {
      partners: partners || [],
      invoices: invoices || [],
      payments: payments || [],
      settings: settings || { ...DEFAULT_SETTINGS }
    };
  }

  /**
   * Lưu toàn bộ state vào Storage
   */
  static saveAll({ partners, invoices, payments, settings }) {
    if (partners) this.setItem(STORAGE_KEYS.PARTNERS, partners);
    if (invoices) this.setItem(STORAGE_KEYS.INVOICES, invoices);
    if (payments) this.setItem(STORAGE_KEYS.PAYMENTS, payments);
    if (settings) this.setItem(STORAGE_KEYS.SETTINGS, settings);
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
        partnerId: "KH001",
        partnerName: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(45),
        dueDate: subDays(15), // Quá hạn 15 ngày (Nhóm 1-30)
        totalAmount: 150000000,
        paidAmount: 50000000,
        notes: "Gói giải pháp phần mềm quản trị chuỗi cung ứng đợt 1"
      },
      {
        id: "INV-2026-002",
        invoiceNumber: "HD-002346",
        partnerId: "KH001",
        partnerName: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(10),
        dueDate: addDays(20), // Trong hạn
        totalAmount: 85000000,
        paidAmount: 0,
        notes: "Bảo trì và hỗ trợ kỹ thuật quý 1/2026"
      },
      {
        id: "INV-2026-003",
        invoiceNumber: "HD-002347",
        partnerId: "KH002",
        partnerName: "Công ty Cổ phần FPT Software",
        type: INVOICE_TYPES.RECEIVABLE,
        issueDate: subDays(70),
        dueDate: subDays(55), // Quá hạn 55 ngày (Nhóm 31-60)
        totalAmount: 120000000,
        paidAmount: 0,
        notes: "Cung cấp bản quyền bản vẽ kiến trúc phần mềm"
      },
      {
        id: "INV-2026-004",
        invoiceNumber: "HD-002348",
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
        partnerId: "NCC001",
        partnerName: "Tổng Công ty Công nghệ & Giải pháp CMC",
        type: INVOICE_TYPES.PAYABLE,
        issueDate: subDays(20),
        dueDate: addDays(10), // Trong hạn
        totalAmount: 95000000,
        paidAmount: 0,
        notes: "Thuê hạ tầng Cloud Server 6 tháng đầu năm"
      },
      {
        id: "INV-2026-006",
        invoiceNumber: "HD-NCC-882",
        partnerId: "NCC002",
        partnerName: "Công ty TNHH Phân Phối Dell Technologies VN",
        type: INVOICE_TYPES.PAYABLE,
        issueDate: subDays(40),
        dueDate: subDays(10), // Quá hạn 10 ngày
        totalAmount: 160000000,
        paidAmount: 60000000,
        notes: "Mua 5 máy trạm Workstation Dell Precision"
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

    return {
      partners,
      invoices,
      payments,
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
