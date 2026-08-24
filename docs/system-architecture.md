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
│                  payments.js, reports.js, settings.js, modal.js, │
│                  exchange-rates.js                               │
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
│    (cả hai chạy theo registry PERSISTED_BRANCHES - xem mục 3.5)   │
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

### 3.4. Tỷ Giá Ngoại Tệ Theo Ngày (`ExchangeRate`)

Dữ liệu nền cho nghiệp vụ cước quốc tế: mỗi bảng kê quy đổi KRW sang VND theo tỷ
giá của **đúng ngày chuyển hàng**.

```typescript
interface ExchangeRate {
  date: string;             // YYYY-MM-DD, khóa duy nhất
  krwToVnd: number | null;  // VD: 18.19
  usdToVnd: number | null;  // VD: 26120
  source: "EXCEL" | "MANUAL";
}
```

Nhập từ file Excel không có dòng tiêu đề, cột nhận diện theo **vị trí**: cột B =
ngày, cột D = KRW→VND, cột E = USD→VND (`EXCHANGE_RATE_IMPORT` trong `config.js`).

**Hai quy tắc an toàn số liệu, không được nới:**

1. `ExchangeRateService.getKrwToVnd` trả `null` khi ngày không có dữ liệu — **không
   nội suy, không lấy ngày gần nhất**. Sai tỷ giá là sai tiền gửi cho khách.
2. Tỷ giá ngoài biên `EXCHANGE_RATE_BOUNDS` bị loại. Vì cột nhận diện theo vị trí,
   một file bị dịch cột sẽ lấy tỷ giá USD (~26.500) làm tỷ giá KRW (~18) → sai
   khoảng 1.400 lần mà số liệu vẫn trông bình thường. Quá 20% dòng bị loại thì
   dừng cả lần nhập thay vì nhập một phần.

### 3.5. Registry Lưu Trữ (`PERSISTED_BRANCHES`)

`config.js` khai báo một danh sách duy nhất các nhánh state được lưu lâu dài.
`StorageService.loadAll` / `saveAll` / `exportBackupJSON` và
`FirebaseService.saveUserData` đều **duyệt danh sách này**.

```typescript
interface PersistedBranch {
  key: string;              // tên nhánh trong stateStore.state
  storageKey: string;       // khóa LocalStorage
  fallback: () => unknown;  // giá trị mặc định khi chưa có dữ liệu
  isObject?: boolean;       // true cho nhánh là object (settings), false/undefined cho mảng
}
```

**Thêm một nhánh dữ liệu mới chỉ cần thêm một dòng vào registry.** Trước đây bốn
hàm trên liệt kê tên nhánh bằng destructuring riêng lẻ, nên một nhánh mới sẽ bị bỏ
khỏi bản sao lưu JSON và khỏi payload đồng bộ Cloud **mà không báo lỗi** — người
dùng chỉ phát hiện khi khôi phục backup và thấy mất dữ liệu.

---

## 4. Quy Chuẩn Mở Rộng & Viết Code (Coding Guidelines)

1. **Không sửa đổi số dư thủ công**:
   - Mọi thay đổi về tiền tệ đều phải thông qua `stateStore.addInvoice`, `stateStore.addPayment`, `stateStore.deletePayment`.
   - Hàm `recalculatePartnerBalances` trong `debt-engine.js` sẽ tự động tính toán lại từ các chứng từ gốc.

2. **Quy tắc phân bổ nợ (Payment Allocation)**:
   - Khi khách hàng trả tiền gộp không chỉ định hóa đơn cụ thể, sử dụng `autoAllocatePaymentFIFO` để ưu tiên xóa nợ các hóa đơn cũ nhất trước.

3. **Thêm View mới** — phải đăng ký ở **cả ba** chỗ, thiếu một là view không mở được:
   - Kế thừa từ `BaseComponent` trong `js/components/base-component.js`, định nghĩa
     `render(state)` và `afterRender(state)`.
   - Đăng ký vào `App.views` trong `js/app.js`.
   - Thêm route vào **`validViews`** và **`titleMap`** trong
     `js/components/navigation.js`. Route không có trong `validViews` sẽ âm thầm
     rơi về `dashboard`, không có lỗi nào báo ra.
   - Thêm thẻ `<a href="#route" data-view="route">` vào sidebar trong `index.html`.

