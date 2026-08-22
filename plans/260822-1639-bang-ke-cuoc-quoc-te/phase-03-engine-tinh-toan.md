---
phase: 3
title: "Engine tính toán"
status: pending
priority: P1
effort: "0.5d"
dependencies: [1, 2]
---

# Phase 03: Engine tính toán

## Overview

Toàn bộ nghiệp vụ tính tiền, thuần hàm, không phụ thuộc DOM, có test đối chiếu
42 dòng thật của file mẫu. Đây là phase quyết định tính đúng đắn của cả feature.

## Requirements

**Functional**
- `computeLine()` tính `freightCharge`, `totalKrw`, `totalVnd` cho một dòng.
- `computeSheet()` tổng hợp `totalKrw`, `totalVnd`, `amountInWords`.
- Cho phép **override thủ công** từng ô đã tính: file mẫu có nhiều dòng gõ tay đè
  công thức, nghiệp vụ thật cần điều này.
- Sinh câu diễn giải cột `MÃ CB` từ template có thể cấu hình.

**Non-functional**
- Sai số **0đ** trên cả 42 dòng đối chiếu.
- Không import gì từ `components/` — engine phải test được trong Node.

## Architecture

### Công thức

```
freightCharge = baseFee + (cwt − 1) × stepFee                     [KRW]
totalKrw      = freight + fuel + customsCharge + deliveryCharge
                + krwCollectedForKorea + overCharge + otherCharge  [KRW]
vndFees       = Σ fixedFees áp dụng được + pickFee                 [VND]
totalVnd      = ROUND(totalKrw × rate + vndFees, 0)
```

`fixedFees` áp dụng khi `!fee.requiresCustoms || shipper.customsCleared`.

### Số học tiền tệ: bắt buộc dùng số nguyên

Phép `totalKrw × rate` sinh ra giá trị `.5` ở nhiều dòng thật, và tỷ giá lưu
trong Excel là số thực không chính xác (`18.190000000000001`,
`17.739999999999998`). Nhân trực tiếp bằng float rồi `Math.round` có thể lệch 1đ
vì `x.5` bị tính thành `x.4999999…`.

Các dòng thật rơi đúng vào `.5`: **R23, R24, R28, R32, R42**. Ví dụ R23:

```
totalKrw = 1.108.750, rate = 18.19, phí VND = 300.000
1.108.750 × 18.19 = 20.168.162,5   → +300.000 = 20.468.162,5 → 20.468.163
```

Giải pháp: nhân trước, chia sau, giữ số nguyên tới bước cuối.

```javascript
const RATE_SCALE = 10000;   // tỷ giá nguồn có 2 chữ số thập phân; 4 để dư biên

/**
 * Quy đổi KRW sang VND đúng đến từng đồng.
 * Nhân bằng tỷ giá đã nguyên hoá rồi mới chia, nên giá trị .5 không bị
 * dấu phẩy động làm lệch xuống trước khi làm tròn.
 */
function toVnd(totalKrw, rate, vndFees) {
  const scaledRate = Math.round(rate * RATE_SCALE);
  return Math.round((totalKrw * scaledRate + vndFees * RATE_SCALE) / RATE_SCALE);
}
```

Kiểm tra biên độ: `totalKrw` lớn nhất trong file mẫu là 2.036.250 →
`2.036.250 × 181.900 ≈ 3,7 × 10¹¹`, còn rất xa `Number.MAX_SAFE_INTEGER`
(`9 × 10¹⁵`). An toàn ngay cả khi `totalKrw` lên tới `10⁹`.

`Math.round` làm tròn `.5` lên, trùng với `ROUND` của Excel với mọi số dương —
và mọi giá trị ở đây đều dương.

### Nguyên tắc snapshot

`exchangeRate` được **ghi vào từng dòng** khi nhập, không tra lại lúc render.
Bảng kê đã gửi khách tháng 6 không được đổi số khi tháng 7 ai đó sửa file tỷ giá.
Cùng nguyên tắc mà `payments.allocations` đang dùng.

