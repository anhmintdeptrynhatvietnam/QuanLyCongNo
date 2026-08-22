---
phase: 6
title: "Ghi nhận công nợ phải thu"
status: pending
priority: P2
effort: "0.5d"
dependencies: [4]
---

# Phase 06: Ghi nhận công nợ phải thu

## Overview

Phát hành bảng kê sinh một `Invoice` type `RECEIVABLE`, để dashboard, phân tích
tuổi nợ, đối chiếu công nợ và khớp nợ FIFO hiện có tự động hoạt động cho nghiệp vụ
cước quốc tế mà không phải viết thêm báo cáo.

## Requirements

**Functional**
- Phát hành bảng kê → tạo `Invoice` phải thu với số tiền = `totals.totalVnd`.
- Phát hành lại **không** sinh hóa đơn trùng.
- Sửa bảng kê đã phát hành → cập nhật hóa đơn liên kết, hoặc chặn nếu hóa đơn đã
  được thanh toán một phần.
- Xoá bảng kê đã phát hành → xử lý hóa đơn liên kết một cách tường minh.
- Từ hóa đơn xem lại được bảng kê gốc, và ngược lại.

**Non-functional**
- Không sửa `Invoice` schema; dùng field có sẵn + một tham chiếu nguồn.

## Architecture

### Lý do

Khách hàng xác nhận: *"bảng kê í là công nợ phải thu mà"*. Bảng kê tháng 6 trị giá
`147.419.655đ` là gốc phát sinh nợ. Đưa nó thành `Invoice` giúp toàn bộ hạ tầng
công nợ đang có dùng lại được ngay:

- `debt-engine.js` → `calculateInvoiceStatus`, `calculateDaysOverdue`,
  `recalculatePartnerBalances`, `autoAllocatePaymentFIFO`, `calculateDashboardKPI`
- báo cáo tuổi nợ, ma trận công nợ 12 tháng, biên bản đối chiếu

### Ánh xạ

```javascript
Invoice {
  id, invoiceNumber: manifest.sheetNo,
  partnerId, partnerName,
  type: INVOICE_TYPES.RECEIVABLE,
  issueDate: manifest.issueDate,
  dueDate: issueDate + partner.creditTermDays,   // xem Open question
  totalAmount: manifest.totals.totalVnd,
  paidAmount: 0,
  status: "UNPAID",
  sourceType: "MANIFEST",        // field mới, không phá schema cũ
  sourceId: manifest.id,
  notes: `Bảng kê cước quốc tế ${manifest.sheetNo} — ${manifest.lines.length} đơn hàng`
}
```

`ManifestSheet.linkedInvoiceId` giữ chiều ngược lại. Hai chiều để tra được từ cả
hai phía mà không phải quét mảng.

Thêm `sourceType` / `sourceId` là mở rộng cộng thêm — hóa đơn nhập tay không có
hai field này và vẫn hoạt động y như cũ.

### Idempotency

Bắt buộc, vì bấm hai lần là chuyện thường và hậu quả là nợ khống 147 triệu.

```
Phát hành:
  nếu manifest.linkedInvoiceId đã có và hóa đơn đó còn tồn tại
     → cập nhật hóa đơn (nếu chưa thu tiền) hoặc báo lỗi (nếu đã thu)
  ngược lại
     → tạo hóa đơn mới, ghi linkedInvoiceId
```

Kiểm tra thêm trùng `invoiceNumber` trên toàn hệ thống trước khi tạo — `sheetNo`
đang do người dùng nhập tay (xem Open question ở `plan.md`).

### Trường hợp đã thu tiền một phần

Nếu hóa đơn liên kết có `paidAmount > 0` mà người dùng sửa bảng kê làm đổi số
tiền: **không tự sửa hóa đơn**. Báo rõ tình trạng và yêu cầu người dùng quyết
định. Tự động điều chỉnh một hóa đơn đã cấn trừ là làm sai sổ.

Cùng nguyên tắc `recalculatePartnerBalances` đang theo: số dư luôn tính lại từ
chứng từ gốc, không sửa tay.

### Xoá bảng kê đã phát hành

