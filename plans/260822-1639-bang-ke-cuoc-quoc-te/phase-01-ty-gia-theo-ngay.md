---
phase: 1
title: "Tỷ giá theo ngày"
status: pending
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 01: Tỷ giá theo ngày

## Overview

Import file `4- TH TỈ GIÁ.xlsx` vào hệ thống và cung cấp hàm tra tỷ giá KRW→VND
theo một ngày cụ thể. Đây là dữ liệu nền cho toàn bộ phần tính toán.

## Requirements

**Functional**
- Import `.xlsx` chứa tỷ giá; nhận diện đúng cột dù file **không có dòng header**.
- Tra tỷ giá theo ngày; ngày không có dữ liệu trả về `null` (không nội suy, không
  lấy ngày gần nhất — sai tỷ giá là sai tiền).
- Import lại cùng file → cập nhật đè theo ngày, không sinh bản trùng.
- Bảng xem/sửa tỷ giá theo tháng, sửa tay được một ngày lẻ.

**Non-functional**
- Chặn dữ liệu vô lý ngay khi import (xem "Chống lệch cột" bên dưới).
- 365 bản ghi/năm phải render không giật.

## Architecture

### Cấu trúc file nguồn (đã xác minh)

`dimension = A4:R518`, dữ liệu bắt đầu **dòng 4**, không có header:

| Cột | Index (0-based) | Nội dung |
|---|---|---|
| A | 0 | ngày dạng text `2026.08.17` |
| **B** | **1** | **ngày thật — khóa tra cứu** |
| C | 2 | ngày trong tháng |
| **D** | **3** | **tỷ giá KRW→VND** ← cột `VLOOKUP` lấy |
| E | 4 | tỷ giá USD→VND |
| F | 5 | bản copy của D |

Dữ liệu ngày có từ `2025-09-01` đến `2026-08-31`; các ngày tương lai **đã có ngày
nhưng cột D/E còn trống** → phải bỏ qua chứ không ghi rate `0`.

### Đọc bằng SheetJS ở chế độ mảng

Vì không có header, dùng `header: 1` để lấy mảng thô theo vị trí — không dùng
`sheet_to_json` mặc định như `parseInvoicesFromExcel` (hàm đó dựa vào tên cột).

```javascript
const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
// rows[i][1] = ngày, rows[i][3] = KRW→VND, rows[i][4] = USD→VND
```

Ngày có thể là Excel serial number hoặc `Date`. Tái sử dụng logic nhận diện ngày
đã có trong `export-service.js` (`parseInvoicesFromExcel` xử lý Excel Serial Date,
`DD/MM/YYYY`, `YYYY-MM-DD`) — **trích ra helper dùng chung**, không copy.

### Chống lệch cột (bắt buộc)

Nếu người dùng import file có cột dịch chỗ, hệ thống sẽ lấy USD→VND (~26.500) làm
tỷ giá KRW→VND (~18) → hóa đơn sai **1.400 lần** mà vẫn trông "có số". Chặn bằng
kiểm tra biên:

```javascript
const KRW_VND_RANGE = { min: 10, max: 40 };      // thực tế 17,7 – 19,9
const USD_VND_RANGE = { min: 15000, max: 40000 }; // thực tế 26.4xx
```

Dòng ngoài biên → không nhập, gom vào danh sách `rejected` và báo cho người dùng
kèm số dòng. Nếu **quá 20% dòng bị loại** → dừng toàn bộ import, báo "có thể sai
định dạng file" thay vì nhập một phần.

### Lưu trữ

```javascript
// config.js
STORAGE_KEYS.EXCHANGE_RATES = "qlcn_exchange_rates_v1";

// state
state.exchangeRates = [ { date, krwToVnd, usdToVnd, source } ]  // sort tăng theo date
```

`date` là `YYYY-MM-DD` — cùng quy ước với `Invoice.issueDate`, tra cứu bằng so
sánh chuỗi, không cần parse `Date`.

### [Red team #2] Phải chuyển `storage.js` sang registry trước

`storage.js:86` destructure đúng 5 nhánh có tên:

```javascript
static saveAll({ partners, invoices, payments, paymentRequests, settings }, userId = null)
```

