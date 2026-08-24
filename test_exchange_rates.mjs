/**
 * Kiểm thử phần Tỷ giá theo ngày (Phase 01 - Bảng kê chi tiết cước quốc tế)
 * Chạy: node test_exchange_rates.mjs
 *
 * Các giá trị kỳ vọng lấy trực tiếp từ file nguồn thật:
 *   excel/4- TH TỈ GIÁ.xlsx   (cột B = ngày, D = KRW→VND, E = USD→VND, không có dòng tiêu đề)
 *   excel/COVATEC 2026.06.xlsx (cột Z = tỷ giá đã dùng cho từng dòng bảng kê)
 */

import { ExchangeRateService } from './js/services/exchange-rate-service.js';
import { parseExcelDate } from './js/utils/formatters.js';
import { PERSISTED_BRANCHES } from './js/config.js';

let passed = 0;
let total = 0;

function assert(name, condition, extra = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    console.error(`[FAIL] ${name}`, extra);
  }
}

console.log("\n=== parseExcelDate ===\n");

assert("Chuỗi YYYY-MM-DD", parseExcelDate("2026-06-16") === "2026-06-16");
assert("Chuỗi dạng file tỷ giá 2026.08.17", parseExcelDate("2026.08.17") === "2026-08-17");
assert("Chuỗi DD/MM/YYYY", parseExcelDate("21/05/2026") === "2026-05-21");
assert("Đối tượng Date", parseExcelDate(new Date(2026, 5, 16)) === "2026-06-16");
assert("Ô trống trả null", parseExcelDate(null) === null && parseExcelDate("") === null);
assert("Chuỗi rác trả null", parseExcelDate("không phải ngày") === null);

// Excel serial: 46189 = 2026-06-16 theo hệ 1900 của Excel
assert("Excel serial number", parseExcelDate(46189) === "2026-06-16",
  `nhận được ${parseExcelDate(46189)}`);

console.log("\n=== mapRowsToRates: dữ liệu thật ===\n");

// Trích đúng theo file nguồn: [A: ngày text, B: ngày, C: ngày trong tháng, D: KRW, E: USD, F: bản copy D]
const realRows = [
  [null, null, null, null, null, null],                              // 3 dòng đầu file trống
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  ["2025.09.01", "2025-09-01", 1, 19.75, 26502, 19.75],
  ["2025.09.03", "2025-09-03", 3, 19.79, 26508, 19.79],
  ["2026.05.21", "2026-05-21", 21, 18.3, 26100, 18.3],
  ["2026.06.16", "2026-06-16", 16, 18.100000000000001, 26120, 18.1], // số thực không chính xác như trong file
  ["2026.06.20", "2026-06-20", 20, 17.84, 26130, 17.84],
  ["2026.08.30", "2026-08-30", 30, null, null, null],                // ngày tương lai chưa có tỷ giá
  ["2026.08.31", "2026-08-31", 31, null, null, null]
];

const real = ExchangeRateService.mapRowsToRates(realRows);

assert("Không có lỗi nghiêm trọng", real.fatalError === null, real.fatalError);
assert("Đọc được 5 dòng có tỷ giá", real.rates.length === 5, `nhận được ${real.rates.length}`);
assert("Bỏ qua 2 ngày chưa có tỷ giá", real.skipped === 2, `nhận được ${real.skipped}`);
assert("Không loại dòng nào", real.rejected.length === 0);
assert("Sắp xếp tăng theo ngày", real.rates[0].date === "2025-09-01" && real.rates[4].date === "2026-06-20");

console.log("\n=== getKrwToVnd: khớp tỷ giá bảng kê COVATEC ===\n");

const rates = real.rates;

// Đối chiếu với cột Z của bảng kê COVATEC tháng 6/2026
assert("2026-05-21 -> 18.3 (dòng R12-R16 bảng kê)",
  ExchangeRateService.getKrwToVnd(rates, "2026-05-21") === 18.3,
  `nhận được ${ExchangeRateService.getKrwToVnd(rates, "2026-05-21")}`);

