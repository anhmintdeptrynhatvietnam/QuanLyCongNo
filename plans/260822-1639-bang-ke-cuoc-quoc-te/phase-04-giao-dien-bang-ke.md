---
phase: 4
title: "Giao diện bảng kê"
status: pending
priority: P1
effort: "2d"
dependencies: [3]
---

# Phase 04: Giao diện bảng kê

## Overview

View lập bảng kê: nhập trực tiếp trên từng dòng của bảng, các cột lặp lại là
select lấy từ danh mục, nút `[+]` thêm dòng kế thừa lựa chọn của dòng trước, hệ
thống tự tính và hiển thị tổng ngay.

## Requirements

**Functional**
- CRUD `ManifestSheet`: chọn khách hàng, số bảng kê, ngày, bảng giá, biển số xe.
- Bảng nhập inline: sửa tại chỗ trong `<td>`, không qua modal.
- Nút `[+]` thêm dòng, kế thừa `shipperId`, `consigneeId`, `flightCode`, `pol`,
  `pod`, `mode` từ dòng liền trước.
- Xoá dòng, nhân bản dòng, đánh số `no` lại tự động.
- Cột tính toán read-only nhưng cho phép override (ô bị đè đổi màu).
- Cảnh báo rõ ràng khi ngày của dòng **chưa có tỷ giá**.
- Dòng tổng cuối bảng: tổng `C/T`, `G.W/T`, `C.WT`, các cột phí, `TOTAL KRW`,
  `TOTAL VND`, và "Bằng chữ".

**Non-functional**
- 42 dòng nhập liệu không được giật; không re-render toàn bảng sau mỗi ký tự.
- Cột `NO` và `B/L NO` giữ cố định khi cuộn ngang.

## Architecture

### Vì sao inline, không dùng modal

Bảng kê tháng 6 có 42 dòng. Mở modal 42 lần là không dùng được. Nhập inline giống
Excel là hình thái đúng với nghiệp vụ này — đây cũng là yêu cầu người dùng nêu
trực tiếp.

### Vấn đề re-render với `stateStore`

`app.js:39` đăng ký `stateStore.subscribe()` → mỗi `notify()` gọi
`currentViewInstance.mount(state)` → `mount()` (`base-component.js:21`) gán
`container.innerHTML` → **mất focus và mất vị trí con trỏ** của ô đang gõ.

Với 42 dòng × ~20 ô, đây là lỗi chặn tính khả dụng, không phải chuyện tối ưu.

Cách xử lý: **không đẩy từng ký tự vào `stateStore`**. View giữ bản nháp cục bộ:

```javascript
class ManifestsView extends BaseComponent {
  // draft = bảng kê đang sửa, sống trong view, không trong stateStore
  // - input event  → cập nhật draft + tính lại 1 dòng + cập nhật DOM 1 dòng
  // - change/blur  → tính lại tổng
  // - nút Lưu      → đẩy draft vào stateStore (1 lần notify duy nhất)
}
```

Cập nhật DOM ở mức ô/dòng bằng `textContent` của các ô tính toán, không dựng lại
`innerHTML` của bảng. Chỉ dựng lại toàn bảng khi thêm/xoá dòng, và khi đó chủ động
trả focus về ô hợp lý.

`afterRender()` phải gỡ listener cũ trước khi gắn mới để tránh rò rỉ khi
`mount()` được gọi lại — kiểm tra cách `invoices.js` / `payments.js` đang làm và
theo đúng pattern đó.

### Chưa có tỷ giá

Ngày chưa có tỷ giá → `getRateForDate()` trả `null`. Khi đó:
- ô tỷ giá và `TOTAL VND` của dòng hiển thị `—` với nền cảnh báo;
- dòng đó **không tính vào tổng**, và banner đầu bảng ghi rõ *"3 dòng chưa có tỷ
  giá — chưa thể phát hành"*;
- chặn phát hành bảng kê cho tới khi đủ tỷ giá.

Không được lấy tỷ giá gần nhất thay thế: sai tỷ giá là sai tiền gửi cho khách.

### [Red team #3] Cột trọng lượng KHÔNG được dùng `.currency-input`

Rủi ro nặng nhất của phase này. `formatters.js:163,171` — `setupCurrencyInput`
xoá mọi ký tự không phải chữ số rồi `parseInt`:

```javascript
const rawDigits = oldVal.replace(/\D/g, "");
const num = parseInt(rawDigits, 10);
```

`formatters.js:45` lại dùng `.` làm dấu phân cách nghìn — **trùng dấu thập phân**.
Và `base-component.js:24` gọi `initCurrencyInputs(this.container)` sau **mỗi lần
mount**, tự động bind mọi phần tử có class `.currency-input`.

**Kịch bản lỗi:** dữ liệu thật có `C.WT = 10.5` (dòng R32) và `4.5` (R42). Gõ
`10.5` → helper biến thành `105` → `FREIGHT = 20.000 + 104 × 8.750 = 930.000`
thay vì `103.125`. **Sai 9 lần, không một cảnh báo.**

