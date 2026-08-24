/**
 * Kiểm thử Bảng kê: state CRUD, chống ghi đè, phát hành sinh công nợ, xuất Excel.
 * Phase 04 + 05 + 06.  Chạy: node test_manifests.mjs
 */

global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { stateStore } = await import('./js/state.js');
const { computeSheet, createLine } = await import('./js/services/manifest-engine.js');
const { buildSheetMatrix, buildFileName } = await import('./js/services/manifest-export.js');
const {
  MANIFEST_STATUS, MANIFEST_COLUMNS, PERSISTED_BRANCHES, INVOICE_SOURCE_TYPES
} = await import('./js/config.js');

let passed = 0, total = 0;
function assert(name, cond, extra = '') {
  total++;
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else console.error(`[FAIL] ${name}`, extra);
}

await stateStore.init();
stateStore.resetAllData();

// ---- Dựng dữ liệu nền ----
const partner = stateStore.addPartner({
  code: 'KH-COVATEC', name: 'CÔNG TY TNHH COVA TEC VIỆT NAM', taxCode: '2300745159',
  address: 'Số 11 và 15, Đường 17, VSIP Bắc Ninh', type: 'CUSTOMER',
  creditLimit: 0, creditTermDays: 30
});
stateStore.seedCatalogs();
const shipper = stateStore.state.catalogs.shippers[0];
const consignee = stateStore.state.catalogs.consignees[0];
stateStore.upsertRateCard({
  partnerId: partner.id, pol: 'HAN', pod: 'SEL',
  baseFee: 20000, stepFee: 8750, currency: 'KRW',
  fixedFees: [{ label: 'Phí giám sát tờ khai', amount: 300000, currency: 'VND', requiresCustoms: true }]
});
stateStore.importExchangeRates([
  { date: '2026-06-16', krwToVnd: 18.1, usdToVnd: 26120, source: 'EXCEL' },
  { date: '2026-06-20', krwToVnd: 17.84, usdToVnd: 26130, source: 'EXCEL' }
]);
const rateCard = stateStore.state.rateCards[0];

console.log('\n=== Cấu hình cột nhập ===\n');

const byKey = (k) => MANIFEST_COLUMNS.find(c => c.key === k);
assert('Cột C.WT là số thập phân (không phá 10.5)', byKey('cwt').kind === 'decimal');
assert('Cột G.W/T là số thập phân', byKey('gwt').kind === 'decimal');
assert('Cột C/T là số nguyên', byKey('ct').kind === 'integer');
assert('Có cột cờ thông quan trên dòng', byKey('customsCleared').kind === 'checkbox');
assert('FREIGHT là ô tự tính', byKey('freightCharge').kind === 'computed');
assert('TOTAL VND là ô tự tính', byKey('totalVnd').kind === 'computed');
assert('DELIVERY CHARGE cho nhập tay', byKey('deliveryCharge').kind === 'currency');
// Open question #5: file gốc dùng SUM(O:R) nên 3 cột này không vào tổng.
// Không cho nhập, để không có ô nhập tiền mà tiền lại không vào tổng.
assert('KHÔNG có ô nhập cho 3 cột ngoài tổng KRW',
  !byKey('krwCollectedForKorea') && !byKey('overCharge') && !byKey('otherCharge'));
assert('manifests có trong registry lưu trữ',
  PERSISTED_BRANCHES.map(b => b.key).includes('manifests'));

console.log('\n=== Tạo bảng kê ===\n');

const bad = stateStore.addManifest({ partnerId: partner.id });
assert('Thiếu số bảng kê bị chặn', !bad.ok && bad.error.includes('số bảng kê'), JSON.stringify(bad));
assert('Thiếu khách hàng bị chặn', !stateStore.addManifest({ sheetNo: 'X' }).ok);

const created = stateStore.addManifest({
  partnerId: partner.id, sheetNo: 'MVN - MC/2026', issueDate: '2026-06-23',
  truckPlate: '29D-565.94', route: 'KCN Tiên Sơn - Hà Nội - SEOUL'
});
assert('Tạo bảng kê thành công', created.ok, JSON.stringify(created));
assert('Trạng thái ban đầu là Nháp', created.manifest.status === MANIFEST_STATUS.DRAFT);
assert('Có dấu vết sửa đổi', Boolean(created.manifest.updatedAt && created.manifest.updatedBy));

