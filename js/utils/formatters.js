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
 * Chuyển chuỗi tiền tệ bất kỳ (e.g. "50.000.000", "50,000,000", "50000000 ₫") sang số nguyên
 * @param {string|number} value
 * @returns {number}
 */
export function parseCurrency(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : Math.round(value);
  const cleanStr = String(value).replace(/[^\d]/g, "");
  const num = parseInt(cleanStr, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Format số thành chuỗi phân cách hàng nghìn bằng dấu chấm (e.g. 50.000.000)
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCurrencyNumber(amount) {
  if (amount === undefined || amount === null || amount === "") return "";
  const num = parseCurrency(amount);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Đọc số tiền thành chữ Tiếng Việt chuẩn kế toán
 * @param {number|string} number
 * @returns {string} Ví dụ: Năm mươi triệu đồng
 */
export function numberToWordsVN(number) {
  const n = Math.round(Number(number));
  if (isNaN(n) || n === 0) return "Không đồng";
  if (n < 0) return `Âm ${numberToWordsVN(-n).toLowerCase()}`;

  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

  function readTriple(tripleStr, hasHundred) {
    const a = parseInt(tripleStr[0], 10);
    const b = parseInt(tripleStr[1], 10);
    const c = parseInt(tripleStr[2], 10);
    let str = "";

    if (hasHundred || a > 0) {
      str += digits[a] + " trăm ";
      if (b === 0 && c > 0) str += "lẻ ";
    }

    if (b > 1) {
      str += digits[b] + " mươi ";
      if (c === 1) str += "mốt ";
      else if (c === 5) str += "lăm ";
      else if (c > 0) str += digits[c] + " ";
    } else if (b === 1) {
      str += "mười ";
      if (c === 5) str += "lăm ";
      else if (c > 0) str += digits[c] + " ";
    } else if (b === 0 && c > 0) {
      str += digits[c] + " ";
    }

    return str.trim();
  }

  let strNum = n.toString();
  while (strNum.length % 3 !== 0) {
    strNum = "0" + strNum;
  }

  const groupCount = strNum.length / 3;
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push(strNum.substring(i * 3, i * 3 + 3));
  }

  let words = [];
  for (let i = 0; i < groupCount; i++) {
    const g = groups[i];
    const unitIdx = groupCount - 1 - i;
    const gNum = parseInt(g, 10);

    if (gNum > 0) {
      const hasHundred = i > 0;
      const tripleText = readTriple(g, hasHundred);
      const unit = units[unitIdx % units.length];
      words.push(`${tripleText} ${unit}`.trim());
    } else if (unitIdx > 0 && unitIdx % 3 === 0 && words.length > 0) {
      words.push("tỷ");
    }
  }

  let result = words.join(" ").replace(/\s+/g, " ").trim();
  if (!result) return "Không đồng";
  result = result.charAt(0).toUpperCase() + result.slice(1) + " đồng";
  return result;
}

/**
 * Khởi tạo tự động format dấu chấm cho input tiền tệ và liên kết preview text bằng chữ
 * @param {HTMLInputElement} inputEl
 * @param {Object} [options]
 * @param {HTMLElement} [options.previewEl]
 * @param {function} [options.onValueChange]
 */
export function setupCurrencyInput(inputEl, options = {}) {
  if (!inputEl || inputEl._currencyBound) return;
  inputEl._currencyBound = true;

  inputEl.type = "text";
  inputEl.inputMode = "numeric";
  inputEl.autocomplete = "off";

  const updatePreview = () => {
    const rawVal = parseCurrency(inputEl.value);
    const previewEl = options.previewEl || 
      (inputEl.id ? document.getElementById(`${inputEl.id}-preview`) : null) ||
      inputEl.closest(".form-group")?.querySelector(".currency-preview-text");

    if (previewEl) {
      if (rawVal > 0) {
        previewEl.innerHTML = `
          <span style="display: inline-flex; align-items: center; gap: 4px; color: var(--primary-600); font-weight: 500;">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Bằng chữ: <b>${numberToWordsVN(rawVal)}</b>
          </span>
        `;
      } else {
        previewEl.innerHTML = "";
      }
    }

    if (typeof options.onValueChange === "function") {
      options.onValueChange(rawVal);
    }
  };

  inputEl.addEventListener("input", () => {
    const cursor = inputEl.selectionStart || 0;
    const oldVal = inputEl.value;
    const rawDigits = oldVal.replace(/\D/g, "");

    if (!rawDigits) {
      inputEl.value = "";
      updatePreview();
      return;
    }

    const num = parseInt(rawDigits, 10);
    const newVal = formatCurrencyNumber(num);
    inputEl.value = newVal;

    const digitsBeforeCursor = oldVal.slice(0, cursor).replace(/\D/g, "").length;
    let newCursor = 0;
    let countedDigits = 0;
    for (let i = 0; i < newVal.length; i++) {
      if (/\d/.test(newVal[i])) {
        countedDigits++;
      }
      if (countedDigits >= digitsBeforeCursor) {
        newCursor = i + 1;
        break;
      }
    }
    if (newCursor === 0 && newVal.length > 0) newCursor = newVal.length;

    inputEl.setSelectionRange(newCursor, newCursor);
    updatePreview();
  });

  inputEl.addEventListener("focus", () => {
    if (inputEl.value === "0") {
      inputEl.select();
    }
  });

  if (inputEl.value) {
    const raw = parseCurrency(inputEl.value);
    if (raw > 0) {
      inputEl.value = formatCurrencyNumber(raw);
    }
  }
  updatePreview();
}

/**
 * Tự động tìm và khởi tạo tất cả input có class .currency-input trong container
 * @param {HTMLElement|Document} container
 */
export function initCurrencyInputs(container = document) {
  if (!container) return;
  const inputs = container.querySelectorAll(".currency-input");
  inputs.forEach(input => setupCurrencyInput(input));
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
 * Đọc một ô ngày lấy từ Excel về dạng YYYY-MM-DD.
 *
 * Trả về null khi không đọc được, để nơi gọi tự quyết định: nhập hóa đơn thì lùi
 * về ngày mặc định, còn nhập tỷ giá thì phải bỏ qua dòng đó (gán ngày hôm nay cho
 * một dòng tỷ giá thiếu ngày sẽ tạo ra tỷ giá sai cho ngày hôm nay).
 *
 * Nhận: đối tượng Date, Excel serial number, DD/MM/YYYY, YYYY-MM-DD (và biến thể
 * phân tách bằng `-` `.` `/`).
 *
 * @param {*} val Giá trị ô lấy từ SheetJS
 * @returns {string|null} YYYY-MM-DD hoặc null
 */
export function parseExcelDate(val) {
  if (!val) return null;

  if (val instanceof Date && !isNaN(val.getTime())) {
    return toInputDateFormat(val);
  }

  if (typeof val === "number") {
    // Excel serial date: số ngày kể từ 1900-01-01, lệch 25569 ngày so với epoch Unix
    const d = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return toInputDateFormat(d);
  }

  const str = String(val).trim();

  // DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }

  // YYYY-MM-DD hoặc YYYY/MM/DD hoặc YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return toInputDateFormat(d);

  return null;
}

/**
 * Định dạng mốc thời gian ISO sang DD/MM/YYYY HH:mm
 * Dùng cho dấu vết sửa đổi (ai sửa, lúc nào).
 * @param {string|Date} value
 * @returns {string}
 */
export function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
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
