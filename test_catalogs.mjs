/**
 * Kiểm thử Danh mục dùng chung & Bảng giá cước (Phase 02)
 * Chạy: node test_catalogs.mjs
 *
 * Tên shipper dùng làm dữ liệu kiểm thử lấy nguyên văn từ cột G của
 * excel/COVATEC 2026.06.xlsx — gồm cả các biến thể gõ tay không nhất quán.
 */

global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const {
  splitCustomsSuffix, formatShipperName, findCatalogUsage,
  findDuplicateEntry, normalizeCatalogs, findRateCard, SEED_CATALOGS
} = await import('./js/services/catalog-service.js');
const { CATALOG_TYPES, CATALOG_DEFS, PERSISTED_BRANCHES, emptyCatalogs } = await import('./js/config.js');

let passed = 0;
let total = 0;

function assert(name, condition, extra = "") {
  total++;
  if (condition) { passed++; console.log(`[PASS] ${name}`); }
  else console.error(`[FAIL] ${name}`, extra);
}

console.log("\n=== splitCustomsSuffix: hậu tố thật trong file gốc ===\n");

// KTQ phải được thử TRƯỚC TQ, vì "KTQ" chứa "TQ".
// Nhận sai ở đây là cộng oan 300.000đ cho một lô không thông quan.
const ktq = splitCustomsSuffix('TNHH COVA TEC KTQ');
assert("KTQ cách bằng khoảng trắng -> không thông quan",
  ktq.name === 'TNHH COVA TEC' && ktq.customsCleared === false && ktq.strippedSuffix === 'KTQ',
  JSON.stringify(ktq));

const tq = splitCustomsSuffix('TNHH COVA TEC TQ');
assert("TQ cách bằng khoảng trắng -> có thông quan",
  tq.name === 'TNHH COVA TEC' && tq.customsCleared === true && tq.strippedSuffix === 'TQ',
  JSON.stringify(tq));

// Biến thể dính liền sau dấu chấm, có thật ở dòng R27 và R29
const dotKtq = splitCustomsSuffix('COVATEC CO.,LTD.KTQ');
assert("KTQ dính sau dấu chấm -> tách đúng, giữ lại dấu chấm của tên",
  dotKtq.name === 'COVATEC CO.,LTD.' && dotKtq.customsCleared === false,
  JSON.stringify(dotKtq));

const dotTq = splitCustomsSuffix('COVATEC CO.,LTD.TQ');
assert("TQ dính sau dấu chấm -> tách đúng",
  dotTq.name === 'COVATEC CO.,LTD.' && dotTq.customsCleared === true,
  JSON.stringify(dotTq));

const spacedLtd = splitCustomsSuffix('COVATEC CO.,LTD TQ');
assert("Biến thể không có dấu chấm cuối",
  spacedLtd.name === 'COVATEC CO.,LTD' && spacedLtd.customsCleared === true,
  JSON.stringify(spacedLtd));

const longName = splitCustomsSuffix('COVATEC VIETNAM CO., LTD KTQ');
assert("Tên dài nhất trong file",
  longName.name === 'COVATEC VIETNAM CO., LTD' && longName.customsCleared === false,
  JSON.stringify(longName));

console.log("\n=== splitCustomsSuffix: không được tách sai ===\n");

const noSuffix = splitCustomsSuffix('COVATEC VIETNAM CO., LTD');
assert("Tên không có hậu tố -> customsCleared = null (giữ lựa chọn của người dùng)",
  noSuffix.name === 'COVATEC VIETNAM CO., LTD' && noSuffix.customsCleared === null && noSuffix.strippedSuffix === null,
  JSON.stringify(noSuffix));

const glued = splitCustomsSuffix('COVATECTQ');
assert("TQ viết liền vào tên -> KHÔNG tách (chỉ tách khi là token cuối)",
  glued.name === 'COVATECTQ' && glued.customsCleared === null,
  JSON.stringify(glued));

const middle = splitCustomsSuffix('TQ COVATEC LTD');
assert("TQ ở đầu tên -> không tách",
  middle.name === 'TQ COVATEC LTD' && middle.customsCleared === null,
  JSON.stringify(middle));