const dup = stateStore.addManifest({ partnerId: partner.id, sheetNo: 'MVN - MC/2026' });
assert('Trùng số bảng kê bị chặn', !dup.ok && dup.error.includes('đã tồn tại'), JSON.stringify(dup));

const manifestId = created.manifest.id;

console.log('\n=== createLine: kế thừa dòng trước ===\n');

const line1 = createLine(null, { date: '2026-06-16', deliveryCharge: 77100 });
line1.shipperId = shipper.id;
line1.consigneeId = consignee.id;
line1.flightCode = 'OZ734';
line1.pol = 'HAN';
line1.pod = 'SEL';
line1.customsCleared = true;
line1.blNo = '2002489754';
line1.cwt = 153;
line1.gwt = 153;
line1.ct = 1;

const line2 = createLine(line1);
assert('Dòng mới kế thừa shipper/consignee/mã CB/POL/POD',
  line2.shipperId === shipper.id && line2.consigneeId === consignee.id &&
  line2.flightCode === 'OZ734' && line2.pol === 'HAN' && line2.pod === 'SEL');
assert('Kế thừa cả cờ thông quan', line2.customsCleared === true);
assert('KHÔNG kế thừa số bill và số liệu', line2.blNo === '' && line2.cwt === 0);

console.log('\n=== Lưu và chống ghi đè ===\n');

const saved = stateStore.updateManifest(manifestId, { lines: [line1] }, created.manifest.updatedAt);
assert('Lưu dòng thành công', saved.ok, JSON.stringify(saved));
assert('updatedAt thay đổi sau khi lưu', saved.manifest.updatedAt !== created.manifest.updatedAt);

// Lưu với updatedAt cũ = mô phỏng người thứ hai lưu từ bản đã lỗi thời
const stale = stateStore.updateManifest(manifestId, { truckPlate: 'XX' }, created.manifest.updatedAt);
assert('Lưu từ bản lỗi thời bị chặn', !stale.ok && stale.conflict === true, JSON.stringify(stale));
assert('Thông báo nêu ai sửa và lúc nào',
  stale.error.includes('sửa lúc'), stale.error);
assert('Dữ liệu không bị ghi đè khi bị chặn',
  stateStore.state.manifests.find(m => m.id === manifestId).truckPlate === '29D-565.94');

// Lưu hai bảng kê khác nhau không đè nhau
const second = stateStore.addManifest({ partnerId: partner.id, sheetNo: 'MVN - MC/2026-07' });
assert('Tạo bảng kê thứ hai', second.ok);
stateStore.updateManifest(second.manifest.id, { truckPlate: '30A-111.11' }, second.manifest.updatedAt);
assert('Lưu bảng kê thứ hai không làm mất bảng kê thứ nhất',
  stateStore.state.manifests.length === 2 &&
  stateStore.state.manifests.find(m => m.id === manifestId).lines.length === 1);

console.log('\n=== Tính toán trên bảng kê thật ===\n');

const ctx = {
  rateCard,
  rateResolver: (d) => {
    const hit = stateStore.state.exchangeRates.find(r => r.date === d);
    return hit ? hit.krwToVnd : null;
  }
};
let manifest = stateStore.state.manifests.find(m => m.id === manifestId);
let computed = computeSheet(manifest, ctx);

// Dòng R43 của file mẫu: 153 kg, delivery 77.100, thông quan, tỷ giá 18.1
assert('FREIGHT = 1.350.000', computed.lines[0].freightCharge === 1350000, String(computed.lines[0].freightCharge));
assert('TOTAL KRW = 1.427.100', computed.lines[0].totalKrw === 1427100, String(computed.lines[0].totalKrw));
assert('TOTAL VND = 26.130.510 (khớp dòng R43 file mẫu)',
  computed.lines[0].totalVnd === 26130510, String(computed.lines[0].totalVnd));
