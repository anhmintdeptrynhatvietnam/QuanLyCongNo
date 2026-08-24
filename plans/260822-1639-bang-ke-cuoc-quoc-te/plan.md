# Bảng Kê Chi Tiết Cước Quốc Tế

**Status:** Not started
**Created:** 2026-08-22
**Branch:** `tinh-nang/bang-ke-cuoc-quoc-te`
**Mode:** planned inline (no research subagents — business logic was derived from
source data in-session; see Evidence Base)

## Outcome

Kế toán lập được "BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ" trên giao diện web: nhập tỷ giá
theo ngày một lần, chọn dữ liệu lặp lại từ danh mục dùng chung, nhập số liệu từng
đơn hàng, hệ thống tự tính cước và quy đổi VND theo tỷ giá ngày chuyển hàng, rồi
xuất Excel gửi khách và ghi nhận công nợ phải thu.

## Constraints

- Vanilla JS ES Modules, zero build step, GitHub Pages hosting.
- Kế thừa `BaseComponent` + `stateStore` pub/sub; không thêm framework.
- Tỷ giá phải được **snapshot vào từng dòng** khi nhập — bảng kê đã gửi khách
  không được đổi số khi tỷ giá về sau bị sửa.
- Tiền tệ: tính toán phải khớp file mẫu **đến từng đồng**.
- Không phá vỡ `Partner` / `Invoice` / `Payment` schema hiện có.

## Non-goals

- Không làm mặt giá vốn (sổ chi phí nhà cung cấp phía Hàn trong file
  `2026-6월 하노이발란스`) — không tính lãi gộp trong phạm vi này.
- Không làm phương thức vận tải ngoài `AIR` (cột MODE cố định).
- Không tự động lấy tỷ giá từ API ngân hàng — chỉ import từ file Excel.

## Acceptance criteria

1. Import `4- TH TỈ GIÁ.xlsx` → tra được tỷ giá KRW→VND của một ngày bất kỳ
   trong khoảng dữ liệu; ngày chưa có tỷ giá được cảnh báo rõ ràng.
2. Engine tái tạo đúng **cả 42/42 dòng** của `COVATEC 2026.06.xlsx`, cột
   `TOTAL AMOUNT (VND)` khớp **chính xác đến đồng**, và tổng bằng `147.419.655`.
3. Shipper là danh mục có cờ `customsCleared`; engine tự cộng phí giám sát tờ
   khai 300.000đ khi cờ bật, và không cộng khi tắt.
4. Thêm dòng mới bằng nút `[+]`, các cột danh mục hiện dưới dạng select và kế
   thừa giá trị của dòng liền trước.
5. Xuất file Excel có tiêu đề, khối thông tin người mua, kẻ khung, dòng Grand
   Total, "Bằng chữ", khối chữ ký — gửi được cho khách không cần sửa tay.
6. Phát hành bảng kê sinh đúng một `Invoice` type `RECEIVABLE`; phát hành lại
   không tạo bản trùng.

## Phases

| Phase | Name | Depends on | Status |
|---|---|---|---|
| 01 | [Tỷ giá theo ngày](phase-01-ty-gia-theo-ngay.md) | — | Complete |
| 02 | [Danh mục dùng chung & bảng giá](phase-02-danh-muc-va-bang-gia.md) | 01 | Complete |
| 03 | [Engine tính toán](phase-03-engine-tinh-toan.md) | 01, 02 | Not started |
| 04 | [Giao diện bảng kê](phase-04-giao-dien-bang-ke.md) | 03 | Not started |
| 05 | [Xuất Excel gửi khách](phase-05-xuat-excel.md) | 04 | Not started |
| 06 | [Ghi nhận công nợ phải thu](phase-06-cong-no-phai-thu.md) | 04 | Not started |

Phase 05 và 06 độc lập với nhau — làm song song được sau khi 04 xong.

## Evidence Base