Phân định rõ hai loại ô:

| Cột | Kiểu ô | Class |
|---|---|---|
| `C/T` | số nguyên | `input type="number" step="1"` |
| `G.W/T`, `C.WT` | **thập phân** | `input type="number" step="0.01"` + `.decimal-input` |
| tỷ giá | **thập phân** | `input type="number" step="0.01"` + `.decimal-input` |
| `FREIGHT`, `FUEL`, các cột phí | số nguyên tiền | `.currency-input` (an toàn) |

Thêm một bước kiểm tra khi review: grep `class="currency-input"` trong
`manifests.js` và xác nhận **không** khớp với ô `gwt` / `cwt` / `rate`.

### [Red team #4] Chống ghi đè khi hai người sửa cùng lúc

`state.js:126-140` `listenUserData` thay **cả mảng** khi có snapshot từ máy khác.
Kiến trúc draft ở trên bảo vệ được bản nháp đang gõ, nhưng **không** bảo vệ lúc
lưu: A lưu bảng kê COVATEC → B lưu bảng kê khách khác từ bản `state.manifests`
chưa có sửa đổi của A → **bảng kê của A biến mất**.

Cơ chế tối thiểu (không làm khoá phân tán, quá tầm):

1. `ManifestSheet` có `updatedAt` (ISO) và `updatedBy` (email/uid).
2. Khi mở bảng kê để sửa, view ghi nhớ `updatedAt` lúc đó (`baseUpdatedAt`).
3. Khi bấm Lưu, so `baseUpdatedAt` với `updatedAt` hiện tại trong `stateStore`:
   - khác nhau → **không ghi**, hiện thông báo *"Bảng kê này đã được {updatedBy}
     sửa lúc {updatedAt}. Tải lại để xem thay đổi trước khi lưu."*
   - giống nhau → ghi, cập nhật `updatedAt` / `updatedBy`.
4. Ghi bằng cách **thay đúng một phần tử theo `id`** trong `state.manifests`,
   không thay cả mảng, để lưu đồng thời hai bảng kê khác nhau không đè nhau.

Đây là optimistic concurrency ở mức từng bảng kê — đủ cho vài kế toán dùng chung,
và là điều kiện để mô tả *"cảnh báo nếu bảng kê đã bị thiết bị khác sửa"* thành
cơ chế thật thay vì câu chữ.

### Bố cục bảng

Đúng thứ tự cột của file mẫu để kế toán đối chiếu được bằng mắt:

```
NO | DATE | B/L NO | MÃ CB (diễn giải) | Mã CB | ITEMS | SHIPPER | CONSIGNEE |
MODE | POL | POD | C/T | G.W/T | C.WT | FREIGHT | FUEL | CUSTOMS | DELIVERY |
PHÍ PICK | PHÍ GIÁM SÁT TỜ KHAI | Phí Hàn thu hộ | OVER | OTHER |
TOTAL KRW | TOTAL VND | REMARK
```

Cột `PHÍ PICK`, `CUSTOMS`, `DELIVERY`, `Phí Hàn thu hộ`, `OVER`, `OTHER` trống
toàn bộ tháng 6 → mặc định 0 và **gom vào nhóm cột ẩn được** ("Hiện phí phụ") để
bảng mặc định gọn. Vẫn nhập được khi cần.

Cột diễn giải rất dài → hiển thị rút gọn 1 dòng kèm `title` đầy đủ, không cho
chỉnh trực tiếp (sinh từ template); có nút sửa riêng nếu cần override.

## Related Code Files

- Create: `js/components/manifests.js`
- Modify: `js/config.js` — `STORAGE_KEYS.MANIFESTS`, `MANIFEST_STATUS`,
  `MANIFEST_COLUMNS`, thêm một dòng vào `PERSISTED_BRANCHES`
