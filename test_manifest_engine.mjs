/**
 * Golden test cho manifest-engine (Phase 03)
 * Chạy: node test_manifest_engine.mjs
 *
 * Fixture dưới đây được SINH TỰ ĐỘNG từ excel/COVATEC 2026.06.xlsx bằng SheetJS,
 * không gõ lại tay. Cột theo header dòng 11 của file:
 *   N C.WT | O FREIGHT(KRW) | R DELIVERY CHARGE(KRW) | T PHÍ GIÁM SÁT(VND)
 *   X TOTAL KRW | Y TOTAL VND | Z tỷ giá
 *
 * `tq` suy ra từ hậu tố TQ/KTQ ở cột G (SHIPPER) và trùng khớp với việc ô T có
 * 300.000đ hay không: 20 dòng TQ / 22 dòng KTQ, tổng T54 = 6.000.000.
 *
 * Giá trị kỳ vọng là cached value của file gốc. Công thức trong file nhất quán ở
 * cả 42 dòng (O = bảng giá, X = SUM(O:R), Y = ROUND(X*Z+T,0)) nên các số này là
 * kết quả công thức, không phải số gõ tay.
 */

import {
  computeFreight, sumKrwCharges, applicableVndFees, toVnd,
  computeLine, computeSheet, manifestAmountInWords,
  renderLineDescription, createLine
} from './js/services/manifest-engine.js';
import { RATE_SCALE, DEFAULT_DELIVERY_CHARGE } from './js/config.js';

let passed = 0;
let total = 0;

function assert(name, condition, extra = "") {
  total++;
  if (condition) { passed++; console.log(`[PASS] ${name}`); }
  else console.error(`[FAIL] ${name}`, extra);
}

/** Bảng giá riêng của COVATEC, đúng như đã dựng ở Phase 02. */
const COVATEC_RATE_CARD = {
  id: 'RC-COVATEC', partnerId: 'KH-COVATEC', pol: 'HAN', pod: 'SEL',
  baseFee: 20000, stepFee: 8750, currency: 'KRW',
  fixedFees: [
    { label: 'Phí giám sát tờ khai', amount: 300000, currency: 'VND', requiresCustoms: true }
  ]
};