Nghiệp vụ không suy đoán; toàn bộ được giải mã ngược từ file nguồn và kiểm chứng
lại trên dữ liệu thật:

| Quy tắc | Nguồn | Kiểm chứng |
|---|---|---|
| `FREIGHT = 20.000 + (C.WT − 1) × 8.750` | công thức `O12`, `O45`, `O46` | khớp 20/20 dòng có số liệu |
| `TOTAL_VND = ROUND(TOTAL_KRW × rate + phí_VND, 0)` | công thức `Y12`, `Y13`, … | khớp 6 dòng kiểm tay |
| `rate` tra theo ngày từ file tỷ giá | `Z12 = VLOOKUP(B12,[2]Sheet1!$B:$D,3,0)`; `externalLink2.xml.rels` → `4- TH TỈ GIÁ.xlsx` | link ngoài trỏ đúng file |
| Shipper hậu tố `TQ` → +300.000đ; `KTQ` → không | khách hàng xác nhận qua chat | **20/20** dòng `TQ` có phí, **22/22** dòng `KTQ` không có; `20 × 300.000 = 6.000.000` = đúng ô `T54` |
| Cột `PHÍ PICK` chưa từng được dùng | quét toàn bộ cột S | 300.000đ thực chất là phí giám sát tờ khai (cột T) bị gõ sai cột |

**FUEL không tính được**: cùng `C.WT = 3` có dòng 5.000, dòng 6.000, dòng 50.000.
Mọi dòng `C.WT = 1` đều đúng 5.000 (11/11) → sàn tối thiểu 5.000. Kết luận: phí
nhiên liệu do hãng bay báo theo từng lô → nhập tay, mặc định 5.000.

**Cột `CUSTOMS CHARGE`, `DELIVERY CHARGE`, `Phí Hàn thu hộ`, `OVER CHARGE`,
`OTHER CHARGE` trống toàn bộ tháng 6** → vẫn giữ trong schema để tổng quát, nhưng
UI để mặc định 0 và không bắt buộc nhập.

## Tình trạng file nguồn

`COVATEC 2026.06.xlsx` đang hỏng về cấu trúc, đây là một lý do chính để làm feature:

- Công thức `=SUM(O:R)` (tổng KRW) nằm rải rác **sai cột** giữa các dòng: dòng
  12/17/34 ở cột `S`, dòng 14/15 ở cột `U`, dòng 13/16/20 ở cột `X`.
- `Y = ROUND(X*Z+T,0)` luôn trỏ `X`, nên ở các dòng tổng KRW không nằm ở `X` thì
  `X` đang trống — giá trị đúng chỉ còn tồn tại dưới dạng **cached value**.
- [Inference] Ép recalculate (F9 / sửa một ô) sẽ làm phần lớn cột
  `TOTAL AMOUNT (VND)` về 0 hoặc sai.
- Dòng Grand Total lệch cột: tổng FUEL `891.100` nằm dưới header
  `DELIVERY CHARGE`, còn `P54`/`Q54`/`S54` = 0.
- Cùng một shipper được gõ **4 kiểu tên** trong một tháng (`TNHH COVA TEC`,
  `COVATEC CO.,LTD.`, `COVATEC CO.,LTD`, `COVATEC VIETNAM CO., LTD`) cộng biến
  thể khoảng trắng (`CO.,LTD.KTQ` vs `CO.,LTD KTQ`). Vì quy tắc phí dựa vào việc
  dò chữ `TQ` trong tên gõ tay, gõ thiếu chữ `K` là lệch 300.000đ mà không ai
  phát hiện.

## Data model

