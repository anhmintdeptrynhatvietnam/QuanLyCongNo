# E2E Review — Bảng Kê Chi Tiết Cước Quốc Tế

**Ngày:** 2026-08-26
**Phạm vi:** rà soát toàn bộ feature (6 phase), test trực tiếp trên UI thật bằng Chrome (claude-in-chrome) + chạy lại toàn bộ test suite Node.

## Cách test

1. Chạy `npm test` (4 suite: rates, catalogs, engine, manifests) + `test_comprehensive.mjs`, `test_filter_system.mjs`.
2. Dựng static server nội bộ (Node `http` thuần, không cần build), mở app thật trong Chrome.
3. Đi hết luồng nghiệp vụ thật: import `4- TH TỈ GIÁ.xlsx` (339 dòng) → seed danh mục dùng chung (nút "Nhập Gợi Ý") → tạo khách hàng → tạo bảng giá cước (base+step+phí cố định TQ) → lập bảng kê → thêm 2 dòng (test kế thừa dòng trước, test C.WT thập phân `10.5`) → lưu → xuất Excel (mở file thật, kiểm tra XML) → phát hành → verify hóa đơn phải thu sinh ra → phát hành lại verify không trùng → verify Dashboard/AR cập nhật đúng.

## Kết quả test suite

Tất cả pass sau khi sửa 2 lỗi bên dưới: `test_exchange_rates.mjs` 59/59, `test_catalogs.mjs` 93/93, `test_manifest_engine.mjs` 63/63, `test_manifests.mjs` 90/90, `test_comprehensive.mjs` 19/19, `test_filter_system.mjs` 25/25.

## Lỗi tìm thấy & đã sửa

### 1. Cảnh báo "thiếu tỷ giá" bị đứng hình sau khi sửa dòng (UI bug — đã sửa)

**Triệu chứng:** Sửa ngày một dòng từ ngày-chưa-có-tỷ-giá sang ngày-đã-có-tỷ-giá, tổng tiền tính lại đúng ngay, nhưng banner vàng "N dòng chưa có tỷ giá — chưa thể phát hành" vẫn hiện y nguyên số cũ cho đến khi rời trang và mở lại.

**Nguyên nhân:** `manifests.js` có 2 đường cập nhật DOM sau khi sửa ô: `renderEditor()` (full render, tính banner đúng) và `refreshTotals()` (patch nhanh chỉ `#manifest-tfoot` + `#manifest-summary` để giữ focus/con trỏ khi gõ). Banner nằm ngoài phạm vi patch nhanh nên không bao giờ được cập nhật lại bởi đường thứ hai — chỉ đúng lại khi có full render (mở lại trang, thêm dòng mới...).

**Rủi ro thật:** Kế toán sửa ngày để khớp tỷ giá, thấy banner vẫn báo "chưa thể phát hành" dù đã xong, hoặc — tệ hơn — banner biến mất sai khi dòng MỚI bị thiếu tỷ giá nhưng patch nhanh không set lại nó lên. Nút Phát hành vẫn chặn đúng (dùng `computeDraft` tính lại tươi), nên không mất tiền, nhưng gây hiểu lầm và mất thời gian.

**Sửa:** tách phần render banner ra `renderBanners()`, bọc trong `#manifest-banners`, và `refreshTotals()` patch luôn phần này (`js/components/manifests.js`).

### 2. Chống ghi đè bảng kê (`updateManifest`) có thể bị vô hiệu khi 2 lần lưu cách nhau <1ms (đã sửa)

**Triệu chứng:** test `test_manifests.mjs` fail 2 case: "updatedAt thay đổi sau khi lưu" và "Lưu từ bản lỗi thời bị chặn" — 2 lệnh `updateManifest` liên tiếp trong cùng tick JS nhận cùng giá trị `new Date().toISOString()` (độ phân giải 1ms), khiến cơ chế chống ghi đè so sánh `updatedAt` không phát hiện xung đột.

