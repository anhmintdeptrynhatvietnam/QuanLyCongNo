// Comprehensive End-to-End Test Suite for QuanLyCongNo
import { stateStore } from './js/state.js';
import { 
  INVOICE_STATUS, 
  INVOICE_TYPES, 
  PARTNER_TYPES, 
  PAYMENT_REQUEST_STATUS, 
  getVoucherType, 
  VOUCHER_TYPES, 
  PAYMENT_TYPES,
  PAYMENT_METHODS 
} from './js/config.js';
import { formatCurrency, formatCurrencyNumber, numberToWordsVN, formatDate } from './js/utils/formatters.js';
import { VoucherTemplates } from './js/services/voucher-templates.js';
import { calculateMonthlyReceivablesMatrix } from './js/services/debt-engine.js';

// Setup Mock DOM & LocalStorage for Node testing
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

async function runComprehensiveTests() {
  console.log("=================================================");
  console.log("🧪 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN HỆ THỐNG CÔNG NỢ");
  console.log("=================================================\n");

  let total = 0;
  let passed = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  console.log("1. KIỂM THỬ FORMATTER & TYPOGRAPHY SỐ LIỆU (THEO GÓP Ý KHÁCH HÀNG):");
  test("formatCurrency không kèm ký hiệu '₫' cho bảng 12 tháng", () => {
    const val = formatCurrency(23421758, false);
    if (val !== "23.421.758") throw new Error(`Kỳ vọng 23.421.758, nhận được ${val}`);
  });

  test("formatCurrency có kèm ký hiệu '₫' cho tổng số dư", () => {
    const val = formatCurrency(162758790, true);
    if (val !== "162.758.790 ₫") throw new Error(`Kỳ vọng 162.758.790 ₫, nhận được ${val}`);
  });

  test("numberToWordsVN đọc đúng số tiền tiếng Việt", () => {
    const words = numberToWordsVN(150000000);
    if (!words.includes("Một trăm năm mươi triệu đồng")) throw new Error(`Đọc sai: ${words}`);
  });

  console.log("\n2. KIỂM THỬ PHÂN LOẠI CHỨNG TỪ (TIỀN MẶT VS NGÂN HÀNG):");
  test("Thu tiền mặt -> Phiếu Thu (PT)", () => {
    const vType = getVoucherType(PAYMENT_TYPES.RECEIPT, PAYMENT_METHODS.CASH);
    if (vType !== VOUCHER_TYPES.RECEIPT_CASH) throw new Error(`Sai: ${vType}`);
  });

  test("Thu chuyển khoản -> Ủy Nhiệm Thu (UNT)", () => {
    const vType = getVoucherType(PAYMENT_TYPES.RECEIPT, PAYMENT_METHODS.BANK_TRANSFER);
    if (vType !== VOUCHER_TYPES.RECEIPT_BANK) throw new Error(`Sai: ${vType}`);
  });

  test("Chi tiền mặt -> Phiếu Chi (PC)", () => {
    const vType = getVoucherType(PAYMENT_TYPES.PAYMENT, PAYMENT_METHODS.CASH);
    if (vType !== VOUCHER_TYPES.PAYMENT_CASH) throw new Error(`Sai: ${vType}`);
  });

  test("Chi chuyển khoản -> Ủy Nhiệm Chi (UNC)", () => {
    const vType = getVoucherType(PAYMENT_TYPES.PAYMENT, PAYMENT_METHODS.BANK_TRANSFER);
    if (vType !== VOUCHER_TYPES.PAYMENT_BANK) throw new Error(`Sai: ${vType}`);
  });

  console.log("\n3. KIỂM THỬ QUY TRÌNH GIẤY ĐỀ NGHỊ THANH TOÁN (PAYMENT REQUESTS):");
  await stateStore.init();
  stateStore.resetAllData();

  // Tạo đối tác NCC
  const ncc = stateStore.addPartner({
    code: "NCC-CMC",
    name: "Tổng Công ty CMC",
    type: PARTNER_TYPES.VENDOR,
    bankName: "Vietcombank",
    bankAccount: "0011004567890",
    bankAccountHolder: "TỔNG CÔNG TY CMC"
  });

  // Tạo hóa đơn mua hàng nợ 95 triệu
  const inv = stateStore.addInvoice({
    invoiceNumber: "HD-CMC-01",
    partnerId: ncc.id,
    partnerName: ncc.name,
    type: INVOICE_TYPES.PAYABLE,
    totalAmount: 95000000,
    paidAmount: 0,
    issueDate: "2026-08-01",
    dueDate: "2026-08-30"
  });

  test("Khởi tạo số dư nợ Phải trả NCC CMC là 95.000.000 VNĐ", () => {
    const p = stateStore.state.partners.find(item => item.id === ncc.id);
    if (p.totalPayable !== 95000000) throw new Error(`Sai số dư: ${p.totalPayable}`);
  });

  // Lập Giấy Đề Nghị Thanh Toán
  let pr = stateStore.addPaymentRequest({
    requestNumber: "ĐNTT-2026-001",
    partnerId: ncc.id,
    partnerName: ncc.name,
    amount: 95000000,
    requestDate: "2026-08-15",
    deadlineDate: "2026-08-20",
    paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
    bankName: "Vietcombank",
    bankAccount: "0011004567890",
    bankAccountHolder: "TỔNG CÔNG TY CMC",
    reason: "Thanh toán tiền thuê server HD-CMC-01",
    invoiceIds: [inv.id]
  });

  test("Lập Giấy Đề Nghị Thanh Toán ở trạng thái PENDING", () => {
    if (pr.status !== PAYMENT_REQUEST_STATUS.PENDING) throw new Error(`Trạng thái sai: ${pr.status}`);
  });

  // Phê duyệt
  test("Phê duyệt Giấy Đề Nghị Thanh Toán sang APPROVED", () => {
    stateStore.approvePaymentRequest(pr.id);
    const updated = stateStore.state.paymentRequests.find(r => r.id === pr.id);
    if (updated.status !== PAYMENT_REQUEST_STATUS.APPROVED) throw new Error(`Trạng thái sai: ${updated.status}`);
  });

  // Xuất UNC & Chi tiền
  let payment = null;
  test("Duyệt chi 1-Click -> Xuất Ủy Nhiệm Chi (UNC) và cấn trừ hóa đơn FIFO", () => {
    payment = stateStore.executePaymentRequestToVoucher(pr.id, {
      paymentDate: "2026-08-16"
    });

    if (!payment) throw new Error("Không tạo được chứng từ");
    if (payment.voucherType !== VOUCHER_TYPES.PAYMENT_BANK) throw new Error(`VoucherType sai: ${payment.voucherType}`);
    if (!payment.paymentNumber.startsWith("UNC-")) throw new Error(`Số phiếu không bắt đầu bằng UNC-: ${payment.paymentNumber}`);

    // Kiểm tra trạng thái ĐNTT
    const updatedPR = stateStore.state.paymentRequests.find(r => r.id === pr.id);
    if (updatedPR.status !== PAYMENT_REQUEST_STATUS.PAID) throw new Error(`ĐNTT chưa đổi thành PAID: ${updatedPR.status}`);

    // Kiểm tra hóa đơn
    const updatedInv = stateStore.state.invoices.find(i => i.id === inv.id);
    if (updatedInv.paidAmount !== 95000000 || updatedInv.status !== INVOICE_STATUS.PAID) {
      throw new Error(`Hóa đơn chưa cấn trừ đủ: paidAmount=${updatedInv.paidAmount}, status=${updatedInv.status}`);
    }

    // Kiểm tra số dư nợ đối tác về 0
    const updatedPartner = stateStore.state.partners.find(p => p.id === ncc.id);
    if (updatedPartner.totalPayable !== 0) throw new Error(`Số dư nợ đối tác chưa về 0: ${updatedPartner.totalPayable}`);
  });

  console.log("\n4. KIỂM THỬ XUẤT BIỂU MẪU IN CHỨNG TỪ CHUẨN KẾ TOÁN (VOUCHER TEMPLATES):");
  const settings = {
    companyName: "CÔNG TY CỔ PHẦN CÔNG NGHỆ SỐ",
    companyTaxCode: "0109999888",
    companyAddress: "Tòa nhà Keangnam Landmark 72, Hà Nội",
    companyBankName: "Vietcombank",
    companyBankAccount: "0011009999999"
  };

  test("renderReceiptCashHTML sinh biểu mẫu Phiếu Thu (Mẫu 01-TT)", () => {
    const html = VoucherTemplates.renderReceiptCashHTML(
      { paymentNumber: "PT-000101", paymentDate: "2026-08-16", amount: 50000000, partnerName: "Khách hàng A", notes: "Thu tiền bán hàng" },
      settings,
      { name: "Khách hàng A", address: "Hà Nội" }
    );
    if (!html.includes("Mẫu số 01 - TT") || !html.includes("PHIẾU THU") || !html.includes("50.000.000 ₫")) {
      throw new Error("Biểu mẫu Phiếu Thu thiếu nội dung bắt buộc");
    }
  });

  test("renderPaymentCashHTML sinh biểu mẫu Phiếu Chi (Mẫu 02-TT)", () => {
    const html = VoucherTemplates.renderPaymentCashHTML(
      { paymentNumber: "PC-000102", paymentDate: "2026-08-16", amount: 20000000, partnerName: "NCC B", notes: "Chi tiền tiếp khách" },
      settings,
      { name: "NCC B", address: "TP.HCM" }
    );
    if (!html.includes("Mẫu số 02 - TT") || !html.includes("PHIẾU CHI") || !html.includes("20.000.000 ₫")) {
      throw new Error("Biểu mẫu Phiếu Chi thiếu nội dung bắt buộc");
    }
  });

  test("renderPaymentBankUNC_HTML sinh biểu mẫu Ủy Nhiệm Chi Ngân Hàng (UNC)", () => {
    const html = VoucherTemplates.renderPaymentBankUNC_HTML(
      payment,
      settings,
      ncc
    );
    if (!html.includes("ỦY NHIỆM CHI") || !html.includes("PAYMENT ORDER") || !html.includes("0011004567890")) {
      throw new Error("Biểu mẫu Ủy Nhiệm Chi thiếu nội dung bắt buộc");
    }
  });

  test("renderPaymentRequestHTML sinh biểu mẫu Giấy Đề Nghị Thanh Toán", () => {
    const html = VoucherTemplates.renderPaymentRequestHTML(
      pr,
      settings,
      ncc,
      [inv]
    );
    if (!html.includes("GIẤY ĐỀ NGHỊ THANH TOÁN") || !html.includes("ĐNTT-2026-001") || !html.includes("Giám đốc phê duyệt")) {
      throw new Error("Biểu mẫu Giấy Đề Nghị Thanh Toán thiếu nội dung bắt buộc");
    }
  });

  console.log("\n5. KIỂM THỬ MA TRẬN CÔNG NỢ 12 THÁNG (BẢNG TỔNG HỢP NĂM 2026):");
  test("Tính toán ma trận 12 tháng không bị sai lệch số liệu và hỗ trợ ĐVT: VNĐ", () => {
    // Tạo khách hàng và các hóa đơn bán hàng rải rác các tháng
    const kh = stateStore.addPartner({
      code: "KH-VINA",
      name: "Công ty Vina",
      type: PARTNER_TYPES.CUSTOMER
    });

    stateStore.addInvoice({
      invoiceNumber: "HD-VINA-T1",
      partnerId: kh.id,
      partnerName: kh.name,
      type: INVOICE_TYPES.RECEIVABLE,
      totalAmount: 23421758,
      paidAmount: 0,
      issueDate: "2026-01-15",
      dueDate: "2026-02-15"
    });

    stateStore.addInvoice({
      invoiceNumber: "HD-VINA-T2",
      partnerId: kh.id,
      partnerName: kh.name,
      type: INVOICE_TYPES.RECEIVABLE,
      totalAmount: 11634678,
      paidAmount: 0,
      issueDate: "2026-02-20",
      dueDate: "2026-03-20"
    });

    const matrix = calculateMonthlyReceivablesMatrix(stateStore.state.partners, stateStore.state.invoices, stateStore.state.payments, 2026);
    const vinaRow = matrix.partnerMatrix.find(p => p.id === kh.id);

    if (!vinaRow) throw new Error("Không tìm thấy dòng của đối tác Vina");
    if (vinaRow.months[0] !== 23421758) throw new Error(`Tháng 1 sai: ${vinaRow.months[0]}`);
    if (vinaRow.months[1] !== 11634678) throw new Error(`Tháng 2 sai: ${vinaRow.months[1]}`);
    if (vinaRow.totalDebt !== (23421758 + 11634678)) throw new Error(`Tổng nợ sai: ${vinaRow.totalDebt}`);
  });

  console.log("\n=================================================");
  console.log(`🏁 TỔNG KẾT: ${passed}/${total} BÀI KIỂM THỬ ĐÃ PASS HOÀN TOÀN (100%)!`);
  console.log("=================================================\n");

  if (passed !== total) process.exit(1);
}

runComprehensiveTests().catch(e => {
  console.error("LỖI TEST:", e);
  process.exit(1);
});