assert("2026-06-16 -> 18.1 (dòng R42-R45 bảng kê)",
  Math.abs(ExchangeRateService.getKrwToVnd(rates, "2026-06-16") - 18.1) < 1e-9,
  `nhận được ${ExchangeRateService.getKrwToVnd(rates, "2026-06-16")}`);

assert("2026-06-20 -> 17.84 (dòng R51-R53 bảng kê)",
  ExchangeRateService.getKrwToVnd(rates, "2026-06-20") === 17.84);

assert("USD tra riêng được", ExchangeRateService.getUsdToVnd(rates, "2026-06-16") === 26120);

console.log("\n=== Không đoán tỷ giá khi thiếu dữ liệu ===\n");

assert("Ngày không có dữ liệu trả null (KHÔNG nội suy)",
  ExchangeRateService.getKrwToVnd(rates, "2026-06-17") === null);
assert("Ngày ngoài khoảng dữ liệu trả null",
  ExchangeRateService.getKrwToVnd(rates, "2030-01-01") === null);
assert("Ngày đã có nhưng tỷ giá trống trả null",
  ExchangeRateService.getKrwToVnd(rates, "2026-08-30") === null);
assert("Ngày rỗng trả null", ExchangeRateService.getKrwToVnd(rates, "") === null);

console.log("\n=== Chặn file bị dịch cột ===\n");

// Mô phỏng file bị dịch 1 cột: tỷ giá USD (~26.000) rơi vào ô đọc KRW
const shiftedRows = [
  ["2026.06.16", "2026-06-16", 16, 26120, 26120, null],
  ["2026.06.17", "2026-06-17", 17, 26118, 26118, null],
  ["2026.06.18", "2026-06-18", 18, 26125, 26125, null]
];
const shifted = ExchangeRateService.mapRowsToRates(shiftedRows);

assert("File dịch cột bị chặn hoàn toàn", shifted.fatalError !== null);
assert("Thông báo chỉ rõ cột đúng",
  shifted.fatalError.includes("cột D") && shifted.fatalError.includes("dịch cột"),
  shifted.fatalError);
assert("Không nhập một phần dữ liệu sai", shifted.rates.length === 0);

// Một dòng sai lẻ giữa nhiều dòng đúng thì chỉ loại dòng đó, không dừng cả file
const mostlyGoodRows = [
  ["", "2026-06-01", 1, 18.2, 26100, null],
  ["", "2026-06-02", 2, 18.21, 26105, null],
  ["", "2026-06-03", 3, 18.22, 26110, null],
  ["", "2026-06-04", 4, 18.23, 26115, null],
  ["", "2026-06-05", 5, 18.24, 26120, null],
  ["", "2026-06-06", 6, 26500, 26125, null] // 1/6 dòng sai -> dưới ngưỡng 20%... sát ngưỡng
];
const mostlyGood = ExchangeRateService.mapRowsToRates(mostlyGoodRows);
assert("Dòng sai lẻ được loại riêng, vẫn nhập phần còn lại",
  mostlyGood.rates.length === 5 && mostlyGood.rejected.length === 1,
  `rates=${mostlyGood.rates.length} rejected=${mostlyGood.rejected.length} fatal=${mostlyGood.fatalError}`);
assert("Báo rõ dòng nào bị loại và vì sao",
  mostlyGood.rejected[0].date === "2026-06-06" &&
  mostlyGood.rejected[0].reason.includes("KRW"),
  JSON.stringify(mostlyGood.rejected[0]));

console.log("\n=== merge: nhập lại không sinh bản trùng ===\n");

const first = ExchangeRateService.merge([], real.rates);
assert("Lần nhập đầu thêm mới toàn bộ", first.added === 5 && first.updated === 0);

const second = ExchangeRateService.merge(first.rates, real.rates);
assert("Nhập lại cùng file không thêm bản ghi mới", second.added === 0);
assert("Nhập lại chỉ cập nhật đè", second.updated === 5);
assert("Tổng số bản ghi không tăng", second.rates.length === 5,
  `nhận được ${second.rates.length}`);

const updatedOne = ExchangeRateService.merge(first.rates, [
  { date: "2026-06-16", krwToVnd: 18.15, usdToVnd: null, source: "MANUAL" }
]);
assert("Sửa tay ghi đè đúng ngày",
  ExchangeRateService.getKrwToVnd(updatedOne.rates, "2026-06-16") === 18.15);