// row = dòng trong file; delivery = cột R; tq = có thông quan (cột T có 300.000)
const GOLDEN = [
  { row: 12, date: '2026-05-21', cwt: 1, delivery: 5000, tq: false, rate: 18.3, freight: 20000, krw: 25000, vnd: 457500 },
  { row: 13, date: '2026-05-21', cwt: 3, delivery: 50000, tq: false, rate: 18.3, freight: 37500, krw: 87500, vnd: 1601250 },
  { row: 14, date: '2026-05-21', cwt: 2, delivery: 5000, tq: true, rate: 18.3, freight: 28750, krw: 33750, vnd: 917625 },
  { row: 15, date: '2026-05-21', cwt: 1, delivery: 5000, tq: true, rate: 18.3, freight: 20000, krw: 25000, vnd: 757500 },
  { row: 16, date: '2026-05-21', cwt: 6, delivery: 10000, tq: false, rate: 18.3, freight: 63750, krw: 73750, vnd: 1349625 },
  { row: 17, date: '2026-05-23', cwt: 1, delivery: 5000, tq: false, rate: 18.29, freight: 20000, krw: 25000, vnd: 457250 },
  { row: 18, date: '2026-05-25', cwt: 1, delivery: 5000, tq: false, rate: 18.21, freight: 20000, krw: 25000, vnd: 455250 },
  { row: 19, date: '2026-05-26', cwt: 3, delivery: 6000, tq: true, rate: 18.2, freight: 37500, krw: 43500, vnd: 1091700 },
  { row: 20, date: '2026-05-26', cwt: 5, delivery: 10000, tq: false, rate: 18.2, freight: 55000, krw: 65000, vnd: 1183000 },
  { row: 21, date: '2026-05-27', cwt: 1, delivery: 5000, tq: false, rate: 18.27, freight: 20000, krw: 25000, vnd: 456750 },
  { row: 22, date: '2026-05-28', cwt: 2, delivery: 5000, tq: false, rate: 18.26, freight: 28750, krw: 33750, vnd: 616275 },
  { row: 23, date: '2026-05-29', cwt: 114, delivery: 100000, tq: true, rate: 18.19, freight: 1008750, krw: 1108750, vnd: 20468163 },
  { row: 24, date: '2026-05-30', cwt: 2, delivery: 35000, tq: false, rate: 18.19, freight: 28750, krw: 63750, vnd: 1159613 },
  { row: 25, date: '2026-05-30', cwt: 1, delivery: 5000, tq: false, rate: 18.19, freight: 20000, krw: 25000, vnd: 454750 },
  { row: 26, date: '2026-06-01', cwt: 1, delivery: 45000, tq: false, rate: 18.23, freight: 20000, krw: 65000, vnd: 1184950 },
  { row: 27, date: '2026-06-02', cwt: 7, delivery: 6000, tq: false, rate: 18.11, freight: 72500, krw: 78500, vnd: 1421635 },
  { row: 28, date: '2026-06-02', cwt: 4, delivery: 5000, tq: true, rate: 18.11, freight: 46250, krw: 51250, vnd: 1228138 },
  { row: 29, date: '2026-06-02', cwt: 1, delivery: 5000, tq: true, rate: 18.11, freight: 20000, krw: 25000, vnd: 752750 },
  { row: 30, date: '2026-06-04', cwt: 9, delivery: 40000, tq: true, rate: 17.97, freight: 90000, krw: 130000, vnd: 2636100 },
  { row: 31, date: '2026-06-05', cwt: 1, delivery: 5000, tq: false, rate: 17.82, freight: 20000, krw: 25000, vnd: 445500 },
  { row: 32, date: '2026-06-06', cwt: 10.5, delivery: 50000, tq: true, rate: 17.82, freight: 103125, krw: 153125, vnd: 3028688 },
  { row: 33, date: '2026-06-06', cwt: 3, delivery: 5000, tq: true, rate: 17.82, freight: 37500, krw: 42500, vnd: 1057350 },
  { row: 34, date: '2026-06-08', cwt: 1, delivery: 5000, tq: false, rate: 17.74, freight: 20000, krw: 25000, vnd: 443500 },
  { row: 35, date: '2026-06-08', cwt: 1, delivery: 45000, tq: false, rate: 17.74, freight: 20000, krw: 65000, vnd: 1153100 },
  { row: 36, date: '2026-06-09', cwt: 16, delivery: 10000, tq: true, rate: 18.08, freight: 151250, krw: 161250, vnd: 3215400 },
  { row: 37, date: '2026-06-10', cwt: 25, delivery: 24000, tq: true, rate: 18.07, freight: 230000, krw: 254000, vnd: 4889780 },
  { row: 38, date: '2026-06-12', cwt: 1, delivery: 5000, tq: false, rate: 18.1, freight: 20000, krw: 25000, vnd: 452500 },
  { row: 39, date: '2026-06-12', cwt: 1, delivery: 5000, tq: false, rate: 18.1, freight: 20000, krw: 25000, vnd: 452500 },
  { row: 40, date: '2026-06-13', cwt: 21, delivery: 12000, tq: true, rate: 18.1, freight: 195000, krw: 207000, vnd: 4046700 },
  { row: 41, date: '2026-06-15', cwt: 1, delivery: 5000, tq: false, rate: 18.13, freight: 20000, krw: 25000, vnd: 453250 },
  { row: 42, date: '2026-06-16', cwt: 4.5, delivery: 5000, tq: true, rate: 18.1, freight: 50625, krw: 55625, vnd: 1306813 },
  { row: 43, date: '2026-06-16', cwt: 153, delivery: 77100, tq: true, rate: 18.1, freight: 1350000, krw: 1427100, vnd: 26130510 },
  { row: 44, date: '2026-06-16', cwt: 1, delivery: 5000, tq: false, rate: 18.1, freight: 20000, krw: 25000, vnd: 452500 },
  { row: 45, date: '2026-06-16', cwt: 220, delivery: 100000, tq: false, rate: 18.1, freight: 1936250, krw: 2036250, vnd: 36856125 },
  { row: 46, date: '2026-06-17', cwt: 3, delivery: 5000, tq: true, rate: 18.14, freight: 37500, krw: 42500, vnd: 1070950 },
  { row: 47, date: '2026-06-17', cwt: 1, delivery: 5000, tq: false, rate: 18.14, freight: 20000, krw: 25000, vnd: 453500 },
  { row: 48, date: '2026-06-18', cwt: 14, delivery: 40000, tq: true, rate: 18.3, freight: 133750, krw: 173750, vnd: 3479625 },
  { row: 49, date: '2026-06-18', cwt: 1, delivery: 5000, tq: false, rate: 18.3, freight: 20000, krw: 25000, vnd: 457500 },
  { row: 50, date: '2026-06-19', cwt: 31, delivery: 60000, tq: true, rate: 17.84, freight: 282500, krw: 342500, vnd: 6410200 },
  { row: 51, date: '2026-06-20', cwt: 32, delivery: 21000, tq: true, rate: 17.84, freight: 291250, krw: 312250, vnd: 5870540 },
  { row: 52, date: '2026-06-20', cwt: 14, delivery: 35000, tq: true, rate: 17.84, freight: 133750, krw: 168750, vnd: 3310500 },
  { row: 53, date: '2026-06-20', cwt: 17, delivery: 10000, tq: true, rate: 17.84, freight: 160000, krw: 170000, vnd: 3332800 }
];