const lower = splitCustomsSuffix('tnhh cova tec ktq');
assert("Chữ thường vẫn nhận ra",
  lower.name === 'tnhh cova tec' && lower.customsCleared === false,
  JSON.stringify(lower));

assert("Chuỗi rỗng không lỗi", splitCustomsSuffix('').name === '' );
assert("null không lỗi", splitCustomsSuffix(null).name === '');

console.log("\n=== formatShipperName: dựng lại đúng chuỗi gốc ===\n");

// Vòng tách rồi dựng lại phải ra đúng chuỗi ban đầu, nếu không file xuất sẽ lệch
const roundTrip = [
  'TNHH COVA TEC KTQ',
  'TNHH COVA TEC TQ',
  'COVATEC VIETNAM CO., LTD TQ',
  'COVATEC VIETNAM CO., LTD KTQ',
  'COVATEC CO.,LTD TQ'
];
let rtOk = 0;
for (const original of roundTrip) {
  const split = splitCustomsSuffix(original);
  const rebuilt = formatShipperName({ name: split.name, customsCleared: split.customsCleared });
  if (rebuilt === original) rtOk++;
  else console.log(`   lệch: "${original}" -> "${rebuilt}"`);
}
assert("Tách rồi dựng lại khớp nguyên văn 5/5 tên thật", rtOk === 5, `khớp ${rtOk}/5`);

assert("Không sinh hậu tố lặp",
  formatShipperName({ name: 'ABC', customsCleared: true }) === 'ABC TQ');
assert("Cờ tắt -> KTQ",
  formatShipperName({ name: 'ABC', customsCleared: false }) === 'ABC KTQ');
assert("Shipper rỗng trả chuỗi rỗng", formatShipperName(null) === '');

console.log("\n=== findDuplicateEntry ===\n");

const shippers = [
  { id: 'S1', name: 'COVATEC VIETNAM CO., LTD', customsCleared: true },
  { id: 'S2', name: 'COVATEC VIETNAM CO., LTD', customsCleared: false }
];

assert("Cùng tên + cùng cờ TQ -> trùng",
  findDuplicateEntry(shippers, { name: 'COVATEC VIETNAM CO., LTD', customsCleared: true }, 'shippers')?.id === 'S1');
assert("Cùng tên nhưng khác cờ -> KHÔNG trùng (TQ và KTQ là hai lựa chọn)",
  findDuplicateEntry(shippers, { name: 'COVATEC VIETNAM CO., LTD', customsCleared: false }, 'shippers')?.id === 'S2');
assert("Khác hoa/thường và khoảng trắng thừa vẫn tính là trùng",
  findDuplicateEntry(shippers, { name: '  covatec   vietnam co., ltd ', customsCleared: true }, 'shippers')?.id === 'S1');
assert("Bỏ qua chính bản ghi đang sửa",
  findDuplicateEntry(shippers, { name: 'COVATEC VIETNAM CO., LTD', customsCleared: true }, 'shippers', 'S1') === null);

const flights = [{ id: 'F1', code: 'OZ734' }];
assert("Danh mục theo mã cũng phát hiện trùng",
  findDuplicateEntry(flights, { code: 'OZ734' }, 'flights')?.id === 'F1');
assert("Mã khác thì không trùng",
  findDuplicateEntry(flights, { code: 'KJ374' }, 'flights') === null);

console.log("\n=== findCatalogUsage: chặn xóa khi đang được dùng ===\n");

const stateWithManifest = {
  manifests: [{
    id: 'M1', sheetNo: 'MVN-MC/2026',
    lines: [
      { shipperId: 'S1', consigneeId: 'C1', flightCode: 'OZ734', pol: 'HAN', pod: 'SEL' },
      { shipperId: 'S1', consigneeId: 'C2', flightCode: 'KJ374', pol: 'HAN', pod: 'SEL' }
    ]
  }],
  rateCards: [{ id: 'RC1', pol: 'HAN', pod: 'SEL' }]
};