```javascript
// Tỷ giá — một bản ghi mỗi ngày
ExchangeRate { date, krwToVnd, usdToVnd, source }

// Danh mục dùng chung
Shipper   { id, name, customsCleared }   // customsCleared → hậu tố TQ/KTQ + phí 300k
Consignee { id, name }
Flight    { id, code }                   // OZ734, KJ374
Port      { id, code, name, kind }       // HAN / SEL; kind: POL | POD | BOTH
CargoItem { id, name }                   // PIN BLOCK, JIG

// Bảng giá — RIÊNG theo khách hàng + tuyến
RateCard { id, partnerId, pol, pod, baseFee, stepFee, currency,
           fixedFees: [{ label, amount, currency, requiresCustoms }] }

// Bảng kê
ManifestSheet { id, sheetNo, issueDate, partnerId, partnerName, rateCardId,
                truckPlate, descriptionTemplate, vatRate,
                lines: ManifestLine[],
                totals: { totalKrw, totalVnd, amountInWords },  // snapshot
                status, linkedInvoiceId,
                updatedAt, updatedBy }   // chống ghi đè khi 2 người sửa cùng lúc

ManifestLine { no, date, blNo, flightCode, itemsText,
               shipperId, consigneeId, mode, pol, pod, ct, gwt, cwt,
               freightCharge, fuel, customsCharge, deliveryCharge,   // KRW
               pickFee, declarationSupervisionFee,                   // VND
               krwCollectedForKorea, overCharge, otherCharge,        // KRW
               totalKrw, exchangeRate, totalVnd,                     // computed
               overrides, remark }
```

## Files

| Đường dẫn | Việc |
|---|---|
| `js/config.js` | thêm STORAGE_KEYS, `PERSISTED_BRANCHES`, enum, hằng số nghiệp vụ |
| `js/state.js` | thêm 4 nhánh state + hành động, đưa vào recompute/persist |
| `js/services/storage.js` | **chuyển `loadAll`/`saveAll`/backup sang chạy theo registry** (Phase 01) |
| `js/components/navigation.js` | thêm route vào `validViews` + `titleMap` — **thiếu là view không vào được** |
| `js/services/exchange-rate-service.js` | **mới** — parse + tra tỷ giá |
| `js/services/manifest-engine.js` | **mới** — toàn bộ tính toán |
| `js/services/manifest-export.js` | **mới** — xuất Excel bảng kê |
| `js/components/exchange-rates.js` | **mới** — view tỷ giá |
| `js/components/catalogs.js` | **mới** — view danh mục + bảng giá |
| `js/components/manifests.js` | **mới** — view bảng kê |
| `js/app.js`, `index.html` | đăng ký 3 view + nav |
| `css/views.css` | style bảng nhập inline |
| `test_manifest_engine.mjs` | **mới** — 42 dòng fixture từ file mẫu (theo quy ước `test_*.mjs` ở gốc repo) |

`js/utils/formatters.js` **không sửa**: ô thập phân dùng `input type="number"
step="0.01"` thuần, và `numberToWordsVN` được bọc bởi `manifestAmountInWords()`
trong `manifest-engine.js` chứ không thay đổi — 5 mẫu chứng từ kế toán đang phụ
thuộc nó (`voucher-templates.js:294, 402, 510, 607, 702`).

## Risks

| Risk | Signal | Pre-decided response |
|---|---|---|
| Sai số dấu phẩy động khi quy đổi tiền | golden test lệch ±1đ ở bất kỳ dòng nào | dùng số nguyên hoá tỷ giá (Phase 03) — đã thiết kế sẵn, không phải chữa cháy |
| SheetJS community không ghi được định dạng | spike Phase 05 xuất ra file không kẻ khung | chuyển sang `xlsx-js-style` (fork cùng API) |
| Vượt hạn mức 1 MiB / document Firestore | payload `saveUserData` chạm ~800 KB | tách `manifests` sang subcollection riêng, một document mỗi bảng kê |
| Bảng giá khách mới khác cấu trúc `base + step` | khách thứ hai không khớp công thức tuyến tính | thêm `tiers[]` vào `RateCard`; engine đã tách bảng giá khỏi công thức |

### Chi tiết risk Firestore