/**
 * Số kiện (cột L) theo từng dòng, lấy từ file. Hầu hết là 1, trừ 5 dòng:
 * R23=3, R37=3, R40=2, R45=10, R53=2. Tổng L54 = 57.
 */
const CT_BY_ROW = { 23: 3, 37: 3, 40: 2, 45: 10, 53: 2 };

/** Dựng một dòng bảng kê từ fixture. */
const lineFrom = (g) => ({
  date: g.date, blNo: `BL-${g.row}`, flightCode: 'OZ734',
  shipperId: 'S1', consigneeId: 'C1', customsCleared: g.tq,
  mode: 'AIR', pol: 'HAN', pod: 'SEL',
  ct: CT_BY_ROW[g.row] ?? 1, gwt: g.cwt, cwt: g.cwt,
  fuel: 0, customsCharge: 0, deliveryCharge: g.delivery,
  pickFee: 0, declarationSupervisionFee: 0,
  krwCollectedForKorea: 0, overCharge: 0, otherCharge: 0
});

console.log("\n=== computeFreight: bảng giá 20.000 + (kg-1) x 8.750 ===\n");

assert("1 kg -> 20.000", computeFreight(1, COVATEC_RATE_CARD) === 20000);
assert("3 kg -> 37.500", computeFreight(3, COVATEC_RATE_CARD) === 37500);
assert("10,5 kg -> 103.125 (số thập phân không bị làm tròn)",
  computeFreight(10.5, COVATEC_RATE_CARD) === 103125);
assert("4,5 kg -> 50.625", computeFreight(4.5, COVATEC_RATE_CARD) === 50625);
assert("220 kg -> 1.936.250", computeFreight(220, COVATEC_RATE_CARD) === 1936250);
assert("0 kg -> 0", computeFreight(0, COVATEC_RATE_CARD) === 0);
assert("Không có bảng giá -> 0", computeFreight(5, null) === 0);

let freightOk = 0;
for (const g of GOLDEN) {
  if (computeFreight(g.cwt, COVATEC_RATE_CARD) === g.freight) freightOk++;
}
assert("Khớp cột FREIGHT của cả 42 dòng", freightOk === 42, `khớp ${freightOk}/42`);

console.log("\n=== toVnd: quy đổi đúng đến từng đồng ===\n");

assert("RATE_SCALE là 10000", RATE_SCALE === 10000);
assert("25.000 KRW x 18,3 = 457.500", toVnd(25000, 18.3, 0) === 457500);
assert("Cộng phí VND không quy đổi", toVnd(33750, 18.3, 300000) === 917625);

