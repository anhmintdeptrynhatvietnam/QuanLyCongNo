---
phase: 2
title: "Danh mục dùng chung & bảng giá"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 02: Danh mục dùng chung & bảng giá

## Overview

Tạo 5 danh mục dùng chung để dòng bảng kê chọn bằng select thay vì gõ tay, và
bảng giá `RateCard` riêng theo từng khách hàng + tuyến vận chuyển.

## Requirements

**Functional**
- CRUD 5 danh mục: Shipper, Consignee, Flight, Port, CargoItem.
- `Shipper` có cờ `customsCleared` (thông quan) — nguồn duy nhất quyết định phí
  giám sát tờ khai, thay cho việc dò chữ `TQ` trong tên gõ tay.
- CRUD `RateCard` gắn `partnerId` + `pol` + `pod`.
- Chặn xoá bản ghi danh mục đang được bảng kê tham chiếu.

**Non-functional**
- Không nhân bản code CRUD: 5 danh mục dùng **một** component chung tham số hoá.

## Architecture

### Vì sao `customsCleared` là cờ, không phải phần của tên

Đã xác minh trên 42 dòng file mẫu: shipper hậu tố `TQ` → có phí 300.000đ
(**20/20**), hậu tố `KTQ` → không có (**22/22**), và `20 × 300.000 = 6.000.000`
khớp đúng ô `T54`.

Trong cùng một tháng, một shipper được gõ 4 kiểu tên khác nhau cộng biến thể
khoảng trắng (`CO.,LTD.KTQ` vs `CO.,LTD KTQ`). Nếu quy tắc phí dựa vào việc dò
chữ `TQ` trong chuỗi, gõ thiếu chữ `K` là lệch 300.000đ và không có cách nào phát
hiện. Tách thành checkbox xoá hẳn lớp lỗi này.

**Cờ nằm trên dòng bảng kê, không nằm trên bản ghi shipper** (quyết định của người
dùng ngày 2026-08-24, sau khi kiểm lại dữ liệu).

Lý do: cột G của file mẫu cho thấy **cùng một công ty xuất hiện ở cả hai dạng** —
`TNHH COVA TEC KTQ` (R12) và `TNHH COVA TEC TQ` (R14); `COVATEC VIETNAM CO., LTD
TQ` (R36) và `... KTQ` (R38). Thông quan vì thế là dữ kiện của **từng lô hàng**,
không phải thuộc tính của công ty.

Nếu đặt cờ trên bản ghi shipper thì mỗi công ty phải có 2 bản ghi (TQ và KTQ), và
chọn nhầm biến thể trong select vẫn lệch 300.000đ mà không có dấu hiệu gì — chỉ
chuyển rủi ro từ gõ sang chọn chứ không xoá.

```javascript
Shipper      { id, name: "COVATEC VIETNAM CO., LTD" }   // một bản ghi mỗi công ty
ManifestLine { shipperId, customsCleared: true, ... }   // cờ ở đây

// Cột SHIPPER khi xuất Excel:
formatShipperName(shipper, line.customsCleared)  // -> "COVATEC VIETNAM CO., LTD TQ"
```

`formatShipperName` là hàm **duy nhất** được phép sinh hậu tố, nên không nơi nào
tự nối chuỗi rồi ra `... TQ TQ`.

**Hệ quả khi nhập danh mục:** tên phải **không có hậu tố**. Nếu người dùng gõ kèm
` TQ`/` KTQ`, form tự bỏ hậu tố và giải thích rằng trạng thái thông quan chọn trên
từng dòng bảng kê.

### Bảng giá theo khách hàng

Khách hàng xác nhận: `20.000 + (kg−1) × 8.750` là **giá riêng đàm phán với
COVATEC**, không phải giá chung. Nên `RateCard` phải gắn `partnerId`.

```javascript
RateCard {
  id, partnerId, pol: "HAN", pod: "SEL",
  baseFee: 20000,        // KRW cho kg đầu tiên
  stepFee: 8750,         // KRW mỗi kg tiếp theo
  currency: "KRW",
  fixedFees: [
    { label: "Phí giám sát tờ khai", amount: 300000,
      currency: "VND", requiresCustoms: true }
  ]
}
```