const shipperUse = findCatalogUsage(stateWithManifest, 'shippers', { id: 'S1' });
assert("Shipper dùng ở 2 dòng -> chặn xóa", shipperUse.count === 2, JSON.stringify(shipperUse));
assert("Nêu rõ đang bị dùng ở bảng kê nào",
  shipperUse.where[0].includes('MVN-MC/2026'), JSON.stringify(shipperUse.where));

assert("Shipper chưa dùng -> cho xóa",
  findCatalogUsage(stateWithManifest, 'shippers', { id: 'S9' }).count === 0);
assert("Consignee dùng 1 dòng",
  findCatalogUsage(stateWithManifest, 'consignees', { id: 'C1' }).count === 1);
assert("Mã chuyến bay tham chiếu theo code",
  findCatalogUsage(stateWithManifest, 'flights', { code: 'OZ734' }).count === 1);

const portUse = findCatalogUsage(stateWithManifest, 'ports', { code: 'HAN' });
assert("Sân bay tính cả dòng bảng kê và bảng giá", portUse.count === 3, JSON.stringify(portUse));
assert("Nêu cả việc bảng giá đang dùng tuyến",
  portUse.where.some(w => w.includes('bảng giá')), JSON.stringify(portUse.where));

assert("Sản phẩm không phải khóa ngoại -> luôn xóa được",
  findCatalogUsage(stateWithManifest, 'items', { id: 'I1' }).count === 0);

// Phase 02 xong trước Phase 04, nên hàm phải chịu được state chưa có manifests
assert("state chưa có manifests -> không lỗi",
  findCatalogUsage({}, 'shippers', { id: 'S1' }).count === 0);
assert("state null -> không lỗi",
  findCatalogUsage(null, 'shippers', { id: 'S1' }).count === 0);

console.log("\n=== findRateCard ===\n");

const cards = [
  { id: 'RC1', partnerId: 'KH001', pol: 'HAN', pod: 'SEL', baseFee: 20000, stepFee: 8750 },
  { id: 'RC2', partnerId: 'KH002', pol: 'HAN', pod: 'SEL', baseFee: 25000, stepFee: 9000 }
];

assert("Tra đúng bảng giá theo khách + tuyến",
  findRateCard(cards, 'KH001', 'HAN', 'SEL')?.id === 'RC1');
assert("Khách khác ra bảng giá khác (giá riêng đàm phán)",
  findRateCard(cards, 'KH002', 'HAN', 'SEL')?.baseFee === 25000);
assert("Khách chưa có bảng giá -> null",
  findRateCard(cards, 'KH999', 'HAN', 'SEL') === null);
assert("Tuyến chưa có bảng giá -> null",
  findRateCard(cards, 'KH001', 'HAN', 'TYO') === null);
assert("Không truyền partnerId -> null", findRateCard(cards, null, 'HAN', 'SEL') === null);

console.log("\n=== Cấu hình & registry ===\n");

assert("Có đủ 5 loại danh mục", CATALOG_TYPES.length === 5);
assert("Mỗi loại đều có định nghĩa field",
  CATALOG_TYPES.every(t => CATALOG_DEFS[t] && Array.isArray(CATALOG_DEFS[t].fields) && CATALOG_DEFS[t].fields.length > 0));
assert("Shipper có field customsCleared kiểu checkbox",
  CATALOG_DEFS.shippers.fields.some(f => f.key === 'customsCleared' && f.type === 'checkbox'));

const branchKeys = PERSISTED_BRANCHES.map(b => b.key);
assert("catalogs có trong registry lưu trữ", branchKeys.includes('catalogs'));
assert("rateCards có trong registry lưu trữ", branchKeys.includes('rateCards'));
assert("catalogs được đánh dấu isObject (là object, không phải mảng)",
  PERSISTED_BRANCHES.find(b => b.key === 'catalogs').isObject === true);
assert("Các nhánh cũ vẫn còn",
  ['partners', 'invoices', 'payments', 'paymentRequests', 'exchangeRates', 'settings'].every(k => branchKeys.includes(k)),
  branchKeys.join(', '));

assert("emptyCatalogs tạo đủ 5 nhóm mảng rỗng",
  CATALOG_TYPES.every(t => Array.isArray(emptyCatalogs()[t]) && emptyCatalogs()[t].length === 0));

