---
phase: 5
title: "Xuất Excel gửi khách"
status: completed
priority: P2
effort: "1d"
dependencies: [4]
---

# Phase 05: Xuất Excel gửi khách

## Overview

Xuất bảng kê thành file `.xlsx` có định dạng khớp mẫu khách đang quen nhận: tiêu
đề công ty, khối thông tin người mua, bảng kẻ khung, dòng Grand Total, "Bằng chữ",
khối chữ ký. Gửi được ngay không cần sửa tay.

## Requirements

**Functional**
- Xuất đúng bố cục file mẫu `COVATEC 2026.06.xlsx`.
- Số tiền định dạng có phân cách nghìn; ngày dạng `YYYY-MM-DD`.
- "Bằng chữ" sinh từ `manifestAmountInWords()` (Phase 03) theo quy ước file khách,
  **không** gọi trực tiếp `numberToWordsVN` — xem open question #4 trong `plan.md`.
- Tên file có mã khách + kỳ, ví dụ `COVATEC 2026.06.xlsx`.

**Non-functional**
- Không thêm bước build; thư viện nạp qua CDN như `xlsx` hiện tại.
- Đặt lề hẹp để 26 cột dễ vừa trang. **Không đặt được hướng giấy ngang**: đã kiểm
  bundle `xlsx-js-style` không có chữ `pageSetup` hay `landscape` nào, chỉ hỗ trợ
  `!margins`. Người dùng chọn "Landscape" trong hộp thoại In của Excel.

## Architecture

### Bước 0 — spike: ĐÃ CHẠY, kết luận cần `xlsx-js-style`

Giả thuyết `[Unverified]` ban đầu (bản community không ghi được style ô) **đã được
xác minh là đúng**. Báo cáo đầy đủ:
[`reports/spike-260824-0958-xlsx-style.md`](reports/spike-260824-0958-xlsx-style.md).

Cách kiểm: ghi file rồi giải nén, đọc trực tiếp `xl/styles.xml` — không đọc lại
bằng chính thư viện đó, vì nó có thể bỏ qua style khi đọc.

| Khả năng | `xlsx@0.18.5` | `xlsx-js-style@1.2.0` |
|---|---|---|
| Kẻ khung, in đậm, tô nền, `wrapText` | **không** | **có** |
| Ô trỏ style (`s=`) | **không ô nào** | có |
| Merge, độ rộng cột, định dạng số | có | có |

Bản community **bỏ style một cách im lặng**: không lỗi, file mở được, chỉ là trần
trụi. Không dùng được để gửi khách.

Quyết định: dùng `xlsx-js-style@1.2.0` cho đường ghi. Là fork của đúng `0.18.5`
(`XLSX.version === "0.18.5"`) nên API y hệt. Không cần `ExcelJS`.

**Tránh tranh chấp `window.XLSX`:** bundle của fork ghi đè biến toàn cục mà mọi
đường ĐỌC đang dùng. Nạp theo yêu cầu rồi đổi tên ngay, một lần:

```javascript
const original = window.XLSX;
await loadScriptOnce(FORK_CDN);   // thẻ script ghi đè window.XLSX
window.XLSXStyle = window.XLSX;   // giữ fork dưới tên riêng
window.XLSX = original;           // trả bản community về chỗ cũ
```

Nạp theo yêu cầu cũng tránh cộng ~425 KB vào lần tải trang đầu.

**Không** chọn hướng nhồi dữ liệu vào file template `.xlsx` sẵn: SheetJS không giữ
được style khi đọc-rồi-ghi, nên hướng đó cần thư viện khác nữa mà không lợi hơn.

### Bố cục file xuất (theo đúng mẫu đã đọc)

| Dòng | Nội dung | Merge |
|---|---|---|
| 1 | tên công ty (từ `settings.companyName`) | `A1:K1` |
| 2 | địa chỉ | `A2:Z2` |
| 3 | `MST: …` | `A3:K3` |
| 4 | **BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ** | `A4:Z4` |
| 5 | `Số: {sheetNo}` | `A5:Z5` |
| 6 | `Ngày … tháng … năm …` | `A6:Z6` |
| 8 | `Đơn vị mua hàng:` + tên khách | |
| 9 | `Địa chỉ :` + địa chỉ khách | `A9:B9`, `C9:L9` |
| 10 | `Mã số thuế:` + MST khách | |
| 11 | header 26 cột (wrap text) | |
| 12+ | dòng dữ liệu | |
| n | `Grand Total` + các tổng | `A{n}:K{n}` |
| n+1 | `Thuế GTGT 0%` | |
| n+2 | `Tổng Giá trị thanh toán` + số tiền | |
| n+3 | `*NOTE: TỈ GIÁ TIỀN WON-VND TÍNH THEO NGÀY CHUYỂN HÀNG` | |
| n+4 | `Bằng chữ: …` | |
| n+6 | `Người mua hàng` / `Người bán hàng` / `Thủ trưởng đơn vị` | |
| n+7 | `(ký,ghi rõ họ tên)` … | |

Thông tin công ty lấy từ `state.settings` (module Cài đặt đã có), **không
hardcode** "CÔNG TY TNHH MEI VINA".