`js/services/firebase.js:275` đồng bộ **toàn bộ** state vào một document duy nhất
`users/{uid}/state/current`. Firestore giới hạn cứng 1 MiB/document.

Ước lượng: một dòng bảng kê ~350 byte JSON → một bảng kê 42 dòng ~15 KB. 10 khách
× 12 tháng = 120 bảng kê ≈ **1,8 MB → vượt hạn mức trong vòng một năm**. Tỷ giá
không đáng lo (~60 byte × 365 ngày ≈ 22 KB/năm).

Đây là điểm duy nhất có thể buộc phải sửa tầng sync. Không xử lý trước trong
Phase 01–06 (YAGNI), nhưng phải theo dõi signal ở trên.

## Open questions

1. **Thư viện xuất Excel** — chốt sau spike đầu Phase 05 (`xlsx-js-style` vs
   `ExcelJS` vs nhồi template). Không chặn Phase 01–04.
2. **Số bảng kê** `MVN - MC/2026` — quy tắc sinh số tự động là gì? Tạm thời cho
   nhập tay, có cảnh báo trùng số.
3. **Hạn thanh toán** của Invoice sinh từ bảng kê — lấy `creditTermDays` của
   partner, hay có điều khoản riêng cho cước quốc tế?
4. **Quy ước "Bằng chữ"** — `numberToWordsVN` hiện đọc `"… bốn trăm mười chín
   nghìn … đồng"`, còn file mẫu ô `A58` ghi `"… bốn trăm mười chín ngàn, … đồng
   chẵn"` (khác 3 điểm: *ngàn* vs *nghìn*, có dấu phẩy, có *chẵn*). Đây là chữ
   khách đọc trên file nhận được. Giữ quy ước của app hay khớp file khách đang
   quen? Xem Phase 03.

## Red Team Review

### Session — 2026-08-22
**Findings:** 6 (5 accepted, 1 rejected)
**Severity breakdown:** 1 Critical, 2 High, 3 Medium
**Cách chạy:** phân tích inline (không spawn subagent, theo chỉ dẫn thường trực
của người dùng). Mọi finding đều có dẫn chứng `file:line` từ codebase thật.

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `navigation.js:54` whitelist route hardcode → 3 view mới không truy cập được | High | Accept | Phase 01, 02, 04 |
| 2 | `storage.js:86` + `:361` → sao lưu JSON mất toàn bộ dữ liệu mới, im lặng | High | Accept | Phase 01 |
| 3 | `formatters.js:163` xoá ký tự không phải số → `C.WT = 10.5` thành `105`, sai cước 9 lần | Critical | Accept | Phase 01, 04 |
| 4 | `state.js:126` thay cả mảng khi sync → 2 kế toán lưu cùng lúc mất bảng kê | Medium | Accept | Phase 04 |
| 5 | `numberToWordsVN` khác quy ước "Bằng chữ" của file khách | Medium | Accept | Phase 03, 05 |
| 6 | `Modal` thiếu primitive hộp thoại 3 lựa chọn | Medium | **Reject** | — |

**Lý do từ chối #6:** `app.js:89-145` đã dựng hộp thoại 4 nút bằng `footerHtml` +
`onOpen` với primitive hiện có. Đủ dùng, plan không cần sửa.

**Non-issue đã ghi nhận:** `config.js:33-40` commit khóa Firebase vào source. Web
API key của Firebase được thiết kế để public; an toàn nằm ở Firestore rules. Rủi
ro thật (rules lỏng làm lộ bảng giá) không kiểm chứng được từ repo nên không tính
thành finding.

**Nhận xét chung:** 3 trong 5 finding được nhận là **thất bại âm thầm** — không
lỗi, không cảnh báo, chỉ có số sai hoặc dữ liệu mất. Đây là loại lỗi tệ nhất với
app kế toán, và là lý do các tiêu chí nghiệm thu tương ứng được viết dưới dạng
kiểm chứng cụ thể chứ không phải "hoạt động đúng".
