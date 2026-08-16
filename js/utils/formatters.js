/**
 * FORMATTERS UTILITY - QUẢN LÝ CÔNG NỢ
 * Định dạng tiền tệ VND, ngày tháng, phần trăm và Badges trạng thái.
 */

import { INVOICE_STATUS, INVOICE_STATUS_LABELS, AGING_BUCKETS } from '../config.js';

/**
 * Định dạng số tiền sang chuẩn Việt Nam Đồng (VND)
 * @param {number} amount
 * @param {boolean} includeSymbol - Kèm ký hiệu ₫
 * @returns {string} Ví dụ: 1.250.000 ₫
 */
export function formatCurrency(amount, includeSymbol = true) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return includeSymbol ? "0 ₫" : "0";
  }
  const formatted = Math.round(Number(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return includeSymbol ? `${formatted} ₫` : formatted;
}

/**
 * Định dạng chuỗi ngày YYYY-MM-DD sang DD/MM/YYYY
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatDate(dateVal) {
  if (!dateVal) return "-";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format ngày thành input YYYY-MM-DD cho HTML datepicker
 * @param {Date|string} date
 * @returns {string}
 */
export function toInputDateFormat(date = new Date()) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Định dạng phần trăm
 * @param {number} value
 * @returns {string} Ví dụ: 45.5%
 */
export function formatPercent(value) {
  if (isNaN(value)) return "0%";
  return `${Number(value).toFixed(1)}%`;
}

/**
 * Tạo HTML Badge trạng thái hóa đơn
 * @param {string} status - UNPAID | PARTIAL | PAID | OVERDUE
 * @returns {string} HTML string
 */
export function renderInvoiceStatusBadge(status) {
  const label = INVOICE_STATUS_LABELS[status] || status;
  let badgeClass = "badge-unpaid";

  switch (status) {
    case INVOICE_STATUS.PAID:
      badgeClass = "badge-paid";
      break;
    case INVOICE_STATUS.PARTIAL:
      badgeClass = "badge-partial";
      break;
    case INVOICE_STATUS.OVERDUE:
      badgeClass = "badge-overdue";
      break;
    case INVOICE_STATUS.UNPAID:
    default:
      badgeClass = "badge-unpaid";
      break;
  }

  return `
    <span class="badge ${badgeClass}">
      <span class="badge-dot"></span>
      ${label}
    </span>
  `;
}

/**
 * Render Aging Badge
 * @param {string} bucketKey
 * @returns {string}
 */
export function renderAgingBadge(bucketKey) {
  const bucket = AGING_BUCKETS[bucketKey] || AGING_BUCKETS.CURRENT;
  return `
    <span class="badge" style="background-color: ${bucket.color}15; color: ${bucket.color}; border: 1px solid ${bucket.color}40;">
      <span class="badge-dot" style="background-color: ${bucket.color};"></span>
      ${bucket.label}
    </span>
  `;
}