### Bố cục cột: sao lại đúng như file gốc

**Đính chính (2026-08-24):** bản kế hoạch trước ghi rằng dòng Grand Total của file
mẫu bị lệch cột và app phải "sửa lại". Kiểm lại bằng SheetJS thì **file gốc đúng
cấu trúc** — tổng của cả 11 cột đều khớp tổng thực của chính cột đó (xem mục "Tình
trạng file nguồn" trong `plan.md`). Không có gì phải sửa.

Nên file xuất ra chỉ cần **sao đúng bố cục cột của file gốc**:

- phí biến đổi theo từng lô → cột **R** (`DELIVERY CHARGE`), không phải cột `FUEL`;
- phí giám sát tờ khai 300.000đ → cột **T** (`PHÍ GIÁM SÁT TỜ KHAI (VND)`);
- `TOTAL AMOUNT (KRW)` cột **X** = `SUM(O:R)`;
- `TOTAL AMOUNT (VND)` cột **Y** = `ROUND(X × Z + T, 0)`;
- tỷ giá của dòng → cột **Z** (`REMARK` theo header, nhưng thực tế chứa tỷ giá).

Cột `FUEL`, `CUSTOMS CHARGE`, `PHÍ PICK`, `Phí Hàn thu hộ` vẫn xuất ra (giữ đúng
số cột để kế toán đối chiếu bằng mắt) nhưng để trống như file gốc.

## Related Code Files

- Create: `js/services/manifest-export.js`
- Modify: `index.html` — thêm CDN thư viện style (nếu spike cho thấy cần)
- Modify: `js/components/manifests.js` — nút "Xuất Excel"
- Modify: `js/config.js` — hằng số bố cục nếu cần

## Implementation Steps

1. **Spike** khả năng ghi style của `xlsx@0.18.5` → đã chạy, kết luận trong
   `reports/spike-260824-0958-xlsx-style.md`.
2. Chốt thư viện theo bảng trên → chọn `xlsx-js-style@1.2.0`.
3. Viết `manifest-export.js`:
   - `buildSheetMatrix(manifest, settings, catalogs)` → mảng 2 chiều (thuần, test được)
   - `applyLayout(worksheet)` → merges, `!cols`, `!rows`, style viền/đậm/wrap
   - `exportManifestToExcel(manifest, …)` → ghi file
4. Tên shipper xuất kèm hậu tố: `` `${shipper.name} ${shipper.customsCleared ? "TQ" : "KTQ"}` ``.
5. Dòng tổng sao đúng bố cục cột của file gốc (xem trên).
6. Đối chiếu bằng mắt với file mẫu; kiểm tra bản in A4 ngang.

## Success Criteria

- [x] Spike có kết luận rõ ràng và được ghi lại thành báo cáo
- [x] File xuất có kẻ khung, header in đậm wrap text, các khối merge đúng
- [x] Thông tin công ty lấy từ Cài đặt, không hardcode
- [x] Shipper xuất ra có đúng một hậu tố `TQ` / `KTQ`
- [x] `Tổng Giá trị thanh toán` = tổng cột `TOTAL AMOUNT (VND)`
- [x] `Bằng chữ` khớp số tiền **và** đúng quy ước đã chốt ở open question #4
      (red team #5)
- [x] Các tổng nằm đúng cột header của chúng, khớp bố cục file gốc
- [x] Mở bằng Excel không có cảnh báo file lỗi
- [x] File có lề hẹp (`!margins`); hướng giấy ngang chọn khi In — thư viện không
      ghi được thiết lập trang, đã kiểm chứng

## Risk Assessment

**Bản community không ghi được style** — rủi ro chính, đã có nhánh xử lý sẵn.
*Signal:* file spike mở ra không có viền/in đậm. *Response:* thêm CDN
`xlsx-js-style` (drop-in, cùng API, không phải viết lại).

**`xlsx-js-style` là fork cộng đồng** — cập nhật chậm, có thể lệch so với upstream.
*Signal:* lỗi khi đọc/ghi file do khách gửi lại. *Response:* chỉ dùng nó cho
đường **ghi** bảng kê; giữ `xlsx` gốc cho mọi đường **đọc** đang có. Hai thư viện
cùng tồn tại là có chủ ý, cần ghi rõ lý do trong `manifest-export.js`.

**File xuất khác file khách đang quen** *Signal:* khách phản hồi "khác file cũ".
*Response:* bố cục cột sao đúng file gốc nên khác biệt duy nhất là phần định dạng;
đối chiếu trực tiếp với file mẫu trước khi gửi khách lần đầu.

**Tăng ~425 KB CDN** *Signal:* trang tải chậm rõ rệt trên mạng yếu.
*Response:* đã nạp theo yêu cầu (chèn thẻ script khi bấm Xuất) thay vì nạp sẵn ở
`index.html`, nên lần tải trang đầu không đổi.

**Lần xuất đầu cần mạng** — fork nạp từ CDN. *Signal:* bấm Xuất khi offline thì
báo lỗi. *Response:* thông báo nói rõ "cần kết nối mạng lần đầu"; sau đó trình
duyệt cache lại. Nếu cần chạy hoàn toàn offline thì tải file về đặt cạnh `index.html`.