`computeSheet()` cũng ghi `totals` vào `ManifestSheet` khi phát hành, không tính
lại từ `lines` mỗi lần đọc.

### Override thủ công

```javascript
ManifestLine.overrides = { freightCharge: 25000 }   // chỉ chứa ô bị đè
```

`computeLine()` tính bình thường rồi phủ `overrides` lên trên. UI hiển thị ô bị
đè khác màu để kế toán biết ô đó không còn theo bảng giá. Không xoá `overrides`
khi tính lại — người dùng đã cố ý nhập.

### Câu diễn giải cột `MÃ CB`

File mẫu dùng `CONCATENATE` sinh ra:

```
Cước vận chuyển KCN Tiên Sơn - Hà Nội - SEOUL theo bill số 2002528008,
BKS: 29D-565.94, Mã CB: OZ734
```

`BKS: 29D-565.94` là biển số xe — hardcode trong công thức Excel. Đưa thành
template ở cấp `ManifestSheet`:

```javascript
descriptionTemplate:
  "Cước vận chuyển {route} theo bill số {blNo}, BKS: {truckPlate}, Mã CB: {flightCode}"
```

Lưu ý: dòng 46–53 của file mẫu có cột `D` chứa `OZ734` thay vì câu diễn giải, và
cột `E` (mã chuyến bay) trống — thêm một biểu hiện của việc file bị lệch cột.
Trong app, mã chuyến bay luôn lấy từ `flightCode` của dòng, không bao giờ từ ô
diễn giải.

### [Red team #5] "Bằng chữ" chưa khớp quy ước file khách

`numberToWordsVN` sinh ra:

```
Một trăm bốn mươi bảy triệu bốn trăm mười chín nghìn sáu trăm năm mươi lăm đồng
```

File mẫu ô `A58` ghi:

```
Một trăm bốn mươi bảy triệu, bốn trăm mười chín ngàn, sáu trăm năm mươi lăm đồng chẵn
```

Khác 3 điểm: **ngàn** vs *nghìn* (`formatters.js:59` dùng `"nghìn"`), **có dấu
phẩy** giữa các nhóm, và **có "chẵn"** ở cuối (`formatters.js:117` chỉ gắn
`" đồng"`).

Đây là chữ khách đọc trên file nhận được, nên khác biệt là nhìn thấy được. Tiêu
chí "đọc đúng" trước đây mơ hồ — phải chốt quy ước trước khi làm Phase 05.

**Không sửa `numberToWordsVN`**: hàm này đang được 5 mẫu chứng từ dùng
(`voucher-templates.js:294, 402, 510, 607, 702`) và đổi nó sẽ thay đổi Phiếu Thu /
Phiếu Chi / UNC / Giấy đề nghị thanh toán đang chạy đúng.

Thay vào đó thêm hàm bọc riêng cho bảng kê:

```javascript
/**
 * "Bằng chữ" theo quy ước bảng kê cước quốc tế khách đang nhận:
 * dùng "ngàn", phân cách nhóm bằng dấu phẩy, kết thúc "đồng chẵn".
 * Không sửa numberToWordsVN vì các mẫu chứng từ kế toán khác đang phụ thuộc nó.
 */
function manifestAmountInWords(amount) { … }
```

Quy ước cuối cùng là **open question #4** trong `plan.md` — cần người dùng xác
nhận trước Phase 05. Mặc định tạm: khớp file khách (`ngàn`, dấu phẩy, `chẵn`).

## Related Code Files

- Create: `js/services/manifest-engine.js`
- Create: `test_manifest_engine.mjs` — golden test 42 dòng
- Modify: `js/config.js` — `RATE_SCALE`, `DEFAULT_DESCRIPTION_TEMPLATE`, `DEFAULT_FUEL`
- Modify: `package.json` — thêm script chạy test engine

