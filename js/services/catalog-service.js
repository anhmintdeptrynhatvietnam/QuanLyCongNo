/**
 * CATALOG SERVICE - DANH MỤC DÙNG CHUNG & BẢNG GIÁ
 *
 * Hàm thuần cho phần nghiệp vụ của danh mục: tách hậu tố thông quan TQ/KTQ, dựng
 * lại tên shipper để xuất Excel, tra cứu bản ghi đang được tham chiếu, và dữ liệu
 * gợi ý mồi lần đầu.
 *
 * Tách khỏi component để phần dính tới tiền (hậu tố TQ quyết định phí giám sát tờ
 * khai 300.000đ) có test tự động chạy trong Node.
 */

import { CUSTOMS_SUFFIXES, CATALOG_TYPES, PORT_KINDS } from '../config.js';

/**
 * Tách hậu tố thông quan khỏi tên shipper người dùng gõ vào.
 *
 * Trong file gốc, cùng một công ty được gõ 4 kiểu tên, kèm hai biến thể phân tách
 * hậu tố: "COVATEC CO.,LTD KTQ" (khoảng trắng) và "COVATEC CO.,LTD.KTQ" (dấu
 * chấm). Cả hai đều phải nhận ra, nhưng chỉ khi hậu tố là token CUỐI: "COVATECTQ"
 * không phải là thông quan, đó chỉ là tên viết liền.
 *
 * @param {string} rawName Tên như người dùng gõ
 * @returns {{name: string, customsCleared: boolean|null, strippedSuffix: string|null}}
 *   `customsCleared = null` nghĩa là không tìm thấy hậu tố -> giữ nguyên lựa chọn
 *   checkbox của người dùng.
 */
export function splitCustomsSuffix(rawName) {
  const input = String(rawName ?? '').trim();

  for (const { suffix, customsCleared } of CUSTOMS_SUFFIXES) {
    // Giữ lại ký tự phân tách (dấu chấm là phần của tên: "CO.,LTD."),
    // chỉ cắt bỏ chính hậu tố
    const pattern = new RegExp(`([\\s.])${suffix}$`, 'i');
    if (pattern.test(input)) {
      return {
        name: input.replace(pattern, '$1').trim(),
        customsCleared,
        strippedSuffix: suffix
      };
    }
  }

  return { name: input, customsCleared: null, strippedSuffix: null };
}

/**
 * Dựng tên shipper để hiển thị và xuất Excel, kèm hậu tố thông quan.
 * Đây là hàm duy nhất được phép sinh hậu tố, để không nơi nào tự nối chuỗi rồi
 * ra "... TQ TQ".
 *
 * @param {{name: string, customsCleared: boolean}} shipper
 * @returns {string}
 */
export function formatShipperName(shipper) {
  if (!shipper || !shipper.name) return '';
  return `${shipper.name} ${shipper.customsCleared ? 'TQ' : 'KTQ'}`;
}

/**
 * Tìm những chỗ đang tham chiếu tới một bản ghi danh mục.
 *
 * Chịu được `state.manifests` chưa tồn tại: danh mục làm xong trước module bảng
 * kê, nên hàm này phải chạy được khi nhánh đó còn undefined.
 *
 * @param {Object} state
 * @param {string} type Một trong CATALOG_TYPES
 * @param {Object} entry Bản ghi danh mục
 * @returns {{count: number, where: string[]}}
 */