// Tỷ giá lấy từ Excel là số thực không chính xác
assert("Tỷ giá 18.190000000000001 vẫn cho kết quả đúng",
  toVnd(1108750, 18.190000000000001, 300000) === 20468163,
  String(toVnd(1108750, 18.190000000000001, 300000)));
assert("Tỷ giá 17.739999999999998 vẫn cho kết quả đúng",
  toVnd(25000, 17.739999999999998, 0) === 443500,
  String(toVnd(25000, 17.739999999999998, 0)));

console.log("\n=== 5 dòng rơi đúng .5 - nơi float dễ lệch 1đ ===\n");

// Nhân float trực tiếp rồi Math.round có thể ra x.4999... và làm tròn xuống
const HALF_ROWS = [23, 24, 28, 32, 42];
for (const rowNo of HALF_ROWS) {
  const g = GOLDEN.find(x => x.row === rowNo);
  const vndFees = g.tq ? 300000 : 0;
  const exact = g.krw * g.rate + vndFees;
  const got = toVnd(g.krw, g.rate, vndFees);
  assert(`Dòng R${rowNo}: ${g.krw} x ${g.rate} + ${vndFees} = ...${String(exact).slice(-3)} -> ${g.vnd}`,
    got === g.vnd, `nhận ${got}, cần ${g.vnd}`);
}

console.log("\n=== applicableVndFees: cờ thông quan của DÒNG ===\n");

const tqFees = applicableVndFees({ customsCleared: true }, COVATEC_RATE_CARD);
assert("Dòng thông quan -> cộng 300.000đ", tqFees.total === 300000, JSON.stringify(tqFees));
assert("Nêu rõ tên khoản phí", tqFees.applied[0].label === 'Phí giám sát tờ khai');

const ktqFees = applicableVndFees({ customsCleared: false }, COVATEC_RATE_CARD);
assert("Dòng không thông quan -> KHÔNG cộng", ktqFees.total === 0, JSON.stringify(ktqFees));

assert("Không có bảng giá -> không phí", applicableVndFees({ customsCleared: true }, null).total === 0);
assert("Phí VND nhập trực tiếp trên dòng vẫn được cộng",
  applicableVndFees({ customsCleared: false, pickFee: 120000 }, COVATEC_RATE_CARD).total === 120000);

// Phí KRW trong bảng giá không được tính vào nhóm VND
const krwFeeCard = { fixedFees: [{ label: 'X', amount: 1000, currency: 'KRW' }] };
assert("Phí ghi bằng KRW không lọt vào tổng VND",
  applicableVndFees({ customsCleared: true }, krwFeeCard).total === 0);

console.log("\n=== sumKrwCharges: đúng công thức SUM(O:R) của file ===\n");

assert("Cộng freight + fuel + customs + delivery",
  sumKrwCharges({ freightCharge: 20000, fuel: 0, customsCharge: 0, deliveryCharge: 5000 }) === 25000);
assert("Cột U, V, W KHÔNG vào tổng (file dùng SUM(O:R))",
  sumKrwCharges({
    freightCharge: 20000, deliveryCharge: 5000,
    krwCollectedForKorea: 999, overCharge: 888, otherCharge: 777
  }) === 25000);

console.log("\n=== GOLDEN: 42 dòng thật, khớp đến từng đồng ===\n");

let lineOk = 0;
const lineFails = [];
for (const g of GOLDEN) {
  const computed = computeLine(lineFrom(g), { rateCard: COVATEC_RATE_CARD, rate: g.rate });
  const krwOk = computed.totalKrw === g.krw;
  const vndOk = computed.totalVnd === g.vnd;
  if (krwOk && vndOk) lineOk++;
  else lineFails.push(`R${g.row}: KRW ${computed.totalKrw}/${g.krw}, VND ${computed.totalVnd}/${g.vnd}`);
}
assert("42/42 dòng khớp cả TOTAL KRW và TOTAL VND", lineOk === 42,
  `\n   ${lineFails.slice(0, 8).join('\n   ')}`);

console.log("\n=== computeSheet: tổng toàn bảng ===\n");