Không sửa `js/utils/formatters.js`: `manifestAmountInWords` là hàm bọc nằm trong
`manifest-engine.js`, gọi lại `numberToWordsVN` chứ không thay thế nó.

## Implementation Steps

1. Viết `manifest-engine.js` với các hàm thuần:
   - `computeFreight(cwt, rateCard)`
   - `sumKrwCharges(line)`
   - `applicableVndFees(rateCard, shipper, line)`
   - `toVnd(totalKrw, rate, vndFees)`
   - `computeLine(line, ctx)` — `ctx = { rateCard, shipper, rate }`
   - `computeSheet(sheet, ctx)` → `{ totalKrw, totalVnd, amountInWords }`
   - `renderLineDescription(line, sheet)`
2. `manifestAmountInWords()` — bọc `numberToWordsVN` từ `utils/formatters.js` để
   ra quy ước của bảng kê (red team #5). **Không sửa** `numberToWordsVN`: 5 mẫu
   chứng từ đang dùng nó (`voucher-templates.js:294, 402, 510, 607, 702`).
3. Trích 42 dòng file mẫu thành fixture: `date`, `cwt`, `fuel`, `customsCleared`,
   `rate`, và `expectedTotalVnd`. Ghi rõ trong fixture rằng số kỳ vọng lấy từ
   cached value của file gốc.
4. Viết `test_manifest_engine.mjs` theo đúng khuôn `test_runner_node.mjs` (hàm
   `assert` cục bộ, chạy bằng `node`).
5. Chạy test, sửa engine cho tới khi 42/42 khớp **và** tổng bằng `147.419.655`.

## Success Criteria

- [ ] `computeFreight(1, covatec)` = 20.000; `(3)` = 37.500; `(10.5)` = 103.125;
      `(220)` = 1.936.250
- [ ] 42/42 dòng khớp `expectedTotalVnd` **chính xác đến đồng**
- [ ] Tổng `totalVnd` toàn bảng = `147.419.655`
- [ ] 5 dòng có giá trị `.5` (R23, R24, R28, R32, R42) khớp đúng, không lệch 1đ
- [ ] Shipper `customsCleared: false` → không cộng 300.000đ
- [ ] `overrides` phủ được lên ô đã tính và không bị mất khi tính lại
- [ ] `manifestAmountInWords(147419655)` khớp đúng quy ước đã chốt ở open
      question #4 (mặc định: `"Một trăm bốn mươi bảy triệu, bốn trăm mười chín
      ngàn, sáu trăm năm mươi lăm đồng chẵn"`) — red team #5
- [ ] `numberToWordsVN` không bị sửa; 5 mẫu chứng từ cũ in ra y như trước
- [ ] Engine import được trong Node mà không cần DOM

## Risk Assessment

**Sai số dấu phẩy động** — rủi ro chính. *Signal:* golden test lệch ±1đ.
*Response:* đã thiết kế `toVnd()` bằng số nguyên; nếu vẫn lệch thì chuyển tỷ giá
sang lưu dạng số nguyên đã nhân sẵn `krwToVndScaled` ngay từ Phase 01 thay vì
nguyên hoá lúc tính.

**Số kỳ vọng trong fixture lấy từ file đã hỏng** — cột `TOTAL AMOUNT (VND)` của
file mẫu là cached value, không phải kết quả công thức hiện tại.
*Signal:* một dòng không thể khớp bằng bất kỳ tổ hợp phí nào.
*Response:* các số này đã được kiểm tay trên nhiều dòng và khớp mô hình
`totalKrw × rate + phí VND`; nếu có dòng lệch, coi cached value của dòng đó là sai
và **hỏi khách hàng**, không sửa engine cho vừa số.

**Excel `ROUND` vs `Math.round`** khác nhau ở số âm. *Signal:* không có — mọi giá
trị đều dương. *Response:* nếu về sau có phí âm (giảm giá), viết `roundHalfAwayFromZero()`.