`requiresCustoms: true` → chỉ áp khi `shipper.customsCleared`. Đây là chỗ nối duy
nhất giữa cờ shipper và số tiền, giữ engine không hardcode 300.000.

`fixedFees` là mảng để về sau thêm loại phí cố định khác mà không phải sửa schema.
Không thêm `tiers[]` bây giờ (YAGNI) — nhưng engine ở Phase 03 phải nhận bảng giá
qua tham số để việc thêm `tiers[]` sau này không phải viết lại công thức.

### Component CRUD chung

5 danh mục chỉ khác nhau ở tập field. Dùng một component nhận cấu hình:

```javascript
const CATALOG_DEFS = {
  shippers:   { label: "Shipper (Người gửi)", fields: [
                  { key: "name", label: "Tên", type: "text", required: true }
               ]},
  consignees: { label: "Consignee (Người nhận)", fields: [ /* name */ ]},
  flights:    { label: "Mã chuyến bay", fields: [ /* code */ ]},
  ports:      { label: "Sân bay / Cảng", fields: [ /* code, name, kind */ ]},
  items:      { label: "Tên sản phẩm", fields: [ /* name */ ]}
};
```

Dữ liệu mồi từ file mẫu để người dùng không phải nhập tay từ đầu: Shipper 3 công
ty (không nhân đôi theo TQ/KTQ); Flight `OZ734`, `KJ374`; Port `HAN`, `SEL`; Item
`PIN BLOCK`, `JIG`, `PINBLOCK PART`; Consignee các biến thể `COVATEC CO.,LTD.`
(`JOONGBU BRANCH`, `DREAM TECH`, `YEOMYEONG`) — nhập như **gợi ý một lần**, không
phải demo data cứng.

### Lưu trữ

```javascript
STORAGE_KEYS.CATALOGS   = "qlcn_catalogs_v1";
STORAGE_KEYS.RATE_CARDS = "qlcn_rate_cards_v1";

state.catalogs  = { shippers: [], consignees: [], flights: [], ports: [], items: [] };
state.rateCards = [];
```

## Related Code Files

- Create: `js/components/catalogs.js` — view danh mục + bảng giá
- Modify: `js/config.js` — `STORAGE_KEYS`, `CATALOG_DEFS`, `PORT_KINDS`, thêm 2
  dòng vào `PERSISTED_BRANCHES` (registry đã dựng ở Phase 01)
- Modify: `js/state.js` — `state.catalogs`, `state.rateCards` + action CRUD
- Modify: `js/app.js` — đăng ký view vào `this.views`
- Modify: `js/components/navigation.js` — thêm `catalogs` vào `validViews`
  (`navigation.js:54`) **và** `titleMap` (`navigation.js:67`) — red team #1
- Modify: `index.html` — nav item
- Modify: `css/views.css`

`js/services/storage.js` **không cần sửa** ở phase này: Phase 01 đã chuyển
`loadAll`/`saveAll`/`exportBackupJSON` sang chạy theo `PERSISTED_BRANCHES`, nên
thêm nhánh mới chỉ là thêm dòng vào registry trong `config.js`.

### Phát sinh khi thực hiện: `state.js` có 7 chỗ gán nhánh, không phải 1

Phase 01 mới chỉ đưa registry vào tầng lưu trữ. Bản thân `state.js` vẫn gán từng
nhánh bằng tay ở **7 chỗ**: `init`, cache local sau đăng nhập, chuyển dữ liệu
Khách, nhánh rỗng, tải Cloud, Realtime sync, **và đăng xuất**.

Chỗ thứ 7 (đăng xuất) đã bị bỏ sót ở Phase 01: nó không nạp lại `exchangeRates`,
nên sau khi đăng xuất, tỷ giá của tài khoản vừa dùng vẫn nằm trong state rồi bị
`recomputeAndPersist` ghi sang khóa lưu trữ của chế độ Khách — vừa hiển thị sai
vừa lẫn dữ liệu giữa hai tài khoản.