export function findCatalogUsage(state, type, entry) {
  const manifests = (state && state.manifests) || [];
  const rateCards = (state && state.rateCards) || [];
  const where = [];
  let count = 0;

  const noteManifest = (manifest, lines) => {
    if (lines === 0) return;
    count += lines;
    where.push(`Bảng kê ${manifest.sheetNo || manifest.id} (${lines} dòng)`);
  };

  for (const manifest of manifests) {
    const lines = manifest.lines || [];
    let hits = 0;

    for (const line of lines) {
      switch (type) {
        case 'shippers':
          if (line.shipperId === entry.id) hits++;
          break;
        case 'consignees':
          if (line.consigneeId === entry.id) hits++;
          break;
        case 'flights':
          if (line.flightCode && line.flightCode === entry.code) hits++;
          break;
        case 'ports':
          if (line.pol === entry.code || line.pod === entry.code) hits++;
          break;
        case 'items':
          // itemsText là chuỗi tự do (VD "PIN BLOCK 7EA"), không phải khóa ngoại
          break;
        default:
          break;
      }
    }

    noteManifest(manifest, hits);
  }

  // Bảng giá gắn với tuyến theo mã sân bay
  if (type === 'ports') {
    const usedByRateCards = rateCards.filter(rc => rc.pol === entry.code || rc.pod === entry.code);
    if (usedByRateCards.length > 0) {
      count += usedByRateCards.length;
      where.push(`${usedByRateCards.length} bảng giá dùng tuyến này`);
    }
  }

  return { count, where };
}

/**
 * Tìm bảng giá áp dụng cho một khách hàng trên một tuyến.
 * @param {Array} rateCards
 * @param {string} partnerId
 * @param {string} pol
 * @param {string} pod
 * @returns {Object|null}
 */
export function findRateCard(rateCards, partnerId, pol, pod) {
  if (!partnerId) return null;
  return (rateCards || []).find(rc =>
    rc.partnerId === partnerId &&
    (!pol || rc.pol === pol) &&
    (!pod || rc.pod === pod)
  ) || null;
}

/**
 * Dữ liệu gợi ý mồi danh mục lần đầu, lấy từ bảng kê COVATEC 2026.06.
 * Chỉ là gợi ý để người dùng không phải gõ lại từ đầu — sửa/xóa được bình thường.
 */
export const SEED_CATALOGS = {
  shippers: [
    { name: 'COVATEC VIETNAM CO., LTD', customsCleared: true },
    { name: 'COVATEC VIETNAM CO., LTD', customsCleared: false },
    { name: 'TNHH COVA TEC', customsCleared: true },
    { name: 'TNHH COVA TEC', customsCleared: false },
    { name: 'COVATEC CO.,LTD.', customsCleared: true },
    { name: 'COVATEC CO.,LTD.', customsCleared: false }
  ],
  consignees: [
    { name: 'COVATEC CO.,LTD.' },
    { name: 'COVATEC CO.,LTD. (JOONGBU BRANCH)' },
    { name: 'COVATEC CO.,LTD. (DREAM TECH)' },
    { name: 'COVATEC CO.,LTD. (YEOMYEONG)' }
  ],
  flights: [
    { code: 'OZ734' },
    { code: 'KJ374' }
  ],
  ports: [
    { code: 'HAN', name: 'Hà Nội - Nội Bài', kind: PORT_KINDS.POL },
    { code: 'SEL', name: 'Seoul - Incheon', kind: PORT_KINDS.POD }
  ],
  items: [
    { name: 'PIN BLOCK' },
    { name: 'JIG' },
    { name: 'PINBLOCK PART' }
  ]
};

/**
 * Kiểm tra trùng lặp trong một danh mục.
 * So sánh không phân biệt hoa/thường và khoảng trắng thừa; với shipper thì cờ
 * thông quan cũng tính vào định danh (TQ và KTQ là hai lựa chọn khác nhau).
 *
 * @param {Array} entries
 * @param {Object} candidate
 * @param {string} type
 * @param {string|null} excludeId
 * @returns {Object|null} Bản ghi bị trùng, hoặc null
 */
export function findDuplicateEntry(entries, candidate, type, excludeId = null) {
  const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const keyOf = (e) => norm(e.name) || norm(e.code);

  return (entries || []).find(e => {
    if (excludeId && e.id === excludeId) return false;
    if (keyOf(e) !== keyOf(candidate)) return false;
    if (type === 'shippers') return Boolean(e.customsCleared) === Boolean(candidate.customsCleared);
    return true;
  }) || null;
}

/** Danh mục hợp lệ hay không (dùng khi nạp dữ liệu từ Storage / Cloud). */
export function normalizeCatalogs(raw) {
  const result = {};
  for (const type of CATALOG_TYPES) {
    result[type] = Array.isArray(raw && raw[type]) ? raw[type] : [];
  }
  return result;
}