- Modify: `js/state.js` — `state.manifests` + action CRUD (thay **một phần tử theo
  `id`**, không thay cả mảng — red team #4), persist, payload Firestore
- Modify: `js/app.js` — view + mục trong "Tạo Mới" (`app.js:89-145`)
- Modify: `js/components/navigation.js` — thêm `manifests` vào `validViews`
  (`navigation.js:54`) **và** `titleMap` (`navigation.js:67`) — red team #1
- Modify: `index.html` — nav item
- Modify: `css/views.css` — bảng nhập inline, sticky column, ô override, ô cảnh
  báo, `.decimal-input`

`js/services/storage.js` không cần sửa — registry đã dựng ở Phase 01.

## Implementation Steps

1. `config.js`: `STORAGE_KEYS.MANIFESTS`, `MANIFEST_STATUS` (`DRAFT` / `ISSUED`),
   một dòng `PERSISTED_BRANCHES`, định nghĩa cột (nhãn, **kiểu ô: integer /
   decimal / currency**, read-only, nhóm ẩn được).
2. `state.js`: `state.manifests`, `addManifest` / `updateManifest` /
   `deleteManifest`, persist + payload Firestore. `updateManifest` thay đúng phần
   tử theo `id` và kiểm tra `updatedAt` trước khi ghi (red team #4).
2b. Đăng ký route ở cả 3 chỗ: `app.js`, `navigation.js`, `index.html` (red team #1).
3. Khung view: danh sách bảng kê (dùng lại pattern list + filter của `invoices.js`)
   → chọn một bảng kê để vào chế độ sửa.
4. Form đầu bảng: khách hàng, số bảng kê, ngày, bảng giá, biển số xe, template
   diễn giải. Bảng giá tự chọn theo `partnerId` + `pol`/`pod`; báo lỗi rõ nếu
   khách chưa có bảng giá.
5. Dựng bảng nhập inline từ định nghĩa cột; select lấy từ `state.catalogs`. Ô
   `G.W/T` / `C.WT` dùng `input type="number" step="0.01"`, **tuyệt đối không gắn
   class `.currency-input`** (red team #3).
6. Nút `[+]`: thêm dòng kế thừa các cột danh mục của dòng cuối; focus vào ô
   `B/L NO` của dòng mới.
7. Nối engine: `input` → tính lại dòng đó, cập nhật ô KRW/VND của **dòng đó**;
   `change` → tính lại dòng tổng.
8. Xử lý override: ô tính toán cho sửa, khi sửa thì ghi vào `overrides` và đổi màu
   ô kèm `title` giải thích.
9. Banner thiếu tỷ giá + chặn phát hành.
10. Nút Lưu (ghi `stateStore`) và nút Phát hành (đổi `status` → `ISSUED`, chốt
    `totals`).

## Success Criteria

- [ ] Nhập được 42 dòng liên tục, không mất focus và không mất con trỏ khi gõ
- [ ] `[+]` thêm dòng kế thừa shipper/consignee/mã CB/POL/POD của dòng trước
- [ ] Sửa `C.WT` → `FREIGHT`, `TOTAL KRW`, `TOTAL VND` và dòng tổng cập nhật ngay
- [ ] Dòng có ngày chưa có tỷ giá được đánh dấu, không vào tổng, chặn phát hành
- [ ] Override một ô đã tính → ô đổi màu, giá trị giữ nguyên sau khi tính lại
- [ ] Xoá dòng giữa bảng → cột `NO` đánh số lại liên tục
- [ ] Tổng hiển thị đúng `147.419.655` khi nhập lại dữ liệu tháng 6 của COVATEC
- [ ] Reload trang giữ nguyên bảng kê đã lưu
- [ ] Cuộn ngang giữ cố định cột `NO` và `B/L NO`
- [ ] Gõ `C.WT = 10.5` giữ đúng `10.5`, `FREIGHT` ra `103.125` — không thành
      `105` / `930.000` (red team #3)
- [ ] Grep `currency-input` trong `manifests.js` không khớp ô `gwt` / `cwt` / `rate`
- [ ] Bấm nav "Bảng kê" thật sự mở được view, không rơi về dashboard (red team #1)
- [ ] Lưu 2 bảng kê khác nhau từ 2 tab/máy → cả hai đều còn (red team #4)
- [ ] Lưu bảng kê đã bị nơi khác sửa → bị chặn kèm thông báo nêu ai sửa, lúc nào
- [ ] Xuất sao lưu JSON có chứa `manifests` (red team #2)

## Risk Assessment

**Mất focus do `stateStore.subscribe` re-render toàn view** — rủi ro chặn tính khả
dụng, đã phân tích ở trên. *Signal:* gõ một ký tự vào ô rồi con trỏ nhảy ra.
*Response:* kiến trúc draft cục bộ ở trên. Nếu vẫn bị (do `notify()` từ đồng bộ
Firestore realtime bắn vào giữa lúc gõ) thì cho view bỏ qua `notify` khi đang có ô
trong trạng thái focus, và hiện chỉ báo "có thay đổi từ thiết bị khác" để người
dùng chủ động tải lại.

**Đồng bộ Firestore realtime ghi đè bản nháp đang gõ / mất bảng kê khi lưu đồng
thời** — `state.js:126` `listenUserData` thay cả `state` khi có thay đổi từ máy
khác. *Signal:* đang nhập thì dữ liệu nhảy về bản cũ; hoặc bảng kê vừa lưu biến
mất sau khi người khác lưu. *Response:* draft nằm ngoài `stateStore` nên không bị
ghi đè khi gõ; khi lưu thì dùng optimistic concurrency theo `updatedAt` và thay
đúng phần tử theo `id` — cơ chế đã thiết kế ở mục "[Red team #4]" trên, không
phải chỉ là cảnh báo bằng câu chữ.

**Bảng 26 cột trên màn hình nhỏ** *Signal:* phải cuộn ngang liên tục để nhập một
dòng. *Response:* nhóm cột phí phụ ẩn mặc định (đã thiết kế); nếu vẫn chật thì
thêm chế độ nhập theo thẻ cho từng dòng — không làm trước.

**42 dòng × 20 ô listener** *Signal:* nhập bị trễ rõ rệt. *Response:* gắn listener
bằng event delegation ở cấp `<tbody>`, không gắn từng ô.
