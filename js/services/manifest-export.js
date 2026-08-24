/**
 * MANIFEST EXPORT - XUẤT BẢNG KÊ RA EXCEL GỬI KHÁCH
 *
 * Bố cục sao đúng file mẫu `COVATEC 2026.06.xlsx`: khối tiêu đề công ty, khối thông
 * tin người mua, bảng 26 cột, dòng Grand Total, "Bằng chữ", khối chữ ký.
 *
 * Vì sao dùng thư viện khác cho đường ghi: `xlsx@0.18.5` (bản community đang nạp ở
 * index.html) **bỏ style ô một cách im lặng** — ghi border/bold/fill không lỗi gì
 * nhưng file ra trần trụi, không gửi khách được. Đã kiểm chứng bằng cách giải nén
 * file xuất ra và đọc `xl/styles.xml` (báo cáo spike trong plans/.../reports).
 * `xlsx-js-style` là fork của đúng 0.18.5, API y hệt, ghi được style.
 */

import { formatDate } from '../utils/formatters.js';
import { formatShipperName } from './catalog-service.js';
import { renderLineDescription } from './manifest-engine.js';

const FORK_CDN = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';

/**
 * Nạp fork theo yêu cầu và giữ nó dưới tên riêng.
 *
 * Bundle của fork gán vào `window.XLSX`, tức ghi đè bản community mà mọi đường ĐỌC
 * đang dùng (nhập đối tác, nhập hóa đơn, nhập tỷ giá). Nên phải đổi tên ngay rồi
 * trả `window.XLSX` về bản cũ.
 *
 * @returns {Promise<Object>} Thư viện có ghi được style
 */
