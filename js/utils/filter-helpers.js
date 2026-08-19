/**
 * FILTER HELPERS UTILITY - QUẢN LÝ CÔNG NỢ
 * Cung cấp các hàm tiện ích xử lý lọc theo ngày tháng, số tiền, sắp xếp và quản lý bộ lọc đa tiêu chí.
 */

import { toInputDateFormat } from './formatters.js';

/**
 * Danh sách các preset khoảng thời gian thông dụng
 */
export const DATE_PRESETS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'last_7_days', label: '7 ngày qua' },
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'this_quarter', label: 'Quý này' },
  { id: 'this_year', label: 'Năm nay' }
];

/**
 * Lấy khoảng thời gian { fromDate, toDate } theo preset (định dạng YYYY-MM-DD)
 * @param {string} presetId
 * @param {Date} [referenceDate]
 * @returns {{ fromDate: string, toDate: string }}
 */
export function getPresetDateRange(presetId, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 - 11
  const d = now.getDate();

  switch (presetId) {
    case 'today': {
      const todayStr = toInputDateFormat(now);
      return { fromDate: todayStr, toDate: todayStr };
    }
    case 'last_7_days': {
      const past = new Date(now);
      past.setDate(d - 6);
      return {
        fromDate: toInputDateFormat(past),
        toDate: toInputDateFormat(now)
      };
    }
    case 'this_month': {
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);
      return {
        fromDate: toInputDateFormat(firstDay),
        toDate: toInputDateFormat(lastDay)
      };
    }
    case 'last_month': {
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      return {
        fromDate: toInputDateFormat(firstDay),
        toDate: toInputDateFormat(lastDay)
      };
    }
    case 'this_quarter': {
      const quarterIndex = Math.floor(m / 3);
      const firstDay = new Date(y, quarterIndex * 3, 1);
      const lastDay = new Date(y, (quarterIndex + 1) * 3, 0);
      return {
        fromDate: toInputDateFormat(firstDay),
        toDate: toInputDateFormat(lastDay)
      };
    }
    case 'this_year': {
      const firstDay = new Date(y, 0, 1);
      const lastDay = new Date(y, 11, 31);
      return {
        fromDate: toInputDateFormat(firstDay),
        toDate: toInputDateFormat(lastDay)
      };
    }
    case 'all':
    default:
      return { fromDate: '', toDate: '' };
  }
}

/**
 * Kiểm tra xem một chuỗi ngày có nằm trong khoảng [fromDate, toDate] hay không
 * @param {string|Date} dateVal
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @returns {boolean}
 */
export function isDateInRange(dateVal, fromDate, toDate) {
  if (!dateVal) return false;
  if (!fromDate && !toDate) return true;

  // Lấy chuỗi YYYY-MM-DD
  const targetStr = toInputDateFormat(dateVal);
  if (!targetStr) return false;

  if (fromDate && targetStr < fromDate) return false;
  if (toDate && targetStr > toDate) return false;

  return true;
}

/**
 * Kiểm tra xem một số tiền có nằm trong khoảng [minAmount, maxAmount]
 * @param {number} amount
 * @param {number|string} minAmount
 * @param {number|string} maxAmount
 * @returns {boolean}
 */
export function isAmountInRange(amount, minAmount, maxAmount) {
  const val = Number(amount) || 0;
  const min = minAmount !== '' && minAmount !== null && minAmount !== undefined ? Number(minAmount) : null;
  const max = maxAmount !== '' && maxAmount !== null && maxAmount !== undefined ? Number(maxAmount) : null;

  if (min !== null && !isNaN(min) && val < min) return false;
  if (max !== null && !isNaN(max) && val > max) return false;
  return true;
}

/**
 * Sắp xếp danh sách đối tượng
 * @param {Array} items
 * @param {string} sortField
 * @param {'asc'|'desc'} [sortOrder='asc']
 * @returns {Array}
 */
export function sortDataList(items, sortField, sortOrder = 'asc') {
  if (!items || !items.length || !sortField) return items || [];

  return [...items].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    // Xử lý kiểu số
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    }

    // Xử lý kiểu chuỗi
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (strA < strB) return sortOrder === 'desc' ? 1 : -1;
    if (strA > strB) return sortOrder === 'desc' ? -1 : 1;
    return 0;
  });
}

/**
 * Đếm số lượng bộ lọc đang kích hoạt khác giá trị mặc định
 * @param {Object} filterState - Đối tượng chứa trạng thái các bộ lọc
 * @param {Object} defaultFilterState - Đối tượng chứa giá trị mặc định
 * @returns {number}
 */
export function countActiveFilters(filterState, defaultFilterState) {
  if (!filterState || !defaultFilterState) return 0;
  let count = 0;

  for (const key of Object.keys(filterState)) {
    // Bỏ qua các trường không tính là filter (như isAdvancedOpen, sortOrder...)
    if (key.startsWith('_') || key === 'isAdvancedOpen' || key === 'sortBy' || key === 'sortOrder') continue;

    const currentVal = filterState[key];
    const defaultVal = defaultFilterState[key];

    if (currentVal !== undefined && currentVal !== null && currentVal !== '' && currentVal !== defaultVal) {
      count++;
    }
  }

  return count;
}
