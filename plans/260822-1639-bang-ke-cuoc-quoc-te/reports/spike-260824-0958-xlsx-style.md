# Spike: SheetJS community có ghi được style ô không?

**Ngày:** 2026-08-24 · **Phase:** 05 · **Kết luận:** cần `xlsx-js-style`

## Câu hỏi

`index.html:19` nạp `xlsx@0.18.5` (SheetJS community). Bảng kê gửi khách cần kẻ
khung, in đậm, wrap text, tô nền. Bản community có ghi được style không?

## Cách kiểm

Không đọc lại bằng chính thư viện đó (nó có thể bỏ qua style khi đọc). Thay vào
đó: ghi file, giải nén, đọc trực tiếp `xl/styles.xml` và `xl/worksheets/sheet1.xml`
xem có định nghĩa border/font và ô có trỏ tới style index hay không.

Cùng một đoạn mã, chỉ đổi thư viện.

## Kết quả

| Khả năng | `xlsx@0.18.5` | `xlsx-js-style@1.2.0` |
|---|---|---|
| Kẻ khung (`border`, `thin`) | **không** (1 phần tử border rỗng) | **có** (4 phần tử) |
| Font in đậm `<b/>` | **không** | **có** |
| Tô nền (`fill`) | **không** | **có** |
| `wrapText` | **không** | **có** (`wrapText="true"`) |
| Ô trỏ style (`s=` trong sheet XML) | **không ô nào** | `A2:s=3, B2:s=4, C2:s=4` |
| Merge cell (`!merges`) | có | có |
| Độ rộng cột (`!cols`) | có | có |
| Định dạng số (`z`) | có | có |

Bản community **bỏ style một cách im lặng** — không lỗi, không cảnh báo, file mở
được bình thường nhưng trần trụi. Đúng loại thất bại khó phát hiện nếu chỉ nhìn
"file có tải về không".

## Quyết định

Dùng `xlsx-js-style@1.2.0` cho **đường ghi bảng kê**.

- Là fork của đúng `0.18.5` (`XLSX.version === "0.18.5"`,
  `XLSX.style_version === "1.2.0"`) nên **API y hệt**, không phải viết lại.
- `dist/xlsx.bundle.js` (~425 KB) tự chứa, dùng được qua thẻ `<script>`.
- CDN: `https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js`

Không cần tới `ExcelJS`.

## Vấn đề tranh chấp biến toàn cục

Bundle của fork gán vào `window.XLSX`, tức **ghi đè** bản community đang dùng cho
mọi đường đọc (nhập đối tác, nhập hóa đơn, nhập tỷ giá).

Nạp theo yêu cầu rồi đổi tên ngay, một lần:

```javascript
const original = window.XLSX;
await loadScriptOnce(FORK_CDN);   // thẻ script này ghi đè window.XLSX
window.XLSXStyle = window.XLSX;   // giữ fork dưới tên riêng
window.XLSX = original;           // trả bản community về chỗ cũ
```

Nhờ vậy đường đọc vẫn dùng bản community đã chạy ổn, và fork chỉ dùng khi xuất
bảng kê. Nạp theo yêu cầu cũng tránh cộng 425 KB vào lần tải trang đầu.

## Ghi chú

Đây là kiểm chứng cho giả thuyết ghi `[Unverified]` trong `phase-05-xuat-excel.md`.
Giả thuyết đúng.