async function loadStyleLib() {
  if (window.XLSXStyle) return window.XLSXStyle;

  const original = window.XLSX;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-xlsx-style]`);
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', () => reject(new Error('Không tải được thư viện định dạng Excel.')));
      return;
    }
    const script = document.createElement('script');
    script.src = FORK_CDN;
    script.dataset.xlsxStyle = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error(
      'Không tải được thư viện định dạng Excel (cần kết nối mạng lần đầu).'
    ));
    document.head.appendChild(script);
  });

  window.XLSXStyle = window.XLSX;
  if (original) window.XLSX = original;

  if (!window.XLSXStyle || !window.XLSXStyle.utils) {
    throw new Error('Thư viện định dạng Excel nạp không thành công.');
  }
  return window.XLSXStyle;
}

const THIN = { style: 'thin', color: { rgb: '000000' } };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };

const S = {
  company: { font: { bold: true, sz: 12 } },
  meta: { font: { sz: 10 } },
  title: { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } },
  subtitle: { alignment: { horizontal: 'center' }, font: { sz: 11 } },
  label: { font: { bold: true, sz: 10 } },
  header: {
    font: { bold: true, sz: 9 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BOX,
    fill: { fgColor: { rgb: 'DDEBF7' } }
  },
  cell: { font: { sz: 9 }, alignment: { vertical: 'center', wrapText: true }, border: BOX },
  num: { font: { sz: 9 }, alignment: { horizontal: 'right', vertical: 'center' }, border: BOX, numFmt: '#,##0' },
  numDec: { font: { sz: 9 }, alignment: { horizontal: 'right', vertical: 'center' }, border: BOX, numFmt: '#,##0.##' },
  center: { font: { sz: 9 }, alignment: { horizontal: 'center', vertical: 'center' }, border: BOX },
  totalLabel: { font: { bold: true, sz: 9 }, alignment: { horizontal: 'center' }, border: BOX, fill: { fgColor: { rgb: 'F2F2F2' } } },
  totalNum: { font: { bold: true, sz: 9 }, alignment: { horizontal: 'right' }, border: BOX, numFmt: '#,##0', fill: { fgColor: { rgb: 'F2F2F2' } } },
  words: { font: { italic: true, sz: 10 } },
  sign: { font: { bold: true, sz: 10 }, alignment: { horizontal: 'center' } },
  signNote: { font: { italic: true, sz: 9 }, alignment: { horizontal: 'center' } }
};

/** 26 cột theo đúng header dòng 11 của file mẫu, cột A..Z */
const EXPORT_COLUMNS = [
  { header: 'NO', width: 5, style: 'center' },
  { header: 'DATE', width: 12, style: 'center' },
  { header: 'B/L NO', width: 14, style: 'center' },
  { header: 'MÃ CB', width: 46, style: 'cell' },
  { header: 'Mã CB', width: 9, style: 'center' },
  { header: 'ITEMS', width: 20, style: 'cell' },
  { header: 'SHIPPER', width: 26, style: 'cell' },
  { header: 'CONSIGNEE', width: 28, style: 'cell' },
  { header: 'MODE', width: 7, style: 'center' },
  { header: 'POL', width: 7, style: 'center' },
  { header: 'POD', width: 7, style: 'center' },
  { header: 'C/T', width: 6, style: 'center' },
  { header: 'G.W/T', width: 8, style: 'numDec' },
  { header: 'C.WT', width: 8, style: 'numDec' },
  { header: 'FREIGHT\nCHARGE\n(KRW)', width: 12, style: 'num' },
  { header: 'FUEL', width: 9, style: 'num' },
  { header: 'CUSTOMS CHARGE', width: 11, style: 'num' },
  { header: 'DELIVERY\nCHARGE\n(KRW)', width: 12, style: 'num' },
  { header: 'PHÍ PICK', width: 10, style: 'num' },
  { header: 'PHÍ GIÁM SÁT TỜ KHAI\n( VND)', width: 13, style: 'num' },
  { header: 'Phí Hàn\nthu hộ', width: 10, style: 'num' },
  { header: 'OVER\nCHARGE', width: 9, style: 'num' },
  { header: 'OTHER\nCHARGE\n(KRW)', width: 10, style: 'num' },
  { header: 'TOTAL AMOUNT\n(KRW)', width: 13, style: 'num' },
  { header: 'TOTAL AMOUNT\n(VND)', width: 15, style: 'num' },
  { header: 'REMARK', width: 9, style: 'numDec' }
];

const LAST_COL = EXPORT_COLUMNS.length - 1; // Z

/**
 * Dựng ma trận ô của bảng kê. Hàm thuần, không phụ thuộc thư viện Excel nên
 * test được trong Node.
 *
 * @param {Object} manifest
 * @param {Object} computed Kết quả computeSheet
 * @param {Object} state Cần settings (thông tin công ty), partners, catalogs
 * @returns {{rows: Array<Array>, headerRowIndex: number, firstDataRow: number,
 *   lastDataRow: number, totalRowIndex: number, merges: Array}}
 */
export function buildSheetMatrix(manifest, computed, state) {
  const s = state.settings || {};
  const partner = (state.partners || []).find(p => p.id === manifest.partnerId) || {};
  const shippers = state.catalogs?.shippers || [];
  const consignees = state.catalogs?.consignees || [];
  const t = computed.totals;

  const issue = manifest.issueDate ? new Date(manifest.issueDate) : new Date();
  const blank = () => new Array(EXPORT_COLUMNS.length).fill(null);
  const rows = [];
  const merges = [];

  const pushMerged = (text, colSpan = LAST_COL) => {
    const row = blank();
    row[0] = text;
    rows.push(row);
    merges.push({ s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: colSpan } });
    return rows.length - 1;
  };

  // Khối tiêu đề: thông tin công ty lấy từ Cài đặt, KHÔNG hardcode
  pushMerged(s.companyName || '(Chưa nhập tên công ty trong Cài đặt)');
  pushMerged(s.companyAddress || '');
  pushMerged(s.companyTaxCode ? `MST: ${s.companyTaxCode}` : '');
  pushMerged('BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ');
  pushMerged(`Số: ${manifest.sheetNo || ''}`);
  pushMerged(`Ngày ${issue.getDate()} tháng ${String(issue.getMonth() + 1).padStart(2, '0')} năm ${issue.getFullYear()}`);
  rows.push(blank());

  // Khối người mua
  const buyerRow = (label, value) => {
    const row = blank();
    row[0] = label;
    row[1] = value;
    rows.push(row);
  };
  buyerRow('Đơn vị mua hàng: ', partner.name || manifest.partnerName || '');
  buyerRow('Địa chỉ : ', partner.address || '');
  buyerRow('Mã số thuế:  ', partner.taxCode || '');

  // Header bảng
  const headerRowIndex = rows.length;
  rows.push(EXPORT_COLUMNS.map(c => c.header));

  // Dòng dữ liệu
  const firstDataRow = rows.length;
  for (const [i, line] of computed.lines.entries()) {
    const shipper = shippers.find(x => x.id === line.shipperId);
    const consignee = consignees.find(x => x.id === line.consigneeId);
    rows.push([
      i + 1,
      line.date || '',
      line.blNo || '',
      renderLineDescription(line, manifest),
      line.flightCode || '',
      line.itemsText || '',
      shipper ? formatShipperName(shipper, line.customsCleared) : '',
      consignee ? consignee.name : '',
      line.mode || 'AIR',
      line.pol || '',
      line.pod || '',
      line.ct || 0,
      line.gwt || 0,
      line.cwt || 0,
      line.freightCharge || 0,
      line.fuel || 0,
      line.customsCharge || 0,
      line.deliveryCharge || 0,
      line.pickFee || 0,
      // Phí giám sát tờ khai đến từ bảng giá, chỉ áp cho dòng thông quan
      line.vndFees || 0,
      line.krwCollectedForKorea || 0,
      line.overCharge || 0,
      line.otherCharge || 0,
      line.totalKrw || 0,
      line.totalVnd === null ? '' : line.totalVnd,
      line.exchangeRate === null ? '' : line.exchangeRate
    ]);
  }
  const lastDataRow = rows.length - 1;

  // Grand Total — mỗi tổng nằm đúng cột của nó, như file gốc
  const totalRowIndex = rows.length;
  const totalRow = blank();
  totalRow[0] = 'Grand Total';
  totalRow[11] = t.columnTotals.ct;
  totalRow[12] = t.columnTotals.gwt;
  totalRow[13] = t.columnTotals.cwt;
  totalRow[14] = t.columnTotals.freightCharge;
  totalRow[15] = t.columnTotals.fuel;
  totalRow[16] = t.columnTotals.customsCharge;
  totalRow[17] = t.columnTotals.deliveryCharge;
  totalRow[18] = t.columnTotals.pickFee;
  totalRow[19] = t.columnTotals.fixedVndFees;
  totalRow[20] = t.columnTotals.krwCollectedForKorea;
  totalRow[21] = t.columnTotals.overCharge;
  totalRow[22] = t.columnTotals.otherCharge;
  totalRow[23] = t.totalKrw;
  totalRow[24] = t.totalVnd;
  totalRow[25] = 'Tỉ giá';
  rows.push(totalRow);
  merges.push({ s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 10 } });

  const vatIndex = pushMerged(`Thuế GTGT ${t.vatRate}%`, 10);
  rows[vatIndex][24] = t.vatAmount;

  const payIndex = pushMerged('Tổng Giá trị thanh toán', 10);
  rows[payIndex][24] = t.grandTotal;

  pushMerged('*NOTE: TỈ GIÁ TIỀN WON-VND TÍNH THEO NGÀY CHUYỂN HÀNG');

  const wordsRow = blank();
  wordsRow[0] = 'Bằng chữ: ';
  wordsRow[1] = t.amountInWords;
  rows.push(wordsRow);
  merges.push({ s: { r: rows.length - 1, c: 1 }, e: { r: rows.length - 1, c: LAST_COL } });

  rows.push(blank());

  // Khối chữ ký
  const signRow = blank();
  signRow[0] = 'Người mua hàng';
  signRow[8] = 'Người bán hàng';
  signRow[18] = 'Thủ trưởng đơn vị';
  rows.push(signRow);

  const noteRow = blank();
  noteRow[0] = '(ký,ghi rõ họ tên)';
  noteRow[8] = '(ký,ghi rõ họ tên)';
  noteRow[18] = '(ký, đóng dấu, ghi rõ họ tên)';
  rows.push(noteRow);

  return { rows, headerRowIndex, firstDataRow, lastDataRow, totalRowIndex, merges };
}

/** Tên file, theo kiểu khách đang quen: "COVATEC 2026.06.xlsx" */
export function buildFileName(manifest, state) {
  const partner = (state.partners || []).find(p => p.id === manifest.partnerId);
  const raw = (partner?.code || partner?.name || manifest.partnerName || 'BangKe')
    .replace(/^(CÔNG TY|CTY|TNHH|KH-)\s*/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
  const d = manifest.issueDate ? new Date(manifest.issueDate) : new Date();
  const period = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${raw} ${period}.xlsx`;
}

