# 📘 TÀI LIỆU KIẾN TRÚC HỆ THỐNG - QUẢN LÝ CÔNG NỢ (DEBT MANAGEMENT)

## 1. Tổng Quan Hệ Thống

Hệ thống **Quản Lý Công Nợ Doanh Nghiệp** được xây dựng theo mô hình **Client-side Single Page Application (SPA)** thuần túy, không sử dụng framework cồng kềnh, không yêu cầu bước biên dịch (zero build step) và lưu trữ tĩnh trên **GitHub Pages**.

Dữ liệu được lưu trữ tự động trên **LocalStorage** (chế độ Offline/Local) và hỗ trợ kết nối đồng bộ đám mây **Cloud Firestore (Firebase)** khi có nhiều kế toán viên cùng làm việc.

---

## 2. Các Phân Tầng Trách Nhiệm (Layered Architecture)

```
┌──────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER (UI)                     │
│  - components/ : dashboard.js, partners.js, invoices.js,        │
│                  payments.js, reports.js, settings.js, modal.js  │
│  - css/        : variables.css, base.css, layout.css,            │
│                  components.css, views.css                       │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ (Dispatches actions / Subscribes)
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   STATE MANAGEMENT LAYER (Store)                 │
│  - state.js    : StateStore (Singleton Pub/Sub)                 │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ (Invokes calculation & persistence)
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER (Engine)                  │
│  - debt-engine.js: calculateInvoiceStatus, calculateDaysOverdue, │
│                    recalculatePartnerBalances,                   │
│                    autoAllocatePaymentFIFO, calculateDashboardKPI│
└─────────────────────────────────┬────────────────────────────────┘
                                  │ (Read / Write Storage)
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DATA ACCESS LAYER (Adapters)                  │
│  - storage.js  : LocalStorage & Backup JSON                      │
│  - firebase.js : Cloud Firestore & Auth SDK                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Cấu Trúc Thực Thể Dữ Liệu (Data Schema)

### 3.1. Đối Tác (`Partner`)
```typescript
interface Partner {
  id: string;               // VD: "KH001" hoặc "P-ABC123"
  code: string;             // VD: "KH-VINAMILK"
  name: string;             // VD: "Công ty Cổ phần Sữa Việt Nam"
  taxCode?: string;         // Mã số thuế
  type: "CUSTOMER" | "VENDOR" | "BOTH";
  phone?: string;
  email?: string;
  address?: string;
  creditLimit: number;      // Hạn mức nợ cho phép (VNĐ)
  creditTermDays: number;   // Số ngày được nợ (VD: 30)
  totalReceivable?: number; // Tự động tính toán bởi debt-engine
  totalPayable?: number;    // Tự động tính toán bởi debt-engine
  overdueReceivable?: number;
  overduePayable?: number;
}
```

### 3.2. Hóa Đơn / Nợ Phát Sinh (`Invoice`)
```typescript
interface Invoice {
  id: string;               // VD: "INV-2026-001"
  invoiceNumber: string;    // Số hóa đơn kế toán, VD: "HD-002345"
  partnerId: string;        // ID đối tác liên kết
  partnerName: string;
  type: "RECEIVABLE" | "PAYABLE";
  issueDate: string;        // YYYY-MM-DD
  dueDate: string;          // YYYY-MM-DD
  totalAmount: number;      // Tổng tiền nợ (VNĐ)
  paidAmount: number;       // Số tiền đã cấn trừ (VNĐ)
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
  notes?: string;
}
```

### 3.3. Phiếu Thanh Toán / Cấn Trừ (`Payment`)
```typescript
interface Payment {
  id: string;               // VD: "PAY-2026-001"
  paymentNumber: string;    // Số phiếu thu / chi, VD: "PT-000102"
  partnerId: string;
  partnerName: string;
  type: "RECEIPT" | "PAYMENT";
  paymentDate: string;      // YYYY-MM-DD
  paymentMethod: "BANK_TRANSFER" | "CASH";
  amount: number;           // Số tiền thanh toán (VNĐ)
  notes?: string;
  allocations: Array<{      // Danh sách hóa đơn được cấn trừ
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
  }>;
}
```

---

## 4. Quy Chuẩn Mở Rộng & Viết Code (Coding Guidelines)

1. **Không sửa đổi số dư thủ công**:
   - Mọi thay đổi về tiền tệ đều phải thông qua `stateStore.addInvoice`, `stateStore.addPayment`, `stateStore.deletePayment`.
   - Hàm `recalculatePartnerBalances` trong `debt-engine.js` sẽ tự động tính toán lại từ các chứng từ gốc.

2. **Quy tắc phân bổ nợ (Payment Allocation)**:
   - Khi khách hàng trả tiền gộp không chỉ định hóa đơn cụ thể, sử dụng `autoAllocatePaymentFIFO` để ưu tiên xóa nợ các hóa đơn cũ nhất trước.

3. **Thêm View mới**:
   - Kế thừa từ `BaseComponent` trong `js/components/base-component.js`.
   - Định nghĩa phương thức `render(state)` và `afterRender(state)`.
   - Đăng ký vào bảng điều hướng `App.views` trong `js/app.js`.