assert('Không dòng nào thiếu tỷ giá', computed.missingRateLines.length === 0);

console.log('\n=== Dòng thiếu tỷ giá chặn phát hành ===\n');

const noRateLine = createLine(line1, { date: '2030-01-01', deliveryCharge: 5000 });
noRateLine.cwt = 1;
stateStore.updateManifest(manifestId, { lines: [line1, noRateLine] }, stateStore.state.manifests.find(m => m.id === manifestId).updatedAt);
manifest = stateStore.state.manifests.find(m => m.id === manifestId);
computed = computeSheet(manifest, ctx);
assert('Dòng thiếu tỷ giá được liệt kê', computed.missingRateLines.length === 1);
assert('Tổng không gồm dòng thiếu tỷ giá', computed.totals.totalVnd === 26130510);

const blocked = stateStore.issueManifest(manifestId, computed);
assert('Phát hành bị chặn khi còn dòng thiếu tỷ giá', !blocked.ok, JSON.stringify(blocked));
assert('Thông báo nói rõ không được đoán tỷ giá',
  blocked.error.includes('chưa có tỷ giá'), blocked.error);

// Bỏ dòng thiếu tỷ giá đi
stateStore.updateManifest(manifestId, { lines: [line1] }, stateStore.state.manifests.find(m => m.id === manifestId).updatedAt);
manifest = stateStore.state.manifests.find(m => m.id === manifestId);
computed = computeSheet(manifest, ctx);

console.log('\n=== Phát hành sinh công nợ phải thu ===\n');

const invoiceCountBefore = stateStore.state.invoices.length;
const issued = stateStore.issueManifest(manifestId, computed);
assert('Phát hành thành công', issued.ok, JSON.stringify(issued));
assert('Sinh đúng 1 hóa đơn', stateStore.state.invoices.length === invoiceCountBefore + 1);
assert('Hóa đơn là loại phải thu', issued.invoice.type === 'RECEIVABLE');
assert('Số tiền hóa đơn = tổng bảng kê',
  issued.invoice.totalAmount === computed.totals.grandTotal, String(issued.invoice.totalAmount));
assert('Số hóa đơn = số bảng kê', issued.invoice.invoiceNumber === 'MVN - MC/2026');
assert('Hóa đơn ghi nguồn là bảng kê',
  issued.invoice.sourceType === INVOICE_SOURCE_TYPES.MANIFEST && issued.invoice.sourceId === manifestId);
assert('Hạn nợ = ngày lập + 30 ngày của khách',
  issued.invoice.dueDate === '2026-07-23', issued.invoice.dueDate);

manifest = stateStore.state.manifests.find(m => m.id === manifestId);
assert('Bảng kê chuyển sang Đã phát hành', manifest.status === MANIFEST_STATUS.ISSUED);
assert('Bảng kê giữ liên kết hóa đơn', manifest.linkedInvoiceId === issued.invoice.id);
assert('Bảng kê chốt tổng (snapshot)', manifest.totals.grandTotal === computed.totals.grandTotal);

console.log('\n=== Idempotency: bấm phát hành hai lần ===\n');

const again = stateStore.issueManifest(manifestId, computed);
assert('Phát hành lại vẫn thành công', again.ok, JSON.stringify(again));
assert('KHÔNG sinh hóa đơn trùng',
  stateStore.state.invoices.length === invoiceCountBefore + 1,
  `có ${stateStore.state.invoices.length} hóa đơn`);
assert('Báo là phát hành lại', again.reissued === true);
assert('Vẫn là cùng một hóa đơn', again.invoice.id === issued.invoice.id);

console.log('\n=== Số dư công nợ của khách ===\n');

const p = stateStore.state.partners.find(x => x.id === partner.id);
assert('Dư nợ phải thu của khách = tổng bảng kê',
  p.totalReceivable === computed.totals.grandTotal, String(p.totalReceivable));

console.log('\n=== Hóa đơn đã thu tiền thì không tự đổi số ===\n');