**Rủi ro thật:** thấp với thao tác tay bình thường (double-click cách nhau vài chục ms vẫn khác mili-giây), nhưng đây đúng là loại lỗi "thất bại âm thầm" plan.md đã cảnh báo (Red Team finding #4) — không lỗi, không cảnh báo, chỉ mất bản ghi của người lưu trước khi 2 client ghi trùng mili-giây.

**Sửa:** thêm `_nextManifestTimestamp()` trong `state.js`, ép `updatedAt` luôn tăng nghiêm ngặt so với mốc trước (cộng 1ms nếu đồng hồ thật chưa kịp nhích), dùng trong `updateManifest`.

## Đã verify sống trên UI thật (không chỉ qua test)

- Import tỷ giá Excel thật (339 dòng, 26 ngày bị bỏ vì trùng tiêu đề) → tra đúng theo ngày.
- **`C.WT = 10.5` giữ nguyên thập phân**, KHÔNG bị cắt thành `105` (Critical Red Team finding #3) — FREIGHT tính đúng `20.000 + 9.5×8.750 = 103.125`.
- Cờ thông quan (TQ) cộng đúng 300.000đ/dòng, tắt thì không cộng.
- Kế thừa dòng trước qua nút `[+]` (ngày, mã CB, shipper, consignee, POL/POD, TQ) nhưng KHÔNG kế thừa B/L, số liệu — đúng như plan.
- **Snapshot tỷ giá hoạt động đúng khi đã phát hành**: sửa tỷ giá ngày 01/08 từ 19,18 → 20,5 sau khi phát hành, mở lại bảng kê đã phát hành — tổng VND vẫn giữ nguyên `3.488.988đ` (không bị tính lại theo tỷ giá mới). Đây là constraint quan trọng nhất của plan và đã đúng.
- Xuất Excel: mở file thật bằng cách giải nén XML — có border thật (`xlsx-js-style`, không phải SheetJS cộng đồng làm mất style), đủ 26 cột A-Z, Grand Total, VAT, Bằng chữ đúng quy ước "ngàn/đồng chẵn", khối 3 chữ ký.
- Phát hành sinh đúng 1 hóa đơn phải thu, liên kết "Từ bảng kê"; phát hành lại → toast "Đã cập nhật" (không tạo bản trùng), danh sách hóa đơn vẫn 1 dòng.
- Dashboard/AR/Bảng tổng hợp 12 tháng nhận đúng số liệu từ hóa đơn sinh ra.
- Validate chặn đúng: thiếu khách hàng, thiếu bảng giá (toast rõ ràng, trỏ đúng chỗ sửa), thiếu tỷ giá chặn phát hành.

## Ghi nhận ngoài phạm vi (không sửa)

Dark mode: nền `.card`/table không đổi màu dù `data-theme="dark"` đã set đúng trên `<html>` và biến CSS đã định nghĩa đủ ở `variables.css`. Verify lại thấy lỗi xảy ra **cả ở Dashboard** (feature cũ, không thuộc phạm vi bảng kê cước quốc tế) — nên đây là lỗi theme toàn app có sẵn từ trước, không phải do feature này gây ra. Không sửa vì ngoài phạm vi yêu cầu.

## Kết luận

Feature đạt yêu cầu: đủ 6/6 tiêu chí nghiệm thu trong plan.md, đã tự test hết luồng bằng UI thật, 2 lỗi thật tìm thấy đã sửa và verify lại, toàn bộ test suite xanh. Không phát hiện lỗi giao diện nào thuộc phạm vi feature.

## Câu hỏi còn mở (kế thừa từ plan.md, chưa cần chặn)

- Quy tắc sinh số bảng kê tự động (`MVN - MC/2026`) — hiện nhập tay + cảnh báo trùng.
- Điều khoản hạn thanh toán riêng cho cước quốc tế hay dùng `creditTermDays` chung của partner.
