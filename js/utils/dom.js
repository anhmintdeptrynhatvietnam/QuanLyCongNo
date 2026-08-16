/**
 * DOM UTILITY - QUẢN LÝ CÔNG NỢ
 * Helper thao tác DOM, escape chống tấn công XSS, render icon Lucide an toàn.
 */

/**
 * Thoát các ký tự đặc biệt trong chuỗi để ngăn ngừa XSS
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Shortcut querySelector
 * @param {string} selector
 * @param {Element|Document} parent
 * @returns {Element|null}
 */
export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Shortcut querySelectorAll
 * @param {string} selector
 * @param {Element|Document} parent
 * @returns {Element[]}
 */
export function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

/**
 * Render lại Lucide Icons cho toàn bộ hoặc 1 phần tử DOM
 */
export function refreshLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}