Hỏi người dùng, ba lựa chọn: xoá cả hóa đơn (chỉ khi `paidAmount === 0`), giữ hóa
đơn và bỏ liên kết, hoặc hủy thao tác. Không xoá âm thầm hóa đơn có phát sinh
thanh toán.

## Related Code Files

- Modify: `js/state.js` — `issueManifest()`, `unlinkManifestInvoice()`, xử lý xoá
- Modify: `js/config.js` — `INVOICE_SOURCE_TYPES`
- Modify: `js/components/manifests.js` — nút Phát hành + hiển thị hóa đơn liên kết
- Modify: `js/components/invoices.js` — hiện nguồn "Bảng kê" + link về bảng kê
- Modify: `test_manifest_engine.mjs` hoặc `test_runner_node.mjs` — test idempotency

## Implementation Steps

1. `config.js`: `INVOICE_SOURCE_TYPES = { MANUAL, MANIFEST }`.
2. `state.js`: `issueManifest(manifestId)` — tính `totals`, đổi `status` sang
   `ISSUED`, tạo/cập nhật `Invoice`, gọi `recalculatePartnerBalances`, persist.
3. Chặn phát hành khi: còn dòng thiếu tỷ giá, bảng kê không có dòng nào, hoặc
   chưa chọn khách hàng.
4. Nhánh idempotency + nhánh `paidAmount > 0` như trên.
5. `invoices.js`: badge "Bảng kê" cho hóa đơn có `sourceType === "MANIFEST"`, bấm
   vào mở bảng kê gốc; chặn sửa số tiền trực tiếp trên hóa đơn sinh từ bảng kê
   (phải sửa ở bảng kê để hai bên không lệch).
6. Xử lý xoá bảng kê đã phát hành với hộp thoại 3 lựa chọn.
7. Test: phát hành 2 lần → đúng 1 hóa đơn; phát hành → thu tiền → sửa bảng kê →
   bị chặn kèm thông báo rõ.

## Success Criteria

- [ ] Phát hành bảng kê COVATEC tháng 6 sinh hóa đơn phải thu `147.419.655đ`
- [ ] Bấm Phát hành hai lần chỉ có đúng một hóa đơn
- [ ] Dashboard, tuổi nợ, ma trận 12 tháng tính đúng hóa đơn này mà không sửa code
- [ ] `recalculatePartnerBalances` cập nhật đúng dư nợ của khách
- [ ] Hóa đơn đã thu một phần: sửa bảng kê bị chặn kèm thông báo rõ ràng
- [ ] Xoá bảng kê đã phát hành hỏi người dùng, không âm thầm xoá hóa đơn
- [ ] Điều hướng được hai chiều bảng kê ↔ hóa đơn
- [ ] Hóa đơn nhập tay cũ không bị ảnh hưởng bởi `sourceType` / `sourceId`

## Risk Assessment

**Sinh nợ khống do phát hành trùng** — hậu quả tiền thật.
*Signal:* hai hóa đơn cùng `sheetNo`. *Response:* idempotency qua
`linkedInvoiceId` + kiểm tra trùng `invoiceNumber`; test bấm hai lần là tiêu chí
bắt buộc của phase.

**Bảng kê và hóa đơn lệch số** sau khi sửa bảng kê đã phát hành.
*Signal:* `invoice.totalAmount !== manifest.totals.totalVnd`.
*Response:* hóa đơn sinh từ bảng kê không cho sửa số tiền trực tiếp; nếu vẫn lệch
thì thêm cảnh báo đối chiếu ở màn hình bảng kê.

**`sourceType` không có trong dữ liệu cũ** — hóa đơn hiện tại không có field này.
*Signal:* lỗi `undefined` khi render badge nguồn. *Response:* mặc định coi thiếu
field là `MANUAL`; không cần migration.

**Đồng bộ Firestore giữa hai thao tác** — tạo hóa đơn và đổi status bảng kê là hai
thay đổi state. *Signal:* bảng kê `ISSUED` mà không có hóa đơn, hoặc ngược lại.
*Response:* thực hiện cả hai thay đổi trên state rồi persist **một lần**, giống
cách `payment-requests` sinh UNC/Phiếu Chi trong một thao tác.