assert("Sửa tay bỏ trống USD thì giữ giá trị cũ",
  ExchangeRateService.getUsdToVnd(updatedOne.rates, "2026-06-16") === 26120);
assert("Sửa tay không làm tăng số bản ghi", updatedOne.rates.length === 5);

console.log("\n=== Lọc theo tháng ===\n");

assert("listByMonth lọc đúng tháng",
  ExchangeRateService.listByMonth(rates, "2026-06").length === 2);
assert("availableMonths mới nhất trước",
  ExchangeRateService.availableMonths(rates)[0] === "2026-06");
assert("availableMonths không trùng lặp",
  new Set(ExchangeRateService.availableMonths(rates)).size ===
  ExchangeRateService.availableMonths(rates).length);

console.log("\n=== Registry lưu trữ (chống mất dữ liệu ngầm khi sao lưu) ===\n");

const branchKeys = PERSISTED_BRANCHES.map(b => b.key);
assert("exchangeRates có trong PERSISTED_BRANCHES", branchKeys.includes("exchangeRates"));
assert("Các nhánh cũ vẫn còn nguyên",
  ["partners", "invoices", "payments", "paymentRequests", "settings"].every(k => branchKeys.includes(k)),
  branchKeys.join(", "));
assert("settings được đánh dấu là object, không phải mảng",
  PERSISTED_BRANCHES.find(b => b.key === "settings").isObject === true);
assert("Mọi nhánh đều có storageKey và fallback",
  PERSISTED_BRANCHES.every(b => typeof b.storageKey === "string" && typeof b.fallback === "function"));

console.log("\n=== StorageService: vòng lưu - đọc lại ===\n");

// localStorage giả lập, giống test_runner_node.mjs
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

const { StorageService } = await import('./js/services/storage.js');

const sampleState = {
  partners: [{ id: "KH001", name: "COVATEC" }],
  invoices: [{ id: "INV-1", totalAmount: 147419655 }],
  // Phiếu chuyển khoản kiểu dữ liệu cũ: chưa có voucherType, số phiếu còn tiền tố PT-
  payments: [{ id: "PAY-1", type: "RECEIPT", paymentMethod: "BANK_TRANSFER", paymentNumber: "PT-000102" }],
  paymentRequests: [{ id: "PR-1", status: "PENDING" }],
  exchangeRates: rates,
  settings: { companyName: "MEI VINA" }
};

StorageService.saveAll(sampleState, null);
const reloaded = StorageService.loadAll(null);

assert("Lưu rồi đọc lại giữ nguyên tỷ giá",
  reloaded.exchangeRates.length === rates.length, `nhận được ${reloaded.exchangeRates?.length}`);
assert("Tra được tỷ giá sau khi đọc lại từ Storage",
  ExchangeRateService.getKrwToVnd(reloaded.exchangeRates, "2026-05-21") === 18.3);
assert("Các nhánh cũ đọc lại nguyên vẹn",
  reloaded.partners.length === 1 && reloaded.invoices.length === 1 &&
  reloaded.paymentRequests.length === 1 && reloaded.settings.companyName === "MEI VINA");

// Bước chuẩn hóa phiếu thanh toán phải còn nguyên sau khi chuyển sang registry
assert("Chuẩn hóa voucherType vẫn chạy sau refactor",
  reloaded.payments[0].voucherType === "RECEIPT_BANK",
  `nhận được ${reloaded.payments[0].voucherType}`);
assert("Đổi tiền tố PT- thành UNT- vẫn chạy sau refactor",
  reloaded.payments[0].paymentNumber === "UNT-000102",
  `nhận được ${reloaded.payments[0].paymentNumber}`);

// exportBackupJSON gọi loadAll, nên loadAll có exchangeRates nghĩa là bản sao lưu cũng có
assert("Bản sao lưu JSON sẽ chứa exchangeRates (loadAll trả về nhánh này)",
  Object.prototype.hasOwnProperty.call(reloaded, "exchangeRates"));