console.log("\n=== normalizeCatalogs: dữ liệu cũ thiếu nhóm ===\n");

const partial = normalizeCatalogs({ shippers: [{ id: 'S1' }] });
assert("Giữ nhóm đã có", partial.shippers.length === 1);
assert("Bù đủ các nhóm còn thiếu",
  CATALOG_TYPES.every(t => Array.isArray(partial[t])), JSON.stringify(Object.keys(partial)));
assert("undefined -> đủ 5 nhóm rỗng",
  CATALOG_TYPES.every(t => normalizeCatalogs(undefined)[t].length === 0));
assert("Nhóm sai kiểu bị thay bằng mảng rỗng",
  normalizeCatalogs({ shippers: "không phải mảng" }).shippers.length === 0);

console.log("\n=== Dữ liệu gợi ý ===\n");

assert("Gợi ý có cả 5 nhóm",
  CATALOG_TYPES.every(t => Array.isArray(SEED_CATALOGS[t]) && SEED_CATALOGS[t].length > 0));
assert("Gợi ý shipper KHÔNG chứa hậu tố TQ/KTQ trong tên",
  SEED_CATALOGS.shippers.every(s => splitCustomsSuffix(s.name).strippedSuffix === null),
  JSON.stringify(SEED_CATALOGS.shippers.map(s => s.name)));
assert("Gợi ý có mã chuyến bay thật trong file mẫu",
  SEED_CATALOGS.flights.some(f => f.code === 'OZ734') && SEED_CATALOGS.flights.some(f => f.code === 'KJ374'));
assert("Gợi ý có tuyến HAN và SEL",
  SEED_CATALOGS.ports.some(p => p.code === 'HAN') && SEED_CATALOGS.ports.some(p => p.code === 'SEL'));
assert("Gợi ý không có bản ghi trùng nhau trong chính nó",
  CATALOG_TYPES.every(t => {
    const acc = [];
    for (const e of SEED_CATALOGS[t]) {
      if (findDuplicateEntry(acc, e, t)) return false;
      acc.push({ ...e, id: `x${acc.length}` });
    }
    return true;
  }));

console.log("\n=== stateStore: CRUD danh mục & bảng giá ===\n");

const { stateStore } = await import('./js/state.js');
await stateStore.init();
stateStore.resetAllData();

assert("Sau reset, danh mục có đủ 5 nhóm rỗng",
  CATALOG_TYPES.every(t => stateStore.state.catalogs[t].length === 0));

const addRes = stateStore.upsertCatalogEntry('shippers', { name: 'COVATEC VIETNAM CO., LTD', customsCleared: true });
assert("Thêm shipper thành công và được gán id", addRes.ok && Boolean(addRes.entry.id), JSON.stringify(addRes));

const dupRes = stateStore.upsertCatalogEntry('shippers', { name: 'COVATEC VIETNAM CO., LTD', customsCleared: true });
assert("Thêm trùng bị chặn kèm lý do", !dupRes.ok && dupRes.error.includes('đã có'), JSON.stringify(dupRes));

const variantRes = stateStore.upsertCatalogEntry('shippers', { name: 'COVATEC VIETNAM CO., LTD', customsCleared: false });
assert("Cùng tên khác cờ thông quan thì thêm được", variantRes.ok, JSON.stringify(variantRes));
assert("Danh mục shipper có 2 bản ghi", stateStore.state.catalogs.shippers.length === 2);

const shipperId = addRes.entry.id;
stateStore.upsertCatalogEntry('shippers', { id: shipperId, name: 'COVATEC VIETNAM CO.,LTD', customsCleared: true });
assert("Sửa tên shipper thành công",
  stateStore.state.catalogs.shippers.find(s => s.id === shipperId).name === 'COVATEC VIETNAM CO.,LTD');

const delOk = stateStore.deleteCatalogEntry('shippers', shipperId);
assert("Xóa được shipper chưa dùng", delOk.ok && stateStore.state.catalogs.shippers.length === 1);

