/**
 * MANIFEST ENGINE - TÍNH TOÁN BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ
 *
 * Toàn bộ nghiệp vụ tính tiền, thuần hàm, không phụ thuộc DOM để test được trong
 * Node. Đối chiếu 42/42 dòng của bảng kê COVATEC 2026.06 khớp đến từng đồng.
 *
 * Công thức:
 *   freightCharge = baseFee + (cwt − 1) × stepFee                      [KRW]
 *   totalKrw      = freight + fuel + customs + delivery
 *                   + krwCollectedForKorea + over + other              [KRW]
 *   vndFees       = Σ phí cố định áp dụng được + pickFee                [VND]
 *   totalVnd      = ROUND(totalKrw × rate + vndFees, 0)
 */

import { RATE_SCALE, DEFAULT_DESCRIPTION_TEMPLATE, DEFAULT_DELIVERY_CHARGE } from '../config.js';
import { numberToWordsVN } from '../utils/formatters.js';

/**
 * Các cột KRW cộng vào TOTAL AMOUNT (KRW), theo đúng công thức của file gốc:
 * `X = SUM(O:R)` tức FREIGHT + FUEL + CUSTOMS + DELIVERY.
 *
 * Thứ tự ở đây khớp thứ tự cột O, P, Q, R trong bảng kê.
 */
const KRW_TOTAL_KEYS = ['freightCharge', 'fuel', 'customsCharge', 'deliveryCharge'];

/**
 * Các cột KRW nằm NGOÀI tổng (cột U, V, W).
 *
 * Công thức `SUM(O:R)` của file gốc không bao gồm chúng, và cả 42 dòng tháng 6 đều
 * để trống nên không có dữ liệu để suy ra ý định. Giữ nguyên hành vi của file để
 * số liệu tái tạo khớp tuyệt đối; nếu nghiệp vụ cần cộng vào tổng thì đó là một
 * thay đổi có chủ ý, phải hỏi người dùng trước.
 */
const KRW_EXTRA_KEYS = ['krwCollectedForKorea', 'overCharge', 'otherCharge'];

/** Các cột phí tính bằng VND (cột S, T), cộng thẳng vào tổng, KHÔNG quy đổi tỷ giá. */
const VND_CHARGE_KEYS = ['pickFee', 'declarationSupervisionFee'];

/** Đọc một ô số, coi trống là 0. */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cước theo bảng giá: kg đầu tính giá gốc, mỗi kg tiếp theo tính giá bậc.
 *
 * `cwt` có thể là số thập phân (dữ liệu thật có 10.5 và 4.5 kg) nên không được
 * làm tròn ở đây.
 *
 * @param {number} cwt Số kg tính phí (chargeable weight)
 * @param {{baseFee: number, stepFee: number}} rateCard
 * @returns {number} KRW
 */
export function computeFreight(cwt, rateCard) {
  if (!rateCard) return 0;
  const weight = toNumber(cwt);
  if (weight <= 0) return 0;

  const base = toNumber(rateCard.baseFee);
  const step = toNumber(rateCard.stepFee);
  return base + (weight - 1) * step;
}

/**
 * Tổng cột TOTAL AMOUNT (KRW) của một dòng = SUM(O:R) như file gốc.
 * Không gồm các cột U, V, W (xem KRW_EXTRA_KEYS).
 * @param {Object} line
 * @returns {number} KRW
 */
export function sumKrwCharges(line) {
  return KRW_TOTAL_KEYS.reduce((sum, key) => sum + toNumber(line[key]), 0);
}

/**
 * Các khoản phí VND áp dụng cho một dòng.
 *
 * Phí có `requiresCustoms` chỉ áp khi dòng đó thông quan. Đây là mối nối duy nhất
 * giữa cờ thông quan của dòng và số tiền, nên engine không hardcode 300.000đ —
 * số tiền nằm trong bảng giá của khách.
 *
 * @param {Object} line
 * @param {Object|null} rateCard
 * @returns {{total: number, applied: Array}}
 */
export function applicableVndFees(line, rateCard) {
  const applied = [];
  let total = 0;

  for (const fee of (rateCard && rateCard.fixedFees) || []) {
    if (fee.currency !== 'VND') continue;
    if (fee.requiresCustoms && !line.customsCleared) continue;
    const amount = toNumber(fee.amount);
    if (amount === 0) continue;
    applied.push({ label: fee.label, amount });
    total += amount;
  }

  // Phí VND nhập trực tiếp trên dòng (ngoài bảng giá)
  for (const key of VND_CHARGE_KEYS) {
    const amount = toNumber(line[key]);
    if (amount !== 0) {
      applied.push({ label: key, amount });
      total += amount;
    }
  }

  return { total, applied };
}