`storage.js:72-78` `loadAll` cũng chỉ trả 5 khóa đó, và `storage.js:361-369`
`exportBackupJSON` gọi `loadAll()`.

Hệ quả nếu chỉ "thêm nhánh mới": kế toán nhập 12 tháng bảng kê, bấm Xuất sao lưu
JSON → file backup **không chứa một bảng kê, một tỷ giá, một danh mục nào**, và
**không có thông báo lỗi** vì `saveAll` chỉ bỏ qua khóa `undefined`. Khôi phục từ
backup đó là mất sạch.

Vá bằng cách thêm 4 tên biến vào destructure sẽ phải lặp lại ở 3 chỗ × 4 phase.
Sửa một lần theo registry:

```javascript
// config.js — một nguồn duy nhất cho mọi nhánh được persist
export const PERSISTED_BRANCHES = [
  { key: "partners",        storageKey: STORAGE_KEYS.PARTNERS,        fallback: () => [] },
  { key: "invoices",        storageKey: STORAGE_KEYS.INVOICES,        fallback: () => [] },
  { key: "payments",        storageKey: STORAGE_KEYS.PAYMENTS,        fallback: () => [] },
  { key: "paymentRequests", storageKey: STORAGE_KEYS.PAYMENT_REQUESTS, fallback: () => [] },
  { key: "settings",        storageKey: STORAGE_KEYS.SETTINGS,        fallback: () => ({ ...DEFAULT_SETTINGS }) },
  { key: "exchangeRates",   storageKey: STORAGE_KEYS.EXCHANGE_RATES,  fallback: () => [] }
];
```

`loadAll`, `saveAll`, `exportBackupJSON` đều duyệt registry. Phase 02 và 04 chỉ
thêm một dòng vào mảng này, không sửa `storage.js` nữa.

**Bảo toàn hành vi cũ:** phần chuẩn hoá `voucherType` / tiền tố `UNT`/`UNC`
(`storage.js:55-70`) phải giữ nguyên như một bước hậu xử lý sau khi load, không
được xoá trong lúc refactor. `importBackupJSON` (`storage.js:374`) giữ nguyên kiểm
tra định dạng hiện tại.

### [Red team #3] Ô sửa tỷ giá không được dùng `.currency-input`

`formatters.js:163,171` — `setupCurrencyInput` **xoá mọi ký tự không phải chữ số**
rồi `parseInt`, và `formatters.js:45` dùng `.` làm dấu phân cách nghìn (trùng dấu
thập phân). `base-component.js:24` tự động bind mọi `.currency-input` sau **mỗi
lần mount**.

Nên ô sửa tay tỷ giá `18.19` nếu gắn class `.currency-input` sẽ thành `1819`.

Dùng input số thập phân thuần cho tỷ giá:

```html
<input type="number" step="0.01" min="0" class="decimal-input" ...>
```

**Không** gắn `.currency-input` cho bất kỳ ô thập phân nào — cả trong phase này và
Phase 04 (cột `G.W/T`, `C.WT`).

## Related Code Files

- Create: `js/services/exchange-rate-service.js`
- Create: `js/components/exchange-rates.js`
- Modify: `js/config.js` — `STORAGE_KEYS.EXCHANGE_RATES`, `PERSISTED_BRANCHES`,
  biên hợp lệ của tỷ giá
- Modify: `js/state.js` — `state.exchangeRates`, `upsertExchangeRates()`, đưa vào
  `loadAll` / `saveAll` / payload Firestore