// Giả lập có bảng kê đang dùng shipper còn lại
const remainingId = stateStore.state.catalogs.shippers[0].id;
stateStore.state.manifests = [{ id: 'M1', sheetNo: 'MVN-MC/2026', lines: [{ shipperId: remainingId }] }];
const delBlocked = stateStore.deleteCatalogEntry('shippers', remainingId);
assert("Xóa shipper đang được bảng kê dùng bị chặn", !delBlocked.ok, JSON.stringify(delBlocked));
assert("Thông báo nêu rõ bảng kê nào đang dùng",
  delBlocked.error.includes('MVN-MC/2026'), delBlocked.error);
assert("Bản ghi vẫn còn sau khi bị chặn", stateStore.state.catalogs.shippers.length === 1);
stateStore.state.manifests = [];

const seeded = stateStore.seedCatalogs();
assert("Nạp gợi ý thêm được bản ghi", seeded.added > 0, JSON.stringify(seeded));
const seededAgain = stateStore.seedCatalogs();
assert("Nạp gợi ý lần hai không thêm trùng", seededAgain.added === 0 && seededAgain.skipped > 0, JSON.stringify(seededAgain));

console.log("\n=== stateStore: bảng giá COVATEC ===\n");

const partner = stateStore.addPartner({
  code: 'KH-COVATEC', name: 'CÔNG TY TNHH COVA TEC VIỆT NAM',
  taxCode: '2300745159', type: 'CUSTOMER', creditLimit: 0, creditTermDays: 30
});

const rcRes = stateStore.upsertRateCard({
  partnerId: partner.id, pol: 'HAN', pod: 'SEL',
  baseFee: 20000, stepFee: 8750, currency: 'KRW',
  fixedFees: [{ label: 'Phí giám sát tờ khai', amount: 300000, currency: 'VND', requiresCustoms: true }]
});
assert("Tạo bảng giá COVATEC thành công", rcRes.ok, JSON.stringify(rcRes));
assert("baseFee = 20000", rcRes.card.baseFee === 20000);
assert("stepFee = 8750", rcRes.card.stepFee === 8750);
assert("Phí giám sát tờ khai 300.000đ VND, chỉ khi thông quan",
  rcRes.card.fixedFees[0].amount === 300000 &&
  rcRes.card.fixedFees[0].currency === 'VND' &&
  rcRes.card.fixedFees[0].requiresCustoms === true,
  JSON.stringify(rcRes.card.fixedFees));
assert("Bảng giá lưu kèm tên khách hàng", rcRes.card.partnerName.includes('COVA TEC'));

const clash = stateStore.upsertRateCard({
  partnerId: partner.id, pol: 'HAN', pod: 'SEL', baseFee: 30000, stepFee: 9000, fixedFees: []
});
assert("Trùng khách + tuyến bị chặn", !clash.ok && clash.error.includes('đã có bảng giá'), JSON.stringify(clash));

const noPartner = stateStore.upsertRateCard({ pol: 'HAN', pod: 'SEL', baseFee: 1, stepFee: 1 });
assert("Thiếu khách hàng bị chặn", !noPartner.ok);
const noRoute = stateStore.upsertRateCard({ partnerId: partner.id, baseFee: 1, stepFee: 1 });
assert("Thiếu tuyến bị chặn", !noRoute.ok);

assert("Tra được bảng giá vừa tạo",
  findRateCard(stateStore.state.rateCards, partner.id, 'HAN', 'SEL')?.stepFee === 8750);

stateStore.state.manifests = [{ id: 'M2', sheetNo: 'MVN-MC/2026-07', rateCardId: rcRes.card.id, lines: [] }];
const rcBlocked = stateStore.deleteRateCard(rcRes.card.id);
assert("Xóa bảng giá đang được bảng kê dùng bị chặn", !rcBlocked.ok && rcBlocked.error.includes('MVN-MC/2026-07'), JSON.stringify(rcBlocked));
stateStore.state.manifests = [];
assert("Xóa được bảng giá không còn ai dùng", stateStore.deleteRateCard(rcRes.card.id).ok);

console.log("\n=== Lưu trữ: danh mục & bảng giá sống sót qua reload ===\n");

const { StorageService } = await import('./js/services/storage.js');
stateStore.upsertCatalogEntry('flights', { code: 'OZ734' });
stateStore.upsertRateCard({
  partnerId: partner.id, pol: 'HAN', pod: 'SEL',
  baseFee: 20000, stepFee: 8750, currency: 'KRW', fixedFees: []
});