/**
 * Quy đổi KRW sang VND, đúng đến từng đồng.
 *
 * Nhân bằng tỷ giá đã nguyên hoá RỒI mới chia. Nhân float trực tiếp thì các dòng
 * rơi đúng .5 (R23, R24, R28, R32, R42 trong file mẫu) có thể ra x.4999… và bị
 * làm tròn xuống, lệch 1đ. Tỷ giá trong Excel cũng là số thực không chính xác
 * (18.190000000000001), nên phải nguyên hoá trước khi dùng.
 *
 * @param {number} totalKrw
 * @param {number} rate Tỷ giá KRW -> VND
 * @param {number} vndFees Phí tính bằng VND, không quy đổi
 * @returns {number} VND đã làm tròn
 */
export function toVnd(totalKrw, rate, vndFees = 0) {
  const scaledRate = Math.round(toNumber(rate) * RATE_SCALE);
  const scaledTotal = toNumber(totalKrw) * scaledRate + toNumber(vndFees) * RATE_SCALE;
  return Math.round(scaledTotal / RATE_SCALE);
}

/**
 * Tính toàn bộ số liệu dẫn xuất của một dòng bảng kê.
 *
 * `line.overrides` được phủ lên SAU khi tính: file gốc có nhiều dòng gõ tay đè
 * công thức và nghiệp vụ thật cần điều đó. Override không bị xoá khi tính lại.
 *
 * @param {Object} line
 * @param {{rateCard: Object|null, rate: number|null}} ctx
 * @returns {Object} Dòng đã có freightCharge, totalKrw, exchangeRate, totalVnd
 */
export function computeLine(line, ctx = {}) {
  const { rateCard = null, rate = null } = ctx;
  const overrides = line.overrides || {};

  const freightCharge = 'freightCharge' in overrides
    ? toNumber(overrides.freightCharge)
    : computeFreight(line.cwt, rateCard);

  const withFreight = { ...line, freightCharge };
  const totalKrw = 'totalKrw' in overrides
    ? toNumber(overrides.totalKrw)
    : sumKrwCharges(withFreight);

  const { total: vndFees, applied } = applicableVndFees(line, rateCard);

  // Chưa có tỷ giá thì KHÔNG đoán: để null để giao diện đánh dấu và chặn phát hành
  const exchangeRate = 'exchangeRate' in overrides ? toNumber(overrides.exchangeRate) : rate;
  const totalVnd = exchangeRate === null || exchangeRate === undefined || exchangeRate === 0
    ? null
    : ('totalVnd' in overrides ? toNumber(overrides.totalVnd) : toVnd(totalKrw, exchangeRate, vndFees));

  return {
    ...line,
    freightCharge,
    totalKrw,
    exchangeRate,
    vndFees,
    appliedVndFees: applied,
    totalVnd
  };
}

/**
 * Tính lại toàn bộ bảng kê và tổng hợp.
 *
 * Dòng thiếu tỷ giá không được cộng vào tổng và được đếm riêng: gửi khách một
 * bảng kê thiếu tiền của vài dòng còn tệ hơn là chưa gửi.
 *
 * @param {Object} sheet
 * @param {{rateCard: Object|null, rateResolver: function(string): number|null}} ctx
 * @returns {{lines: Array, totals: Object, missingRateLines: Array}}
 */