const sheet = {
  sheetNo: 'MVN - MC/2026', issueDate: '2026-06-23',
  partnerId: 'KH-COVATEC', vatRate: 0,
  truckPlate: '29D-565.94',
  route: 'KCN Tiên Sơn - Hà Nội - SEOUL',
  lines: GOLDEN.map(lineFrom)
};
const rateByDate = Object.fromEntries(GOLDEN.map(g => [g.date, g.rate]));
const result = computeSheet(sheet, {
  rateCard: COVATEC_RATE_CARD,
  rateResolver: (d) => rateByDate[d] ?? null
});

assert("Tổng TOTAL AMOUNT (VND) = 147.419.655 (ô Y54)",
  result.totals.totalVnd === 147419655, String(result.totals.totalVnd));
assert("Tổng TOTAL AMOUNT (KRW) = 7.821.100 (ô X54)",
  result.totals.totalKrw === 7821100, String(result.totals.totalKrw));
assert("Tổng cột FREIGHT = 6.930.000 (ô O54)",
  result.totals.columnTotals.freightCharge === 6930000, String(result.totals.columnTotals.freightCharge));
assert("Tổng cột DELIVERY CHARGE = 891.100 (ô R54)",
  result.totals.columnTotals.deliveryCharge === 891100, String(result.totals.columnTotals.deliveryCharge));
assert("Tổng phí giám sát tờ khai = 6.000.000 (ô T54)",
  result.totals.columnTotals.fixedVndFees === 6000000, String(result.totals.columnTotals.fixedVndFees));
assert("Tổng C/T = 57 (ô L54)",
  result.totals.columnTotals.ct === 57, String(result.totals.columnTotals.ct));
assert("Tổng G.W/T = 738 (ô M54)",
  result.totals.columnTotals.gwt === 738, String(result.totals.columnTotals.gwt));
assert("Tổng C.WT = 738 (ô N54)",
  result.totals.columnTotals.cwt === 738, String(result.totals.columnTotals.cwt));
assert("Đếm đúng 42 dòng", result.totals.lineCount === 42);
assert("Không dòng nào thiếu tỷ giá", result.missingRateLines.length === 0);
assert("Đánh số dòng lại từ 1", result.lines[0].no === 1 && result.lines[41].no === 42);

console.log("\n=== Thiếu tỷ giá: không đoán, không cộng vào tổng ===\n");

const sheetMissing = {
  vatRate: 0,
  lines: [
    lineFrom(GOLDEN[0]),
    { ...lineFrom(GOLDEN[1]), date: '2030-01-01' }  // ngày chưa có tỷ giá
  ]
};
const missing = computeSheet(sheetMissing, {
  rateCard: COVATEC_RATE_CARD,
  rateResolver: (d) => rateByDate[d] ?? null
});
assert("Dòng thiếu tỷ giá có totalVnd = null", missing.lines[1].totalVnd === null);
assert("Được liệt kê riêng để chặn phát hành", missing.missingRateLines.length === 1);
assert("Tổng chỉ gồm dòng có tỷ giá", missing.totals.totalVnd === 457500, String(missing.totals.totalVnd));
assert("Tổng KRW vẫn tính cả dòng thiếu tỷ giá",
  missing.totals.totalKrw === 25000 + 87500, String(missing.totals.totalKrw));

console.log("\n=== Tỷ giá đã chốt trên dòng thì không tra lại ===\n");

const pinned = computeSheet({
  vatRate: 0,
  lines: [{ ...lineFrom(GOLDEN[0]), exchangeRate: 18.3 }]
}, {
  rateCard: COVATEC_RATE_CARD,
  rateResolver: () => 99  // tỷ giá bị sửa về sau, KHÔNG được dùng
});
assert("Dùng tỷ giá snapshot trên dòng, bỏ qua tỷ giá hiện tại",
  pinned.totals.totalVnd === 457500, String(pinned.totals.totalVnd));

console.log("\n=== Override thủ công ===\n");

const overridden = computeLine(
  { ...lineFrom(GOLDEN[0]), overrides: { freightCharge: 25000 } },
  { rateCard: COVATEC_RATE_CARD, rate: 18.3 }
);
assert("Override cột FREIGHT được tôn trọng", overridden.freightCharge === 25000);
assert("Tổng tính lại theo giá trị override",
  overridden.totalKrw === 30000 && overridden.totalVnd === toVnd(30000, 18.3, 0),
  `krw=${overridden.totalKrw} vnd=${overridden.totalVnd}`);
