# 📊 App Quản Lý Công Nợ Doanh Nghiệp (Debt Management System)

Ứng dụng quản lý công nợ chuyên nghiệp dành cho Kế toán doanh nghiệp và Ban Giám đốc. Giải pháp thay thế các bảng tính Excel rời rạc bằng giao diện Web trực quan, dashboard theo dõi nợ thời gian thực, phân tích tuổi nợ và đối chiếu công nợ tự động.

---

## 🌟 Tính Năng Cốt Lõi

1. **Dashboard & Báo cáo Thông minh**:
   - Tổng quan Phải thu (AR) & Phải trả (AP).
   - Biểu đồ phân tích Tuổi nợ (Aging Report: 0-30, 31-60, 61-90, >90 ngày).
   - Dự báo dòng tiền thu/chi theo hạn nợ thực tế.
   - Cảnh báo nợ quá hạn và nợ chạm ngưỡng tín dụng (Credit Limit).

2. **Quản lý Đối Tác 2 Chiều**:
   - Danh bạ Khách hàng & Nhà cung cấp.
   - Theo dõi hạn mức công nợ (Credit Limit) và điều khoản nợ (Payment Terms).
   - Sổ chi tiết công nợ từng đối tượng.

3. **Quản lý Chứng Từ Thanh Toán & Ngân Hàng (Thu Chi & Khớp Nợ)**:
   - Phân định chuẩn kế toán: **Phiếu Thu (PT) / Phiếu Chi (PC)** cho Tiền mặt; **Ủy Nhiệm Thu (UNT) / Ủy Nhiệm Chi (UNC)** cho Chuyển khoản ngân hàng.
   - In biểu mẫu chứng từ A4/A5 chuẩn Bộ Tài Chính (Mẫu 01-TT, 02-TT, Mẫu UNC Ngân hàng).
   - Tự động khớp nợ FIFO vào các hóa đơn còn nợ cũ nhất.

4. **Module Giấy Đề Nghị Thanh Toán (Payment Requests)**:
   - Lập đề nghị thanh toán cho Hóa đơn mua hàng nợ NCC.
   - Quản lý quy trình phê duyệt (Chờ duyệt -> Đã duyệt -> Đã chi tiền).
   - In Giấy Đề Nghị Thanh Toán A4 đầy đủ 4 ô chữ ký chuẩn doanh nghiệp.
   - Nút hành động 1-Click: Duyệt và tự động sinh UNC/Phiếu Chi cấn trừ công nợ ngay lập tức.

5. **Bảng Tổng Hợp Công Nợ 12 Tháng & Đối Chiếu**:
   - Bảng tổng hợp công nợ 12 tháng chuẩn kế toán, định dạng số Tabular Numerals thẳng hàng, chống cắt số.
   - Xuất Biên bản đối chiếu công nợ (PDF / Excel) có đầy đủ chữ ký, xác nhận.
   - Nhập/Xuất dữ liệu Excel hàng loạt nhanh chóng.

---

## 🚀 Kiến Trúc & Công Nghệ

- **Frontend**: Pure Vanilla JS (ES Modules) + CSS Theme Tokens + Chart.js / ApexCharts.
- **Hosting**: GitHub Pages (Tĩnh, tải siêu nhanh, 0đ chi phí server).
- **Backend / Database**: Firebase Authentication + Cloud Firestore (Serverless, Realtime sync, Free Spark Plan).
- **Export & Tools**: SheetJS (XLSX), jsPDF, Lucide Icons.

---

## 🛠 Hướng Dẫn Cài Đặt & Triển Khai

1. Mở trực tiếp `index.html` bằng trình duyệt hoặc dùng Live Server (VS Code).
2. Kết nối cấu hình Firebase của công ty tại mục **Cài đặt**.
3. Triển khai lên **GitHub Pages**:
   - Đẩy mã nguồn lên GitHub: `git push origin main`
   - Vào **Settings** > **Pages** trên GitHub repo -> Chọn branch `main` -> **Save**.