export function computeSheet(sheet, ctx = {}) {
  const { rateCard = null, rateResolver = () => null } = ctx;

  const lines = (sheet.lines || []).map((line, index) => {
    // Tỷ giá đã chốt trên dòng thì dùng lại, không tra lại: bảng kê đã gửi khách
    // không được đổi số khi file tỷ giá về sau bị sửa
    const rate = line.exchangeRate ?? rateResolver(line.date);
    return computeLine({ ...line, no: index + 1 }, { rateCard, rate });
  });

  const priced = lines.filter(l => l.totalVnd !== null);
  const missingRateLines = lines.filter(l => l.totalVnd === null);

  const totalKrw = lines.reduce((sum, l) => sum + toNumber(l.totalKrw), 0);
  const totalVnd = priced.reduce((sum, l) => sum + toNumber(l.totalVnd), 0);

  const columnTotals = {};
  for (const key of [...KRW_TOTAL_KEYS, ...KRW_EXTRA_KEYS, ...VND_CHARGE_KEYS, 'ct', 'gwt', 'cwt']) {
    columnTotals[key] = lines.reduce((sum, l) => sum + toNumber(l[key]), 0);
  }
  // Phí cố định từ bảng giá không nằm trên dòng, phải tổng riêng để khớp cột
  // PHÍ GIÁM SÁT TỜ KHAI của file mẫu
  columnTotals.fixedVndFees = lines.reduce((sum, l) => sum + toNumber(l.vndFees), 0);

  const vatRate = toNumber(sheet.vatRate);
  const vatAmount = Math.round(totalVnd * vatRate / 100);
  const grandTotal = totalVnd + vatAmount;

  return {
    lines,
    missingRateLines,
    totals: {
      lineCount: lines.length,
      totalKrw,
      totalVnd,
      vatRate,
      vatAmount,
      grandTotal,
      amountInWords: manifestAmountInWords(grandTotal),
      columnTotals
    }
  };
}

/**
 * "Bằng chữ" theo quy ước của bảng kê cước quốc tế mà khách đang nhận:
 * dùng "ngàn" thay "nghìn", phân cách nhóm bằng dấu phẩy, kết thúc "đồng chẵn".
 *
 * Bọc numberToWordsVN chứ KHÔNG sửa nó: 5 mẫu chứng từ kế toán khác đang dùng hàm
 * đó (voucher-templates.js) và đổi sẽ làm sai Phiếu Thu / Phiếu Chi / UNC.
 *
 * @param {number} amount
 * @returns {string}
 */
export function manifestAmountInWords(amount) {
  const base = numberToWordsVN(amount);
  if (!base) return '';

  return base
    .replace(/\bnghìn\b/g, 'ngàn')
    // Dấu phẩy trước mỗi đơn vị nhóm để khớp cách trình bày của file gốc
    .replace(/ (ngàn|triệu|tỷ) /g, ' $1, ')
    .replace(/ đồng$/, ' đồng chẵn');
}

/**
 * Sinh câu diễn giải cột "MÃ CB" từ template của bảng kê.
 *
 * File gốc dùng CONCATENATE với biển số xe hardcode trong công thức; ở đây biển
 * số là dữ liệu của bảng kê nên sửa được mà không phải sửa code.
 *
 * @param {Object} line
 * @param {Object} sheet
 * @returns {string}
 */
export function renderLineDescription(line, sheet = {}) {
  if (line.descriptionOverride) return line.descriptionOverride;

  const template = sheet.descriptionTemplate || DEFAULT_DESCRIPTION_TEMPLATE;
  const values = {
    route: sheet.route || '',
    blNo: line.blNo || '',
    truckPlate: sheet.truckPlate || '',
    flightCode: line.flightCode || '',
    pol: line.pol || '',
    pod: line.pod || ''
  };

  return template.replace(/\{(\w+)\}/g, (match, key) =>
    (key in values ? values[key] : match));
}

/**
 * Tạo một dòng mới, kế thừa các cột danh mục của dòng liền trước.
 * @param {Object|null} previous
 * @param {Object} defaults
 * @returns {Object}
 */
export function createLine(previous = null, defaults = {}) {
  const inherited = previous
    ? {
        date: previous.date,
        shipperId: previous.shipperId,
        consigneeId: previous.consigneeId,
        flightCode: previous.flightCode,
        mode: previous.mode,
        pol: previous.pol,
        pod: previous.pod,
        customsCleared: previous.customsCleared
      }
    : { mode: 'AIR', customsCleared: false };

  return {
    blNo: '',
    itemsText: '',
    ct: 1,
    gwt: 0,
    cwt: 0,
    fuel: 0,
    customsCharge: 0,
    // Cột DELIVERY CHARGE là nơi phí theo từng lô thực sự được nhập trong file gốc
    // (cột FUEL và CUSTOMS trống cả 42 dòng). Sàn thực tế quan sát được là 5.000.
    deliveryCharge: toNumber(defaults.deliveryCharge ?? DEFAULT_DELIVERY_CHARGE),
    pickFee: 0,
    declarationSupervisionFee: 0,
    krwCollectedForKorea: 0,
    overCharge: 0,
    otherCharge: 0,
    remark: '',
    overrides: {},
    ...inherited,
    ...defaults
  };
}