- Modify: `js/services/storage.js` — **refactor `loadAll` / `saveAll` /
  `exportBackupJSON` sang chạy theo `PERSISTED_BRANCHES`** (red team #2)
- Modify: `js/services/export-service.js` — trích helper parse ngày dùng chung
- Modify: `js/app.js` — đăng ký view vào `this.views`
- Modify: `js/components/navigation.js` — thêm `exchange-rates` vào `validViews`
  (`navigation.js:54`) **và** `titleMap` (`navigation.js:67`). Thiếu bước này thì
  route rơi về `dashboard` và view không bao giờ hiện, không có lỗi nào báo ra.
- Modify: `index.html` — nav item
- Modify: `css/views.css` — bảng tỷ giá theo tháng

## Implementation Steps

1. Thêm `STORAGE_KEYS.EXCHANGE_RATES`, `PERSISTED_BRANCHES` và hằng số biên tỷ giá
   vào `config.js`.
1b. **Refactor `storage.js` theo registry** (red team #2): `loadAll`, `saveAll`,
   `exportBackupJSON` duyệt `PERSISTED_BRANCHES`. Giữ nguyên bước chuẩn hoá
   `voucherType` (`storage.js:55-70`). Kiểm tra: xuất backup JSON rồi khôi phục,
   dữ liệu cũ (đối tác / hóa đơn / thu chi / đề nghị thanh toán) không đổi.
2. Trích logic nhận diện ngày trong `export-service.js` thành helper export được
   (`parseExcelDate`), đổi `parseInvoicesFromExcel` sang dùng helper đó — kiểm tra
   lại import hóa đơn không hồi quy.
3. Viết `exchange-rate-service.js`:
   - `parseExchangeRatesFromExcel(file)` → `{ rates, rejected, error }`
   - `getRateForDate(rates, date)` → `number | null`
   - `mergeRates(existing, incoming)` → upsert theo `date`
4. Nối vào `state.js`: state + action + persist + payload Firestore.
5. View `exchange-rates.js` kế thừa `BaseComponent`: nút import, bảng theo tháng,
   sửa tay một ngày (dùng `input type="number" step="0.01"`, **không** dùng
   `.currency-input` — red team #3), badge đếm số ngày thiếu tỷ giá trong tháng
   đang xem.
6. Đăng ký view: `app.js` (`this.views`), `navigation.js` (`validViews` +
   `titleMap`), nav item trong `index.html`. **Cả ba chỗ**, thiếu `navigation.js`
   là view không vào được.

## Success Criteria

- [ ] Import `4- TH TỈ GIÁ.xlsx` nhập được các ngày có tỷ giá, bỏ qua ngày trống
- [ ] `getRateForDate(rates, "2026-06-16")` trả về `18.1`
- [ ] `getRateForDate(rates, "2026-05-21")` trả về `18.3`
- [ ] Ngày ngoài khoảng dữ liệu trả `null`, không nội suy
- [ ] File có cột lệch bị từ chối kèm thông báo nêu rõ số dòng sai
- [ ] Import lại cùng file không sinh bản ghi trùng ngày
- [ ] Import hóa đơn cũ (`parseInvoicesFromExcel`) vẫn chạy đúng sau khi trích helper
- [ ] Bấm nav "Tỷ giá" thật sự mở được view, không rơi về dashboard (red team #1)
- [ ] Xuất sao lưu JSON có chứa `exchangeRates`; khôi phục lại đúng (red team #2)
- [ ] Xuất/khôi phục backup không làm mất dữ liệu cũ sau khi refactor `storage.js`
- [ ] Sửa tay tỷ giá gõ được `18.19` và lưu đúng `18.19`, không thành `1819` (red team #3)

## Risk Assessment

**Lệch cột im lặng** — rủi ro nghiêm trọng nhất của phase này vì hậu quả là hóa
đơn sai hàng nghìn lần mà không có dấu hiệu bất thường trên giao diện.
*Signal:* dòng bị loại vì ngoài biên. *Response:* đã có kiểm tra biên + ngưỡng
20% ở trên; nếu vẫn lọt thì thêm bước xem trước 5 dòng đầu để người dùng xác nhận
trước khi ghi.

**Trích helper parse ngày làm hồi quy import hóa đơn** — `parseInvoicesFromExcel`
đang hoạt động và không có test tự động.
*Signal:* import file hóa đơn mẫu ra ngày sai. *Response:* giữ nguyên hành vi
helper đúng như code cũ; nếu khó tách an toàn thì để nguyên `export-service.js` và
viết helper riêng cho tỷ giá, chấp nhận trùng lặp có kiểm soát và ghi rõ lý do.

**File tỷ giá không có header** → không thể nhận diện cột theo tên, buộc phụ thuộc
vị trí. *Signal:* khách đổi layout file. *Response:* cho phép chọn cột trong hộp
thoại import (không làm trước — YAGNI).