stateStore.addPayment({
  partnerId: partner.id, type: 'RECEIPT', paymentMethod: 'BANK_TRANSFER',
  paymentDate: '2026-07-01', amount: 1000000,
  allocations: [{ invoiceId: issued.invoice.id, invoiceNumber: issued.invoice.invoiceNumber, amount: 1000000 }]
});
const paidInvoice = stateStore.state.invoices.find(i => i.id === issued.invoice.id);
assert('Hóa đơn đã ghi nhận thu 1.000.000', paidInvoice.paidAmount === 1000000, String(paidInvoice.paidAmount));

// Sửa bảng kê làm đổi số tiền rồi phát hành lại
const biggerLine = { ...line1, cwt: 200 };
stateStore.updateManifest(manifestId, { lines: [biggerLine] }, stateStore.state.manifests.find(m => m.id === manifestId).updatedAt);
manifest = stateStore.state.manifests.find(m => m.id === manifestId);
const recomputed = computeSheet(manifest, ctx);
const refused = stateStore.issueManifest(manifestId, recomputed);
assert('Phát hành lại bị chặn khi hóa đơn đã thu tiền và số tiền đổi',
  !refused.ok, JSON.stringify(refused));
assert('Thông báo nêu rõ số đã thu và số cũ/mới',
  refused.error.includes('đã thu') && refused.error.includes('1.000.000'), refused.error);

console.log('\n=== Xóa bảng kê đã phát hành ===\n');

const delBlocked = stateStore.deleteManifest(manifestId);
assert('Xóa bị chặn vì còn hóa đơn liên kết', !delBlocked.ok && delBlocked.hasInvoice === true, JSON.stringify(delBlocked));
assert('Thông báo nêu số hóa đơn', delBlocked.error.includes('MVN - MC/2026'), delBlocked.error);
assert('Bảng kê vẫn còn', stateStore.state.manifests.some(m => m.id === manifestId));

stateStore.unlinkManifestInvoice(manifestId);
assert('Bỏ liên kết thành công',
  stateStore.state.manifests.find(m => m.id === manifestId).linkedInvoiceId === null);
assert('Xóa được sau khi bỏ liên kết', stateStore.deleteManifest(manifestId).ok);
assert('Hóa đơn vẫn còn sau khi xóa bảng kê',
  stateStore.state.invoices.some(i => i.id === issued.invoice.id));

console.log('\n=== Xuất Excel: ma trận ô ===\n');

// Dựng lại một bảng kê đủ dữ liệu để xuất
stateStore.updateSettings({
  companyName: 'CÔNG TY TNHH MEI VINA',
  companyAddress: 'Tầng 1 toà nhà SH2-20, Số 1, đường Lê Quang Đạo, Hà Nội',
  companyTaxCode: '0107389727'
});
const exp = stateStore.addManifest({
  partnerId: partner.id, sheetNo: 'MVN - MC/2026-EX', issueDate: '2026-06-23',
  truckPlate: '29D-565.94', route: 'KCN Tiên Sơn - Hà Nội - SEOUL'
});
stateStore.updateManifest(exp.manifest.id, { lines: [line1] }, exp.manifest.updatedAt);
const expManifest = stateStore.state.manifests.find(m => m.id === exp.manifest.id);
const expComputed = computeSheet(expManifest, ctx);
const matrix = buildSheetMatrix(expManifest, expComputed, stateStore.state);

assert('Mỗi dòng có đúng 26 cột (A..Z)',
  matrix.rows.every(r => r.length === 26), `dòng đầu có ${matrix.rows[0].length}`);
assert('Tên công ty lấy từ Cài đặt, không hardcode',
  matrix.rows[0][0] === 'CÔNG TY TNHH MEI VINA', String(matrix.rows[0][0]));
assert('Có tiêu đề BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ',
  matrix.rows[3][0] === 'BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ');
assert('Có số bảng kê', matrix.rows[4][0].includes('MVN - MC/2026-EX'));

