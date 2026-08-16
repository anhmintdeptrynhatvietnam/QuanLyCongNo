/**
 * EXPORT SERVICE - QUẢN LÝ CÔNG NỢ
 * Xuất dữ liệu ra file Excel (SheetJS) và tạo Biên bản đối chiếu công nợ.
 */

import { formatCurrency, formatDate, toInputDateFormat } from '../utils/formatters.js';

export class ExportService {
  /**
   * Xuất danh sách hóa đơn/công nợ ra file Excel
   * @param {Array} invoices
   * @param {string} fileName
   */
  static exportInvoicesToExcel(invoices = [], fileName = "Danh_Sach_Cong_No") {
    if (!window.XLSX) {
      alert("Thư viện SheetJS chưa được tải!");
      return;
    }

    const rows = invoices.map((inv, idx) => ({
      "STT": idx + 1,
      "Số Hóa Đơn": inv.invoiceNumber,
      "Hàng Hóa / Dịch Vụ": inv.itemName || inv.title || "",
      "Đối Tác": inv.partnerName,
      "Loại": inv.type === "RECEIVABLE" ? "Phải Thu" : "Phải Trả",
      "Ngày Phát Sinh": formatDate(inv.issueDate),
      "Hạn Thanh Toán": formatDate(inv.dueDate),
      "Tổng Tiền (VNĐ)": inv.totalAmount,
      "Đã Thanh Toán (VNĐ)": inv.paidAmount,
      "Còn Nợ (VNĐ)": Math.max(0, inv.totalAmount - inv.paidAmount),
      "Trạng Thái": inv.status,
      "Ghi Chú": inv.notes || ""
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Công Nợ");

    window.XLSX.writeFile(workbook, `${fileName}_${toInputDateFormat(new Date())}.xlsx`);
  }

  /**
   * Xuất Báo cáo Ma trận Tuổi nợ ra Excel
   */
  static exportAgingMatrixToExcel(agingData = [], fileName = "Bao_Cao_Tuoi_No") {
    if (!window.XLSX) return;

    const rows = agingData.map((item, idx) => ({
      "STT": idx + 1,
      "Mã Đối Tác": item.code,
      "Tên Đối Tác": item.name,
      "Tổng Nợ (VNĐ)": item.totalDebt,
      "Trong Hạn (0 ngày)": item.current,
      "Quá Hạn 1-30 Ngày": item.overdue1_30,
      "Quá Hạn 31-60 Ngày": item.overdue31_60,
      "Quá Hạn 61-90 Ngày": item.overdue61_90,
      "Quá Hạn > 90 Ngày": item.overdueOver90
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Phân Tích Tuổi Nợ");

    window.XLSX.writeFile(workbook, `${fileName}_${toInputDateFormat(new Date())}.xlsx`);
  }

  /**
   * Tạo và tải file Excel mẫu chuẩn (.xlsx) để nhập danh bạ Khách hàng & NCC
   */
  static generatePartnerImportTemplate() {
    if (!window.XLSX) {
      alert("Thư viện SheetJS chưa được tải!");
      return;
    }

    const templateRows = [
      {
        "Tên Đối Tác (*)": "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        "Mã Đối Tác": "KH-VINAMILK",
        "Phân Loại (*)": "Khách Hàng",
        "Mã Số Thuế": "0300588569",
        "Số Điện Thoại": "028.5415.5555",
        "Địa Chỉ": "Số 10 Tân Trào, P. Tân Phú, Quận 7, TP.HCM",
        "Hạn Mức Nợ (VNĐ)": 500000000,
        "Hạn Nợ (Ngày)": 30
      },
      {
        "Tên Đối Tác (*)": "Tổng Công ty Công nghệ & Giải pháp CMC",
        "Mã Đối Tác": "NCC-CMC",
        "Phân Loại (*)": "Nhà Cung Cấp",
        "Mã Số Thuế": "0100244115",
        "Số Điện Thoại": "024.3795.8668",
        "Địa Chỉ": "Tòa nhà CMC, Phố Duy Tân, Cầu Giấy, Hà Nội",
        "Hạn Mức Nợ (VNĐ)": 200000000,
        "Hạn Nợ (Ngày)": 30
      },
      {
        "Tên Đối Tác (*)": "Công ty Cổ phần FPT Software",
        "Mã Đối Tác": "DT-FPT",
        "Phân Loại (*)": "2 Chiều",
        "Mã Số Thuế": "0101601092",
        "Số Điện Thoại": "024.7300.7300",
        "Địa Chỉ": "Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội",
        "Hạn Mức Nợ (VNĐ)": 300000000,
        "Hạn Nợ (Ngày)": 15
      }
    ];

    const worksheet = window.XLSX.utils.json_to_sheet(templateRows);

    // Cài đặt độ rộng cột cho đẹp mắt
    worksheet["!cols"] = [
      { wch: 40 }, // Tên Đối Tác
      { wch: 18 }, // Mã Đối Tác
      { wch: 16 }, // Phân Loại
      { wch: 16 }, // Mã Số Thuế
      { wch: 16 }, // Số Điện Thoại
      { wch: 45 }, // Địa Chỉ
      { wch: 20 }, // Hạn Mức Nợ
      { wch: 16 }  // Hạn Nợ (Ngày)
    ];

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Mau_Nhap_Doi_Tac");
    window.XLSX.writeFile(workbook, "Mau_Nhap_Danh_Sach_Doi_Tac.xlsx");
  }

  /**
   * Đọc và chuẩn hóa danh sách đối tác từ file Excel
   * @param {File} file
   * @returns {Promise<{ partners: Array, summary: Object }>}
   */
  static parsePartnersFromExcel(file) {
    return new Promise((resolve, reject) => {
      if (!window.XLSX) {
        reject(new Error("Thư viện SheetJS chưa được nạp."));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: "array" });

          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            reject(new Error("File Excel không chứa bảng dữ liệu hợp lệ."));
            return;
          }

          const rawRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "" });
          if (!rawRows || rawRows.length === 0) {
            reject(new Error("File Excel không có dòng dữ liệu nào!"));
            return;
          }

          const removeVietnameseTones = (str) => {
            str = String(str || "");
            str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
            str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
            str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
            str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
            str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
            str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
            str = str.replace(/đ|Đ/g, "d");
            str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "a");
            str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "e");
            str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "i");
            str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "o");
            str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "u");
            str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "y");
            str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return str.toLowerCase().replace(/[^a-z0-9]/g, "");
          };

          const partners = [];
          let validCount = 0;
          let invalidCount = 0;

          rawRows.forEach((row, idx) => {
            // Tìm giá trị tương ứng với từng cột linh hoạt
            let rawName = "";
            let rawCode = "";
            let rawType = "CUSTOMER";
            let rawTax = "";
            let rawPhone = "";
            let rawAddress = "";
            let rawLimit = 0;
            let rawTerm = 30;

            for (const [colName, colVal] of Object.entries(row)) {
              const cleanKey = removeVietnameseTones(colName);
              const strVal = String(colVal).trim();

              // Tên đối tác (bắt buộc)
              if (
                cleanKey.includes("tendoitac") ||
                cleanKey.includes("tenkhachhang") ||
                cleanKey.includes("tenncc") ||
                cleanKey.includes("tendoituong") ||
                cleanKey === "ten" ||
                cleanKey === "name" ||
                cleanKey.includes("fullname") ||
                cleanKey.includes("hoten") ||
                (cleanKey.includes("doitac") && !cleanKey.includes("ma") && !cleanKey.includes("loai"))
              ) {
                rawName = strVal;
              }
              // Mã đối tác
              else if (
                cleanKey.includes("madoitac") ||
                cleanKey.includes("makh") ||
                cleanKey.includes("mancc") ||
                cleanKey.includes("madoituong") ||
                cleanKey === "ma" ||
                cleanKey === "code" ||
                cleanKey === "id"
              ) {
                rawCode = strVal;
              }
              // Phân loại
              else if (
                cleanKey.includes("phanloai") ||
                cleanKey.includes("loai") ||
                cleanKey.includes("type") ||
                cleanKey.includes("nhom")
              ) {
                const typeStr = removeVietnameseTones(strVal);
                if (typeStr.includes("ncc") || typeStr.includes("nhacungcap") || typeStr.includes("vendor") || typeStr.includes("supplier") || typeStr.includes("phaitra")) {
                  rawType = "VENDOR";
                } else if (typeStr.includes("2chieu") || typeStr.includes("both") || typeStr.includes("cahai") || typeStr.includes("doitac2chieu")) {
                  rawType = "BOTH";
                } else {
                  rawType = "CUSTOMER";
                }
              }
              // Mã số thuế
              else if (
                cleanKey.includes("masothue") ||
                cleanKey.includes("mst") ||
                cleanKey.includes("tax") ||
                cleanKey.includes("taxcode")
              ) {
                rawTax = strVal;
              }
              // Số điện thoại
              else if (
                cleanKey.includes("sodienthoai") ||
                cleanKey.includes("sdt") ||
                cleanKey.includes("dienthoai") ||
                cleanKey.includes("phone") ||
                cleanKey.includes("tel") ||
                cleanKey.includes("mobile")
              ) {
                rawPhone = strVal;
              }
              // Địa chỉ
              else if (
                cleanKey.includes("diachi") ||
                cleanKey.includes("address") ||
                cleanKey === "dc"
              ) {
                rawAddress = strVal;
              }
              // Hạn mức tín dụng / nợ
              else if (
                cleanKey.includes("hanmuc") ||
                cleanKey.includes("creditlimit") ||
                cleanKey.includes("limit") ||
                cleanKey.includes("tienno") ||
                cleanKey.includes("duno")
              ) {
                const numStr = String(colVal).replace(/[^\d]/g, "");
                rawLimit = parseInt(numStr, 10) || 0;
              }
              // Hạn nợ ngày
              else if (
                cleanKey.includes("songay") ||
                cleanKey.includes("hanno") ||
                cleanKey.includes("term") ||
                cleanKey.includes("days") ||
                cleanKey.includes("thoihan")
              ) {
                const termNum = parseInt(String(colVal).replace(/[^\d]/g, ""), 10);
                rawTerm = isNaN(termNum) || termNum <= 0 ? 30 : termNum;
              }
            }

            const isValid = rawName.length > 0;
            if (isValid) validCount++; else invalidCount++;

            partners.push({
              rowIndex: idx + 2, // Excel row number (1-based header is row 1)
              name: rawName,
              code: rawCode || `P-${Date.now().toString(36).toUpperCase()}-${idx + 1}`,
              type: rawType,
              taxCode: rawTax,
              phone: rawPhone,
              address: rawAddress,
              creditLimit: rawLimit,
              creditTermDays: rawTerm,
              isValid,
              error: isValid ? "" : "Thiếu tên đối tác (bắt buộc)"
            });
          });

          resolve({
            partners,
            summary: {
              total: rawRows.length,
              valid: validCount,
              invalid: invalidCount
            }
          });
        } catch (err) {
          reject(new Error("Lỗi khi đọc file Excel: " + err.message));
        }
      };

      reader.onerror = () => reject(new Error("Không thể đọc file!"));
      reader.readAsArrayBuffer(file);
    });
  }
}