assert("Override không bị mất sau khi tính lại",
  computeLine(overridden, { rateCard: COVATEC_RATE_CARD, rate: 18.3 }).freightCharge === 25000);

const overrideTotal = computeLine(
  { ...lineFrom(GOLDEN[0]), overrides: { totalVnd: 999999 } },
  { rateCard: COVATEC_RATE_CARD, rate: 18.3 }
);
assert("Override được cả cột TOTAL VND", overrideTotal.totalVnd === 999999);

console.log("\n=== VAT ===\n");

const withVat = computeSheet({ vatRate: 10, lines: [lineFrom(GOLDEN[0])] },
  { rateCard: COVATEC_RATE_CARD, rateResolver: (d) => rateByDate[d] });
assert("VAT 10% tính đúng", withVat.totals.vatAmount === 45750, String(withVat.totals.vatAmount));
assert("Tổng thanh toán = tiền + VAT", withVat.totals.grandTotal === 503250);
assert("VAT 0% -> tổng thanh toán bằng tổng tiền",
  result.totals.grandTotal === 147419655);

console.log("\n=== Bằng chữ theo quy ước file khách ===\n");

const words = manifestAmountInWords(147419655);
assert("Đọc đúng số tiền của bảng kê tháng 6",
  words === 'Một trăm bốn mươi bảy triệu, bốn trăm mười chín ngàn, sáu trăm năm mươi lăm đồng chẵn',
  `\n   nhận: ${words}`);
assert("Dùng 'ngàn' thay 'nghìn'", words.includes('ngàn') && !words.includes('nghìn'));
assert("Kết thúc 'đồng chẵn'", words.endsWith('đồng chẵn'));
assert("Có dấu phẩy giữa các nhóm", (words.match(/,/g) || []).length === 2);
assert("Số 0 vẫn đọc được", manifestAmountInWords(0).length > 0);

console.log("\n=== Diễn giải dòng ===\n");

const desc = renderLineDescription(
  { blNo: '2002528008', flightCode: 'OZ734' },
  { route: 'KCN Tiên Sơn - Hà Nội - SEOUL', truckPlate: '29D-565.94' }
);
assert("Sinh đúng câu diễn giải như file gốc",
  desc === 'Cước vận chuyển KCN Tiên Sơn - Hà Nội - SEOUL theo bill số 2002528008, BKS: 29D-565.94, Mã CB: OZ734',
  `\n   nhận: ${desc}`);
assert("Override diễn giải được tôn trọng",
  renderLineDescription({ descriptionOverride: 'Ghi tay' }, {}) === 'Ghi tay');

console.log("\n=== createLine: kế thừa dòng trước ===\n");

const first = createLine(null);
assert("Dòng đầu mặc định MODE = AIR", first.mode === 'AIR');
assert("Dòng đầu mặc định không thông quan", first.customsCleared === false);
assert("Dòng đầu có phí giao nhận mặc định",
  first.deliveryCharge === DEFAULT_DELIVERY_CHARGE);

const prev = { date: '2026-06-16', shipperId: 'S9', consigneeId: 'C9', flightCode: 'KJ374', mode: 'AIR', pol: 'HAN', pod: 'SEL', customsCleared: true };
const next = createLine(prev);
assert("Kế thừa shipper/consignee/mã CB/POL/POD/ngày",
  next.shipperId === 'S9' && next.consigneeId === 'C9' && next.flightCode === 'KJ374' &&
  next.pol === 'HAN' && next.pod === 'SEL' && next.date === '2026-06-16');
assert("Kế thừa cả trạng thái thông quan của dòng trước", next.customsCleared === true);
assert("KHÔNG kế thừa số bill và số liệu", next.blNo === '' && next.cwt === 0);

console.log("\n========================================");
console.log(`Passed: ${passed}/${total}`);
console.log("========================================\n");

process.exit(passed === total ? 0 : 1);
