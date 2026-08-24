/**
 * EXCHANGE RATE SERVICE - TỶ GIÁ THEO NGÀY
 *
 * Nhập tỷ giá từ file Excel "TH TỈ GIÁ" và tra tỷ giá của một ngày cụ thể.
 * Đây là dữ liệu nền cho Bảng kê chi tiết cước quốc tế: cột TOTAL AMOUNT (VND)
 * được quy đổi theo tỷ giá của đúng ngày chuyển hàng.
 *
 * File nguồn KHÔNG có dòng tiêu đề nên cột được nhận diện theo vị trí
 * (xem EXCHANGE_RATE_IMPORT trong config.js).
 */

import { EXCHANGE_RATE_BOUNDS, EXCHANGE_RATE_IMPORT } from '../config.js';
import { parseExcelDate } from '../utils/formatters.js';

/**
 * Đọc một ô số về Number, bỏ qua ô trống.
 * @param {*} val
 * @returns {number|null}
 */
function parseRateCell(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = typeof val === "number" ? val : Number(String(val).trim().replace(/,/g, "."));
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Kiểm tra một tỷ giá có nằm trong biên hợp lệ.
 * @param {number|null} value
 * @param {{min: number, max: number}} bounds
 * @returns {boolean} true nếu hợp lệ hoặc bỏ trống (bỏ trống là chấp nhận được)
 */
function withinBounds(value, bounds) {
  if (value === null) return true;
  return value >= bounds.min && value <= bounds.max;
}

/**
 * Chuẩn hoá và sắp xếp danh sách tỷ giá theo ngày tăng dần.
 * @param {Array} rates
 * @returns {Array}
 */
function sortByDate(rates) {
  return [...rates].sort((a, b) => a.date.localeCompare(b.date));
}

export class ExchangeRateService {
  /**
   * Chuyển mảng ô thô của sheet thành danh sách tỷ giá.
   *
   * Tách riêng khỏi phần đọc file để logic nhận diện cột và kiểm tra biên chạy
   * được trong Node và có test tự động — đây là chỗ mà một lỗi im lặng sẽ dẫn tới
   * hóa đơn sai hàng nghìn lần.
   *
   * Bỏ qua dòng chỉ có ngày mà chưa điền tỷ giá: file nguồn điền sẵn ngày của cả
   * năm nên phần ngày tương lai luôn trống, đó là bình thường chứ không phải lỗi.
   *
   * @param {Array<Array>} rows Mảng 2 chiều từ sheet_to_json({ header: 1 })
   * @returns {{rates: Array, rejected: Array, skipped: number, scanned: number, fatalError: string|null}}
   */
  static mapRowsToRates(rows) {
    const { colDate, colKrwToVnd, colUsdToVnd, maxRejectRatio } = EXCHANGE_RATE_IMPORT;
    const rates = [];
    const rejected = [];
    let skipped = 0;
    let scanned = 0;

    (rows || []).forEach((row, index) => {
      if (!Array.isArray(row)) return;

      const date = parseExcelDate(row[colDate]);
      if (!date) return; // dòng trống hoặc dòng tiêu đề rác

      scanned++;

      const krwToVnd = parseRateCell(row[colKrwToVnd]);
      const usdToVnd = parseRateCell(row[colUsdToVnd]);

      // Ngày đã có nhưng chưa điền tỷ giá -> chưa phải dữ liệu, không phải lỗi
      if (krwToVnd === null && usdToVnd === null) {
        skipped++;
        return;
      }

      const krwOk = withinBounds(krwToVnd, EXCHANGE_RATE_BOUNDS.krwToVnd);
      const usdOk = withinBounds(usdToVnd, EXCHANGE_RATE_BOUNDS.usdToVnd);

      if (!krwOk || !usdOk) {
        rejected.push({
          excelRow: index + 1,
          date,
          krwToVnd,
          usdToVnd,
          reason: !krwOk
            ? `Tỷ giá KRW→VND ${krwToVnd} ngoài khoảng ${EXCHANGE_RATE_BOUNDS.krwToVnd.min}–${EXCHANGE_RATE_BOUNDS.krwToVnd.max}`
            : `Tỷ giá USD→VND ${usdToVnd} ngoài khoảng ${EXCHANGE_RATE_BOUNDS.usdToVnd.min}–${EXCHANGE_RATE_BOUNDS.usdToVnd.max}`
        });
        return;
      }

      rates.push({ date, krwToVnd, usdToVnd, source: "EXCEL" });
    });

    let fatalError = null;
    const usable = rates.length + rejected.length;

    // Quá nhiều dòng sai thì dừng cả lần nhập: nhập một phần dữ liệu đáng ngờ
    // còn tệ hơn không nhập, vì người dùng sẽ tin vào số đã vào được
    if (usable > 0 && rejected.length / usable > maxRejectRatio) {
      fatalError =
        `${rejected.length}/${usable} dòng có tỷ giá ngoài khoảng hợp lệ. ` +
        `File có thể sai định dạng hoặc bị dịch cột — hệ thống đã dừng để không nhập dữ liệu sai. ` +
        `Cần cột B là ngày, cột D là tỷ giá KRW→VND, cột E là tỷ giá USD→VND.`;
    } else if (rates.length === 0) {
      fatalError = "Không đọc được dòng tỷ giá nào hợp lệ từ file.";
    }

    return { rates: sortByDate(rates), rejected, skipped, scanned, fatalError };
  }

  /**
   * Đọc file Excel tỷ giá.
   * @param {File} file
   * @returns {Promise<{rates: Array, rejected: Array, skipped: number, scanned: number}>}
   */
  static parseFromExcel(file) {
    return new Promise((resolve, reject) => {
      if (!window.XLSX) {
        reject(new Error("Thư viện SheetJS chưa được nạp."));
        return;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const workbook = window.XLSX.read(new Uint8Array(e.target.result), { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            reject(new Error("File Excel không chứa bảng dữ liệu hợp lệ."));
            return;
          }

          // header: 1 -> đọc theo mảng vị trí vì file nguồn không có dòng tiêu đề
          const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            raw: true,
            defval: null
          });

          const result = this.mapRowsToRates(rows);
          if (result.fatalError) {
            reject(new Error(result.fatalError));
            return;
          }

          resolve(result);
        } catch (err) {
          reject(new Error(`Lỗi đọc file Excel tỷ giá: ${err.message}`));
        }
      };

      reader.onerror = () => reject(new Error("Không đọc được file."));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Gộp tỷ giá mới vào danh sách hiện có, cập nhật đè theo ngày.
   * Nhập lại cùng một file không sinh bản ghi trùng.
   *
   * @param {Array} existing
   * @param {Array} incoming
   * @returns {{rates: Array, added: number, updated: number}}
   */
  static merge(existing = [], incoming = []) {
    const byDate = new Map((existing || []).map(r => [r.date, r]));
    let added = 0;
    let updated = 0;

    for (const rate of incoming) {
      if (byDate.has(rate.date)) {
        const prev = byDate.get(rate.date);
        // Giữ lại giá trị cũ cho ô mà file mới bỏ trống
        byDate.set(rate.date, {
          ...prev,
          ...rate,
          krwToVnd: rate.krwToVnd ?? prev.krwToVnd,
          usdToVnd: rate.usdToVnd ?? prev.usdToVnd
        });
        updated++;
      } else {
        byDate.set(rate.date, rate);
        added++;
      }
    }

    return { rates: sortByDate([...byDate.values()]), added, updated };
  }

  /**
   * Tra tỷ giá KRW→VND của một ngày.
   *
   * Cố tình KHÔNG nội suy và KHÔNG lấy ngày gần nhất: bảng kê gửi khách phải dùng
   * đúng tỷ giá của ngày chuyển hàng, nên thiếu dữ liệu phải báo thiếu chứ không
   * được đoán.
   *
   * @param {Array} rates
   * @param {string} date YYYY-MM-DD
   * @returns {number|null}
   */
  static getKrwToVnd(rates, date) {
    if (!date) return null;
    const hit = (rates || []).find(r => r.date === date);
    return hit && hit.krwToVnd ? hit.krwToVnd : null;
  }

  /**
   * Tra tỷ giá USD→VND của một ngày.
   * @param {Array} rates
   * @param {string} date YYYY-MM-DD
   * @returns {number|null}
   */
  static getUsdToVnd(rates, date) {
    if (!date) return null;
    const hit = (rates || []).find(r => r.date === date);
    return hit && hit.usdToVnd ? hit.usdToVnd : null;
  }

  /**
   * Lọc tỷ giá theo tháng để hiển thị bảng.
   * @param {Array} rates
   * @param {string} yearMonth YYYY-MM
   * @returns {Array}
   */
  static listByMonth(rates, yearMonth) {
    if (!yearMonth) return [];
    return (rates || []).filter(r => r.date.startsWith(yearMonth));
  }

  /** Các tháng có dữ liệu, mới nhất trước, dùng cho dropdown chọn tháng. */
  static availableMonths(rates) {
    const months = new Set((rates || []).map(r => r.date.slice(0, 7)));
    return [...months].sort((a, b) => b.localeCompare(a));
  }
}