const header = matrix.rows[matrix.headerRowIndex];
assert('Header cột O là FREIGHT', header[14].includes('FREIGHT'));
assert('Header cột R là DELIVERY', header[17].includes('DELIVERY'));
assert('Header cột T là PHÍ GIÁM SÁT TỜ KHAI', header[19].includes('GIÁM SÁT'));
assert('Header cột X là TOTAL AMOUNT (KRW)', header[23].includes('KRW'));
assert('Header cột Y là TOTAL AMOUNT (VND)', header[24].includes('VND'));

const dataRow = matrix.rows[matrix.firstDataRow];
assert('Cột O ghi FREIGHT', dataRow[14] === 1350000, String(dataRow[14]));
assert('Cột R ghi DELIVERY CHARGE (không phải FUEL)',
  dataRow[17] === 77100 && dataRow[15] === 0, `R=${dataRow[17]} P=${dataRow[15]}`);
assert('Cột T ghi phí giám sát 300.000 cho dòng thông quan',
  dataRow[19] === 300000, String(dataRow[19]));
assert('Cột X ghi TOTAL KRW', dataRow[23] === 1427100, String(dataRow[23]));
assert('Cột Y ghi TOTAL VND', dataRow[24] === 26130510, String(dataRow[24]));
assert('Cột Z ghi tỷ giá của dòng', dataRow[25] === 18.1, String(dataRow[25]));
assert('Cột SHIPPER có hậu tố TQ theo cờ của dòng',
  String(dataRow[6]).endsWith(' TQ'), String(dataRow[6]));
assert('Cột diễn giải sinh từ template',
  String(dataRow[3]).includes('theo bill số 2002489754') &&
  String(dataRow[3]).includes('BKS: 29D-565.94'), String(dataRow[3]));

const totalRow = matrix.rows[matrix.totalRowIndex];
assert('Dòng Grand Total có nhãn', totalRow[0] === 'Grand Total');
assert('Tổng FREIGHT đúng cột O', totalRow[14] === 1350000, String(totalRow[14]));
assert('Tổng DELIVERY đúng cột R', totalRow[17] === 77100, String(totalRow[17]));
assert('Tổng phí giám sát đúng cột T', totalRow[19] === 300000, String(totalRow[19]));
assert('Tổng KRW đúng cột X', totalRow[23] === 1427100, String(totalRow[23]));
assert('Tổng VND đúng cột Y', totalRow[24] === 26130510, String(totalRow[24]));

const flat = matrix.rows.map(r => r.map(v => String(v ?? '')).join('|')).join('\n');
assert('Có dòng Thuế GTGT', flat.includes('Thuế GTGT'));
assert('Có dòng Tổng Giá trị thanh toán', flat.includes('Tổng Giá trị thanh toán'));
assert('Có ghi chú về tỷ giá theo ngày chuyển hàng',
  flat.includes('TỈ GIÁ TIỀN WON-VND TÍNH THEO NGÀY CHUYỂN HÀNG'));
assert('Có Bằng chữ', flat.includes('Bằng chữ'));
assert('Bằng chữ dùng quy ước file khách (ngàn / đồng chẵn)',
  flat.includes('ngàn') && flat.includes('đồng chẵn'), 'không thấy');
assert('Có khối chữ ký 3 bên',
  flat.includes('Người mua hàng') && flat.includes('Người bán hàng') && flat.includes('Thủ trưởng đơn vị'));

assert('Có định nghĩa merge cho khối tiêu đề', matrix.merges.length > 5);

console.log('\n=== Tên file xuất ===\n');
const fname = buildFileName(expManifest, stateStore.state);
assert('Tên file có mã khách và kỳ', fname === 'COVATEC 2026.06.xlsx', fname);

console.log('\n=== Lưu trữ ===\n');
const { StorageService } = await import('./js/services/storage.js');
const reloaded = StorageService.loadAll(null);
assert('Bảng kê ghi xuống Storage', (reloaded.manifests || []).length >= 1);
assert('Bản sao lưu JSON có nhánh manifests',
  Object.prototype.hasOwnProperty.call(reloaded, 'manifests'));

console.log('\n========================================');
console.log(`Passed: ${passed}/${total}`);
console.log('========================================\n');
process.exit(passed === total ? 0 : 1);
