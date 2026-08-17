// Node test runner with mock localStorage and window
import { stateStore } from './js/state.js';
import { INVOICE_STATUS, INVOICE_TYPES, PARTNER_TYPES, PAYMENT_REQUEST_STATUS, getVoucherType, VOUCHER_TYPES } from './js/config.js';
import { formatCurrency } from './js/utils/formatters.js';

// Setup mock global environment for Node
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

async function runNodeTests() {
  console.log("🚀 Chạy kiểm thử tự động Node.js...");
  let passed = 0;
  let total = 0;

  function assert(name, condition, extra = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${name}`);
    } else {
      console.error(`❌ [FAIL] ${name}`, extra);
    }
  }

  await stateStore.init();
  assert("Khởi tạo StateStore", stateStore.state !== null);

  stateStore.resetAllData();
  assert("Reset dữ liệu trống", stateStore.state.invoices.length === 0 && stateStore.state.paymentRequests.length === 0);

  // 1. Phân loại chứng từ
  assert("getVoucherType PT (Tiền mặt)", getVoucherType("RECEIPT", "CASH") === VOUCHER_TYPES.RECEIPT_CASH);
  assert("getVoucherType UNT (Ngân hàng)", getVoucherType("RECEIPT", "BANK_TRANSFER") === VOUCHER_TYPES.RECEIPT_BANK);
  assert("getVoucherType PC (Tiền mặt)", getVoucherType("PAYMENT", "CASH") === VOUCHER_TYPES.PAYMENT_CASH);
  assert("getVoucherType UNC (Ngân hàng)", getVoucherType("PAYMENT", "BANK_TRANSFER") === VOUCHER_TYPES.PAYMENT_BANK);

  // 2. Tạo đối tác & hóa đơn
  const p1 = stateStore.addPartner({
    code: "NCC-DELL",
    name: "Dell Technologies VN",
    type: PARTNER_TYPES.VENDOR,
    bankName: "BIDV",
    bankAccount: "12010000987654"
  });

  const inv1 = stateStore.addInvoice({
    invoiceNumber: "HD-DELL-01",
    partnerId: p1.id,
    partnerName: p1.name,
    type: INVOICE_TYPES.PAYABLE,
    totalAmount: 100000000,
    paidAmount: 0,
    issueDate: "2026-08-01",
    dueDate: "2026-08-30"
  });

  assert("Số dư nợ Phải trả của Dell là 100tr", stateStore.state.partners[0].totalPayable === 100000000);

  // 3. Tạo Giấy Đề Nghị Thanh Toán
  const pr = stateStore.addPaymentRequest({
    requestNumber: "ĐNTT-2026-001",
    partnerId: p1.id,
    partnerName: p1.name,
    amount: 100000000,
    requestDate: "2026-08-15",
    paymentMethod: "BANK_TRANSFER",
    bankName: "BIDV",
    bankAccount: "12010000987654",
    reason: "Thanh toán lô máy trạm HD-DELL-01"
  });

  assert("Tạo Giấy Đề Nghị Thanh Toán", pr && pr.status === PAYMENT_REQUEST_STATUS.PENDING);

  // 4. Duyệt ĐNTT
  stateStore.approvePaymentRequest(pr.id);
  assert("Duyệt ĐNTT", stateStore.state.paymentRequests[0].status === PAYMENT_REQUEST_STATUS.APPROVED);

  // 5. Xuất UNC từ ĐNTT
  const payment = stateStore.executePaymentRequestToVoucher(pr.id, {
    paymentDate: "2026-08-16"
  });

  assert("Xuất UNC từ ĐNTT", payment && payment.voucherType === VOUCHER_TYPES.PAYMENT_BANK);
  assert("Trạng thái ĐNTT chuyển sang PAID", stateStore.state.paymentRequests[0].status === PAYMENT_REQUEST_STATUS.PAID);
  assert("Hóa đơn đã được cấn trừ nợ hoàn tất", stateStore.state.invoices[0].paidAmount === 100000000 && stateStore.state.invoices[0].status === INVOICE_STATUS.PAID);
  assert("Số dư nợ Phải trả của Dell về 0đ", stateStore.state.partners[0].totalPayable === 0);

  // 6. Hủy chứng từ UNC -> Hoàn nợ
  stateStore.deletePayment(payment.id);
  assert("Khôi phục ĐNTT về APPROVED sau khi hủy UNC", stateStore.state.paymentRequests[0].status === PAYMENT_REQUEST_STATUS.APPROVED);
  assert("Hoàn nợ hóa đơn về 0đ đã trả", stateStore.state.invoices[0].paidAmount === 0 && stateStore.state.invoices[0].status === INVOICE_STATUS.UNPAID);
  assert("Số dư nợ Phải trả phục hồi 100tr", stateStore.state.partners[0].totalPayable === 100000000);

  // 7. Test formatCurrency
  assert("Format tiền không kèm ký hiệu", formatCurrency(23421758, false) === "23.421.758");
  assert("Format tiền có kèm ký hiệu", formatCurrency(23421758, true) === "23.421.758 ₫");

  console.log(`\n🎉 KẾT QUẢ: ${passed}/${total} TESTS PASSED!`);
  if (passed !== total) process.exit(1);
}

runNodeTests().catch(e => {
  console.error(e);
  process.exit(1);
});