const reloaded = StorageService.loadAll(null);
assert("Danh mục đọc lại được từ Storage",
  reloaded.catalogs && reloaded.catalogs.flights.some(f => f.code === 'OZ734'),
  JSON.stringify(reloaded.catalogs && Object.keys(reloaded.catalogs)));
assert("Bảng giá đọc lại được từ Storage",
  Array.isArray(reloaded.rateCards) && reloaded.rateCards.length === 1);
assert("Bản sao lưu JSON sẽ chứa cả hai nhánh mới",
  Object.prototype.hasOwnProperty.call(reloaded, 'catalogs') &&
  Object.prototype.hasOwnProperty.call(reloaded, 'rateCards'));

// applyBranches thay cho 7 chỗ gán tay; đăng xuất từng bị bỏ sót nhánh mới
stateStore.applyBranches(reloaded);
assert("applyBranches nạp lại đúng danh mục",
  stateStore.state.catalogs.flights.some(f => f.code === 'OZ734'));
assert("applyBranches nạp lại đúng bảng giá", stateStore.state.rateCards.length === 1);
stateStore.applyBranches(null);
assert("applyBranches(null) trả về mặc định đủ 5 nhóm",
  CATALOG_TYPES.every(t => stateStore.state.catalogs[t].length === 0) &&
  stateStore.state.rateCards.length === 0);

console.log("\n=== Định tuyến & giao diện ===\n");

const navHash = { value: '#catalogs' };
global.window = { addEventListener: () => {}, innerWidth: 1440, get location() { return { hash: navHash.value }; } };
const stubEl = { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, contains: () => false, textContent: '', innerHTML: '', style: {}, setAttribute() {}, getAttribute: () => 'light' };
global.document = {
  getElementById: () => null, querySelector: () => stubEl, querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => stubEl,
  documentElement: { setAttribute() {}, getAttribute: () => 'light' }
};

const { Navigation } = await import('./js/components/navigation.js');
let routed = null;
Navigation.onRouteChange = (r) => { routed = r; };
Navigation.handleHashChange();
assert("#catalogs định tuyến đúng, không rơi về dashboard", routed === 'catalogs', `nhận "${routed}"`);

navHash.value = '#exchange-rates';
Navigation.handleHashChange();
assert("Route của Phase 01 vẫn chạy", routed === 'exchange-rates', `nhận "${routed}"`);

const { CatalogsView } = await import('./js/components/catalogs.js');
const view = new CatalogsView('main-content');
const html = view.render({
  catalogs: {
    ...emptyCatalogs(),
    shippers: [
      { id: 'S1', name: 'COVATEC VIETNAM CO., LTD', customsCleared: true },
      { id: 'S2', name: 'COVATEC VIETNAM CO., LTD', customsCleared: false }
    ]
  },
  rateCards: [],
  partners: []
});

assert("Hiện tab cho cả 5 danh mục + bảng giá",
  CATALOG_TYPES.every(t => html.includes(`data-tab="${t}"`)) && html.includes('data-tab="rateCards"'));
assert("Cột hiển thị đúng chuỗi sẽ xuất ra bảng kê",
  html.includes('COVATEC VIETNAM CO., LTD TQ') && html.includes('COVATEC VIETNAM CO., LTD KTQ'),
  "không thấy chuỗi có hậu tố trong bảng");
assert("Không dùng class badge chưa tồn tại",
  !html.includes('badge-success') && !html.includes('badge-neutral'));
assert("Badge thông quan dùng class có định nghĩa CSS",
  html.includes('badge-customs-yes') && html.includes('badge-customs-no'));

view.activeTab = 'rateCards';
const rateHtml = view.render({ catalogs: emptyCatalogs(), rateCards: [], partners: [] });
assert("Tab bảng giá rỗng có hướng dẫn", rateHtml.includes('Chưa có bảng giá cước nào'));

console.log("\n========================================");
console.log(`Passed: ${passed}/${total}`);
console.log("========================================\n");

process.exit(passed === total ? 0 : 1);