// Lưu từng phần không được xóa nhánh khác
StorageService.saveAll({ invoices: [] }, null);
const afterPartial = StorageService.loadAll(null);
assert("Lưu từng phần không xóa nhánh tỷ giá",
  afterPartial.exchangeRates.length === rates.length);
assert("Lưu từng phần vẫn cập nhật nhánh được chỉ định",
  afterPartial.invoices.length === 0);

// Storage rỗng phải trả về giá trị mặc định đúng kiểu
localStorage.clear();
const empty = StorageService.loadAll(null);
assert("Storage rỗng: mảng trả về mảng rỗng",
  Array.isArray(empty.exchangeRates) && empty.exchangeRates.length === 0);
assert("Storage rỗng: settings trả về object mặc định",
  empty.settings && typeof empty.settings === "object" && !Array.isArray(empty.settings));

console.log("\n=== Định tuyến: route mới phải qua được whitelist ===\n");

// navigation.js có whitelist validViews cứng; thiếu route ở đó thì view đã viết
// xong vẫn không bao giờ mở được và không có lỗi nào báo ra
const navHash = { value: "#exchange-rates" };
global.window = {
  addEventListener: () => {},
  innerWidth: 1440,
  get location() { return { hash: navHash.value }; }
};
const stubEl = { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, contains: () => false, textContent: "", innerHTML: "", style: {}, setAttribute() {}, getAttribute: () => "light" };
global.document = {
  getElementById: () => null,
  querySelector: () => stubEl,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => stubEl,
  documentElement: { setAttribute() {}, getAttribute: () => "light" }
};

const { Navigation } = await import('./js/components/navigation.js');

let routed = null;
Navigation.onRouteChange = (r) => { routed = r; };

Navigation.handleHashChange();
assert("#exchange-rates định tuyến đúng, không rơi về dashboard",
  routed === "exchange-rates", `nhận được "${routed}"`);

navHash.value = "#khong-ton-tai";
Navigation.handleHashChange();
assert("Route không tồn tại vẫn rơi về dashboard như cũ",
  routed === "dashboard", `nhận được "${routed}"`);

navHash.value = "#invoices";
Navigation.handleHashChange();
assert("Các route cũ không bị ảnh hưởng", routed === "invoices", `nhận được "${routed}"`);

console.log("\n=== Ô nhập tỷ giá không được dùng .currency-input ===\n");

// setupCurrencyInput xóa mọi ký tự không phải số -> 18.19 thành 1819.
// initCurrencyInputs tự bind theo class .currency-input sau mỗi lần mount,
// nên chỉ cần gắn sai class là sai tiền, không cần gõ sai.
const { ExchangeRatesView } = await import('./js/components/exchange-rates.js');
const view = new ExchangeRatesView("main-content");
const html = view.render({ exchangeRates: rates });

assert("Ô tỷ giá dùng input số thập phân",
  html.includes('type="number"') && html.includes('step="0.01"'));
assert("Không có class currency-input nào trong view tỷ giá",
  !html.includes("currency-input"),
  "view có ô gắn .currency-input -> giá trị thập phân sẽ bị phá");
assert("Ô KRW cho phép bước 0.01 (nhập được 18.19)",
  /data-field="krwToVnd"/.test(html) && /step="0\.01"/.test(html));
// View mặc định mở tháng mới nhất có dữ liệu (2026-06), nên đối chiếu tỷ giá tháng 6
assert("Giá trị tỷ giá render đúng vào ô",
  html.includes('value="17.84"'), "không thấy value 17.84 trong HTML");
assert("Nhiễu dấu phẩy động không lọt ra ô nhập",
  html.includes('value="18.1"') && !html.includes("18.100000000000001"),
  "value của ô còn chứa 18.100000000000001");
assert("Dòng thiếu tỷ giá được đánh dấu bằng class, không phải màu cứng",
  html.includes("rate-row-missing") || !rates.some(r => !r.krwToVnd));

const emptyHtml = view.render({ exchangeRates: [] });
assert("Chưa có dữ liệu thì hiện hướng dẫn nhập file",
  emptyHtml.includes("Chưa có dữ liệu tỷ giá"));

console.log("\n========================================");
console.log(`Passed: ${passed}/${total}`);
console.log("========================================\n");

process.exit(passed === total ? 0 : 1);