4. **Ô nhập số thập phân**:
   - Dùng `<input type="number" step="0.01">`, **không** gắn class
     `.currency-input`. `setupCurrencyInput` xóa mọi ký tự không phải chữ số nên
     `18.19` sẽ bị biến thành `1819`, và `BaseComponent.mount` tự động bind mọi
     `.currency-input` sau mỗi lần render.
   - `.currency-input` chỉ dành cho số tiền nguyên (VND).

---

## 5. Cơ Chế Nhập Dữ Liệu Hàng Loạt Từ Excel (Batch Import Engine)

Hệ thống hỗ trợ nhập dữ liệu hàng loạt từ các định dạng `.xlsx`, `.xls`, `.csv` sử dụng thư viện **SheetJS**:

### 5.1. Nhập Danh Bạ Đối Tác (`ExportService.parsePartnersFromExcel`)
- Nhận diện cột linh hoạt không phân biệt dấu và chữ hoa/thường.
- Kiểm tra trùng lặp thông minh theo Mã Đối Tác, Mã Số Thuế và Tên Đối Tác.
- Hỗ trợ 3 chế độ giải quyết trùng lặp: `SKIP` (Bỏ qua), `UPDATE` (Cập nhật đè), `ALLOW` (Thêm tất cả).

### 5.2. Nhập Hóa Đơn & Nợ Phát Sinh (`ExportService.parseInvoicesFromExcel`)
- Tự động nhận diện định dạng ngày tháng (Excel Serial Date, `DD/MM/YYYY`, `YYYY-MM-DD`).
- Tự động tính hạn nợ nếu để trống dựa trên kỳ hạn công nợ của đối tác liên kết.
- Tự động khớp đối tác đã có trong hệ thống và cho phép **tự động tạo mới đối tác** vào danh bạ nếu chưa tồn tại.
- Kiểm tra trùng lặp số hóa đơn trên hệ thống và trong nội bộ file Excel.
- Tự động kích hoạt `recalculatePartnerBalances` để cập nhật tức thời dư nợ 2 chiều và báo cáo tuổi nợ sau khi nhập.

---

## 6. Hệ Thống Theo Dõi Công Nợ 12 Tháng & Bảng Tổng Hợp (Monthly Receivables Intelligence)

Dựa trên biểu mẫu thực tế của doanh nghiệp (`Bảng tổng hợp công nợ phải thu`), hệ thống cung cấp các công cụ trực quan hóa chuyên sâu:

### 6.1. Logic Tổng Hợp Ma Trận 12 Tháng (`calculateMonthlyReceivablesMatrix`)
- Quét và tổng hợp doanh số nợ phát sinh theo 12 tháng (Tháng 1 -> Tháng 12) của năm được chọn.
- Phân tích chi tiết từng đối tác khách hàng: Phát sinh theo tháng, Tổng nợ trong năm, Đã thu về, Dư nợ còn lại, Tỷ lệ thu hồi nợ (%).
- Tính toán tổng hợp toàn doanh nghiệp và xếp hạng Top 10 khách hàng có phát sinh nợ / dư nợ lớn nhất.

### 6.2. Biểu Đồ Trực Quan Trên Dashboard
- **Biểu đồ Cột & Đường 12 Tháng (Monthly Trend Chart)**: So sánh trực quan giữa Doanh số bán nợ mới vs Dòng tiền đã thu về vs Dư nợ gối đầu qua 12 tháng.
- **Biểu đồ Thanh Ngang Top Khách Hàng (Top Debtors Breakdown)**: Phân rã cấu trúc nợ Đã thu vs Còn nợ của các đối tác trọng điểm.

### 6.3. Bảng Ma Trận Công Nợ Excel-style
- Bảng dữ liệu ma trận đa cột với cột Tên Khách Hàng được giữ cố định (sticky column) khi cuộn ngang.
- Thanh tìm kiếm đối tác tức thời và dòng Tổng cộng toàn doanh nghiệp ở chân bảng.
- Chức năng xuất Excel `exportMonthlyReceivablesMatrixToExcel` tạo file Excel chuẩn báo cáo năm của kế toán.