/**
 * Xuất bảng kê ra file .xlsx và tải về.
 * @param {Object} manifest
 * @param {Object} computed Kết quả computeSheet
 * @param {Object} state
 */
export async function exportManifestToExcel(manifest, computed, state) {
  const XLSXStyle = await loadStyleLib();
  const matrix = buildSheetMatrix(manifest, computed, state);

  const ws = XLSXStyle.utils.aoa_to_sheet(matrix.rows);
  const ref = (r, c) => XLSXStyle.utils.encode_cell({ r, c });

  // Style khối tiêu đề
  const headStyles = [S.company, S.meta, S.meta, S.title, S.subtitle, S.subtitle];
  headStyles.forEach((style, i) => {
    const cell = ws[ref(i, 0)];
    if (cell) cell.s = style;
  });

  // Khối người mua: nhãn in đậm
  for (let r = matrix.headerRowIndex - 3; r < matrix.headerRowIndex; r++) {
    const cell = ws[ref(r, 0)];
    if (cell) cell.s = S.label;
  }

  // Header bảng
  for (let c = 0; c <= LAST_COL; c++) {
    const cell = ws[ref(matrix.headerRowIndex, c)];
    if (cell) cell.s = S.header;
  }

  // Dòng dữ liệu: kẻ khung toàn bộ, canh phải cho cột số
  for (let r = matrix.firstDataRow; r <= matrix.lastDataRow; r++) {
    for (let c = 0; c <= LAST_COL; c++) {
      const address = ref(r, c);
      if (!ws[address]) ws[address] = { t: 's', v: '' };
      ws[address].s = S[EXPORT_COLUMNS[c].style] || S.cell;
    }
  }

  // Dòng Grand Total
  for (let c = 0; c <= LAST_COL; c++) {
    const cell = ws[ref(matrix.totalRowIndex, c)];
    if (!cell) continue;
    cell.s = c === 0 || c === LAST_COL ? S.totalLabel : S.totalNum;
  }

  // Hai dòng VAT / Tổng thanh toán
  for (const r of [matrix.totalRowIndex + 1, matrix.totalRowIndex + 2]) {
    const label = ws[ref(r, 0)];
    if (label) label.s = S.label;
    const amount = ws[ref(r, 24)];
    if (amount) amount.s = S.totalNum;
  }

  // Bằng chữ + chữ ký
  const wordsRowIndex = matrix.totalRowIndex + 4;
  const wordsLabel = ws[ref(wordsRowIndex, 0)];
  if (wordsLabel) wordsLabel.s = S.label;
  const wordsValue = ws[ref(wordsRowIndex, 1)];
  if (wordsValue) wordsValue.s = S.words;

  for (const c of [0, 8, 18]) {
    const sign = ws[ref(wordsRowIndex + 2, c)];
    if (sign) sign.s = S.sign;
    const note = ws[ref(wordsRowIndex + 3, c)];
    if (note) note.s = S.signNote;
  }

  ws['!merges'] = matrix.merges;
  ws['!cols'] = EXPORT_COLUMNS.map(c => ({ wch: c.width }));
  ws['!rows'] = [{ hpt: 18 }, { hpt: 14 }, { hpt: 14 }, { hpt: 24 }, { hpt: 16 }, { hpt: 16 }];

  // Chỉ đặt được lề. Thư viện KHÔNG ghi được thiết lập trang (đã kiểm: bundle
  // không có chữ "pageSetup" hay "landscape" nào), nên hướng giấy ngang phải chọn
  // trong hộp thoại In của Excel. Đặt lề hẹp để 26 cột dễ vừa trang hơn.
  ws['!margins'] = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Bang ke cuoc quoc te');
  XLSXStyle.writeFile(wb, buildFileName(manifest, state));
}
