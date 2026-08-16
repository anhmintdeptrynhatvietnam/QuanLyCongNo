/**
 * VALIDATORS UTILITY - QUẢN LÝ CÔNG NỢ
 * Kiểm tra tính hợp lệ của Mã số thuế, Số điện thoại, Email, Số tiền.
 */

/**
 * Kiểm tra Mã số thuế Việt Nam (10 số hoặc 13 số có dấu gạch ngang)
 * @param {string} taxCode
 * @returns {boolean}
 */
export function isValidTaxCode(taxCode) {
  if (!taxCode) return true; // Cho phép rỗng nếu không bắt buộc
  const clean = taxCode.trim();
  // Định dạng: 10 chữ số hoặc 10 chữ số - 3 chữ số chi nhánh (vd: 0108999888 hoặc 0108999888-001)
  const regex = /^[0-9]{10}(-[0-9]{3})?$/;
  return regex.test(clean);
}

/**
 * Kiểm tra Số điện thoại Việt Nam hợp lệ
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone) return true;
  const clean = phone.trim().replace(/[\s.-]/g, '');
  const regex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
  return regex.test(clean) || (clean.length >= 9 && clean.length <= 11);
}

/**
 * Kiểm tra Email hợp lệ
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email) return true;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

/**
 * Chuyển đổi chuỗi nhập tiền thành số nguyên an toàn
 * @param {string|number} value
 * @returns {number}
 */
export function sanitizeNumber(value) {
  if (typeof value === "number") return Math.round(value);
  if (!value) return 0;
  // Loại bỏ dấu chấm phân cách hàng nghìn, chữ cái và ký hiệu tiền tệ
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}