Đã thêm `StateStore.applyBranches(source)` duyệt `PERSISTED_BRANCHES` và thay cả
7 chỗ. Nhờ vậy Phase 04 thêm `manifests` không phải sửa chỗ nào trong `state.js`.
Đây là cùng một loại lỗi mà red team #2 chỉ ra, chỉ ở tầng khác.

## Implementation Steps

1. Thêm `STORAGE_KEYS` mới, `CATALOG_DEFS` và 2 dòng `PERSISTED_BRANCHES` vào
   `config.js`.
2. `state.js`: 2 nhánh state, action `upsertCatalogEntry` / `deleteCatalogEntry` /
   `upsertRateCard` / `deleteRateCard`, đưa vào persist + payload Firestore.
2b. Đăng ký route ở cả 3 chỗ: `app.js`, `navigation.js` (`validViews` +
   `titleMap`), `index.html` — red team #1.
3. Viết `catalogs.js`: tab chuyển giữa 5 danh mục + tab bảng giá; form modal dựng
   từ `CATALOG_DEFS` (dùng `Modal` có sẵn).
4. Form Shipper: tự tách hậu tố ` TQ` / ` KTQ` khỏi tên và set cờ tương ứng, có
   thông báo cho người dùng biết đã tách.
5. Form bảng giá: chọn partner từ `state.partners`, nhập `baseFee`/`stepFee`
   (dùng `setupCurrencyInput` có sẵn), quản lý `fixedFees` dạng danh sách thêm/bớt.
6. Chặn xoá: trước khi xoá, quét `state.manifests` xem có tham chiếu id không.
   Phase 02 chạy trước Phase 04 nên `state.manifests` có thể chưa tồn tại → viết
   hàm kiểm tra chịu được mảng rỗng/undefined.
7. Nút "Nhập gợi ý từ file mẫu" để mồi danh mục lần đầu.

## Success Criteria

- [x] Tạo/sửa/xoá được cả 5 danh mục qua một component chung, không code lặp
- [x] Danh mục shipper là một bản ghi mỗi công ty, không mang cờ thông quan
- [x] Gõ tên `COVATEC CO.,LTD TQ` vào form → lưu `COVATEC CO.,LTD`, có giải thích
- [x] Một bản ghi shipper phục vụ được cả dòng TQ và dòng KTQ qua `formatShipperName`
- [x] Tạo được bảng giá COVATEC: `baseFee = 20000`, `stepFee = 8750`, `fixedFees`
      có phí giám sát tờ khai 300.000đ với `requiresCustoms: true`
- [x] Xoá bản ghi đang được tham chiếu bị chặn kèm thông báo rõ đang bị dùng ở đâu
- [x] Dữ liệu sống sót qua reload trang và qua đồng bộ Firestore
- [x] Bấm nav "Danh mục" thật sự mở được view, không rơi về dashboard (red team #1)
- [x] Xuất sao lưu JSON có chứa `catalogs` và `rateCards` (red team #2)

## Risk Assessment

**Tách hậu tố TQ/KTQ sai** → sai tiền hoặc tên xuất ra bị lặp hậu tố.
*Signal:* file Excel xuất ra có `... TQ TQ` hoặc `... KTQ TQ`. *Response:* chỉ
tách khi hậu tố là **token cuối cùng** sau khoảng trắng, không dùng `includes()`;
`KTQ` phải được thử trước `TQ` vì `KTQ` chứa `TQ`.

**Component CRUD tham số hoá bị phình** khi 5 danh mục phân hoá quá nhiều.
*Signal:* `CATALOG_DEFS` phải thêm nhánh `if` theo từng loại. *Response:* tách
riêng form Shipper (loại duy nhất có logic thật) và giữ component chung cho 4 loại
còn lại — abstraction chỉ đáng giữ khi nó còn xoá được trùng lặp.

**Chặn xoá phụ thuộc vào state của phase sau** — Phase 02 xong trước Phase 04.
*Signal:* lỗi `undefined` khi xoá danh mục trước khi có module bảng kê.
*Response:* hàm kiểm tra tham chiếu mặc định coi `state.manifests ?? []`.
