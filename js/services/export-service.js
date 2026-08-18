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
      "Tiền Chưa Thuế (VNĐ)": inv.preTaxAmount || (inv.totalAmount - (inv.taxAmount || 0)),
      "Tiền Thuế VAT (VNĐ)": inv.taxAmount || 0,
      "Tổng Tiền (VNĐ)": inv.totalAmount,
      "Đã Thanh Toán (VNĐ)": inv.paidAmount,
      "Còn Nợ (VNĐ)": Math.max(0, inv.totalAmount - inv.paidAmount),
      "Hình Thức": inv.paymentMethod === "CASH" ? "Tiền mặt" : "Chuyển khoản",
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
   * Đọc và chuẩn hóa danh sách đối tác từ file Excel kèm kiểm tra trùng lặp
   * @param {File} file
   * @param {Array} existingPartners Danh sách đối tác hiện có trong hệ thống để so khớp trùng
   * @returns {Promise<{ partners: Array, summary: Object }>}
   */
  static parsePartnersFromExcel(file, existingPartners = []) {
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
          const seenInFileCodes = new Set();
          const seenInFileNames = new Set();
          const seenInFileTaxes = new Set();

          let validCount = 0;
          let dupCount = 0;
          let newCount = 0;
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
            let isDuplicate = false;
            let duplicateReason = "";
            let matchedExistingPartner = null;

            if (isValid) {
              const cleanCode = rawCode.trim().toLowerCase();
              const cleanTax = rawTax.replace(/[^\d]/g, "");
              const cleanName = removeVietnameseTones(rawName);

              // 1. Kiểm tra trùng với đối tác ĐÃ CÓ trong hệ thống
              if (cleanCode) {
                matchedExistingPartner = existingPartners.find(p => p.code && p.code.trim().toLowerCase() === cleanCode);
                if (matchedExistingPartner) {
                  isDuplicate = true;
                  duplicateReason = `Trùng mã "${rawCode}" với đối tác "${matchedExistingPartner.name}" trên hệ thống`;
                }
              }

              if (!isDuplicate && cleanTax) {
                matchedExistingPartner = existingPartners.find(p => p.taxCode && p.taxCode.replace(/[^\d]/g, "") === cleanTax);
                if (matchedExistingPartner) {
                  isDuplicate = true;
                  duplicateReason = `Trùng MST "${rawTax}" với đối tác "${matchedExistingPartner.name}" trên hệ thống`;
                }
              }

              if (!isDuplicate && cleanName) {
                matchedExistingPartner = existingPartners.find(p => removeVietnameseTones(p.name) === cleanName);
                if (matchedExistingPartner) {
                  isDuplicate = true;
                  duplicateReason = `Trùng tên "${matchedExistingPartner.name}" đã có trên hệ thống`;
                }
              }

              // 2. Kiểm tra trùng với các dòng trước đó trong chính file Excel này
              if (!isDuplicate) {
                if (cleanCode && seenInFileCodes.has(cleanCode)) {
                  isDuplicate = true;
                  duplicateReason = `Trùng mã "${rawCode}" với dòng trước trong file Excel`;
                } else if (cleanTax && seenInFileTaxes.has(cleanTax)) {
                  isDuplicate = true;
                  duplicateReason = `Trùng MST "${rawTax}" với dòng trước trong file Excel`;
                } else if (cleanName && seenInFileNames.has(cleanName)) {
                  isDuplicate = true;
                  duplicateReason = `Trùng tên "${rawName}" với dòng trước trong file Excel`;
                }
              }

              // Ghi nhận đã thấy trong file
              if (cleanCode) seenInFileCodes.add(cleanCode);
              if (cleanTax) seenInFileTaxes.add(cleanTax);
              if (cleanName) seenInFileNames.add(cleanName);

              validCount++;
              if (isDuplicate) dupCount++; else newCount++;
            } else {
              invalidCount++;
            }

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
              isDuplicate,
              duplicateReason,
              matchedExistingPartner,
              error: isValid ? "" : "Thiếu tên đối tác (bắt buộc)"
            });
          });

          resolve({
            partners,
            summary: {
              total: rawRows.length,
              valid: validCount,
              newCount,
              dupCount,
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

  /**
   * Tạo và tải file Excel mẫu chuẩn (.xlsx) để nhập danh sách Hóa đơn / Chứng từ nợ
   */
  static generateInvoiceImportTemplate() {
    if (!window.XLSX) {
      alert("Thư viện SheetJS chưa được tải!");
      return;
    }

    const todayStr = toInputDateFormat(new Date());
    const dueDateStr = toInputDateFormat(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const templateRows = [
      {
        "Số Hóa Đơn (*)": "HD-2026-001",
        "Tên / Mã Đối Tác (*)": "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
        "Phân Loại (*)": "Phải Thu (Bán Hàng)",
        "Hàng Hóa / Dịch Vụ": "Cung cấp giải pháp phần mềm Quản lý Tài chính đợt 1",
        "Ngày Phát Sinh (*)": todayStr,
        "Hạn Thanh Toán": dueDateStr,
        "Tiền Chưa Thuế (VNĐ)": 100000000,
        "Tiền Thuế VAT (VNĐ)": 10000000,
        "Tổng Tiền (VNĐ) (*)": 110000000,
        "Đã Thanh Toán (VNĐ)": 40000000,
        "Hình Thức Thanh Toán (*)": "Chuyển khoản",
        "Ghi Chú": "Hợp đồng số 12/2026/HĐ-FIS"
      },
      {
        "Số Hóa Đơn (*)": "HD-2026-002",
        "Tên / Mã Đối Tác (*)": "Tổng Công ty Công nghệ & Giải pháp CMC",
        "Phân Loại (*)": "Phải Trả (Mua Hàng)",
        "Hàng Hóa / Dịch Vụ": "Thuê hạ tầng máy chủ Cloud Server quý 3/2026",
        "Ngày Phát Sinh (*)": todayStr,
        "Hạn Thanh Toán": dueDateStr,
        "Tiền Chưa Thuế (VNĐ)": 40909091,
        "Tiền Thuế VAT (VNĐ)": 4090909,
        "Tổng Tiền (VNĐ) (*)": 45000000,
        "Đã Thanh Toán (VNĐ)": 0,
        "Hình Thức Thanh Toán (*)": "Chuyển khoản",
        "Ghi Chú": "Hóa đơn VAT điện tử số 00341"
      },
      {
        "Số Hóa Đơn (*)": "HD-2026-003",
        "Tên / Mã Đối Tác (*)": "Công ty TNHH Văn Phòng Phẩm Minh Anh",
        "Phân Loại (*)": "Phải Trả (Mua Hàng)",
        "Hàng Hóa / Dịch Vụ": "Mua văn phòng phẩm và vật tư nhỏ lẻ",
        "Ngày Phát Sinh (*)": todayStr,
        "Hạn Thanh Toán": "",
        "Tiền Chưa Thuế (VNĐ)": 2000000,
        "Tiền Thuế VAT (VNĐ)": 200000,
        "Tổng Tiền (VNĐ) (*)": 2200000,
        "Đã Thanh Toán (VNĐ)": 2200000,
        "Hình Thức Thanh Toán (*)": "Tiền mặt",
        "Ghi Chú": "Dưới 5 triệu được thanh toán tiền mặt"
      }
    ];

    const worksheet = window.XLSX.utils.json_to_sheet(templateRows);

    // Cài đặt độ rộng cột chuẩn
    worksheet["!cols"] = [
      { wch: 18 }, // Số Hóa Đơn
      { wch: 42 }, // Tên / Mã Đối Tác
      { wch: 22 }, // Phân Loại
      { wch: 45 }, // Hàng Hóa / Dịch Vụ
      { wch: 18 }, // Ngày Phát Sinh
      { wch: 18 }, // Hạn Thanh Toán
      { wch: 20 }, // Tiền Chưa Thuế
      { wch: 18 }, // Tiền Thuế VAT
      { wch: 22 }, // Tổng Tiền
      { wch: 22 }, // Đã Thanh Toán
      { wch: 24 }, // Hình Thức Thanh Toán
      { wch: 35 }  // Ghi Chú
    ];

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Mau_Nhap_Hoa_Don");
    window.XLSX.writeFile(workbook, "Mau_Nhap_Danh_Sach_Hoa_Don.xlsx");
  }

  /**
   * Đọc và chuẩn hóa danh sách Hóa đơn từ file Excel kèm kiểm tra trùng lặp và đối tác
   * @param {File} file
   * @param {Array} existingInvoices Danh sách hóa đơn hiện có
   * @param {Array} existingPartners Danh sách đối tác hiện có
   * @returns {Promise<{ invoices: Array, summary: Object }>}
   */
  static parseInvoicesFromExcel(file, existingInvoices = [], existingPartners = []) {
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

          const parseDateString = (val, fallbackDate = new Date()) => {
            if (!val) return toInputDateFormat(fallbackDate);
            if (val instanceof Date && !isNaN(val.getTime())) {
              return toInputDateFormat(val);
            }
            if (typeof val === "number") {
              // Xử lý Excel serial date number
              const d = new Date((val - 25569) * 86400 * 1000);
              if (!isNaN(d.getTime())) return toInputDateFormat(d);
            }
            const str = String(val).trim();
            // Định dạng DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
            const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (dmyMatch) {
              const day = dmyMatch[1].padStart(2, "0");
              const month = dmyMatch[2].padStart(2, "0");
              const year = dmyMatch[3];
              return `${year}-${month}-${day}`;
            }
            // Định dạng YYYY-MM-DD hoặc YYYY/MM/DD
            const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
            if (ymdMatch) {
              const year = ymdMatch[1];
              const month = ymdMatch[2].padStart(2, "0");
              const day = ymdMatch[3].padStart(2, "0");
              return `${year}-${month}-${day}`;
            }
            const d = new Date(str);
            if (!isNaN(d.getTime())) return toInputDateFormat(d);
            return toInputDateFormat(fallbackDate);
          };

          const invoices = [];
          const seenInFileInvoiceNumbers = new Set();

          let validCount = 0;
          let dupCount = 0;
          let newCount = 0;
          let invalidCount = 0;
          let newPartnerCount = 0;

          const seenNewPartnerNames = new Set();

          rawRows.forEach((row, idx) => {
            let rawInvoiceNumber = "";
            let rawPartnerInput = "";
            let rawType = "";
            let rawItemName = "";
            let rawIssueDateVal = null;
            let rawDueDateVal = null;
            let rawPreTaxAmount = 0;
            let rawTaxAmount = 0;
            let rawTotalAmount = 0;
            let rawPaidAmount = 0;
            let rawPaymentMethod = "BANK_TRANSFER"; // default: Chuyển khoản
            let rawNotes = "";

            for (const [colName, colVal] of Object.entries(row)) {
              const cleanKey = removeVietnameseTones(colName);
              const strVal = String(colVal).trim();

              // Số hóa đơn
              if (
                cleanKey.includes("sohoadon") ||
                cleanKey.includes("mahoadon") ||
                cleanKey.includes("sohd") ||
                cleanKey.includes("invoicenumber") ||
                cleanKey.includes("invoiceno") ||
                cleanKey === "so" ||
                cleanKey === "shd" ||
                cleanKey === "hd"
              ) {
                rawInvoiceNumber = strVal;
              }
              // Đối tác (Tên hoặc Mã)
              else if (
                cleanKey.includes("tendoitac") ||
                cleanKey.includes("madoitac") ||
                cleanKey.includes("doitac") ||
                cleanKey.includes("khachhang") ||
                cleanKey.includes("nhacungcap") ||
                cleanKey.includes("tenkh") ||
                cleanKey.includes("tenncc") ||
                cleanKey.includes("partner") ||
                cleanKey.includes("customer") ||
                cleanKey.includes("vendor")
              ) {
                rawPartnerInput = strVal;
              }
              // Phân loại (Phải thu / Phải trả)
              else if (
                cleanKey.includes("phanloai") ||
                cleanKey.includes("loai") ||
                cleanKey.includes("type") ||
                cleanKey.includes("loaichunghung") ||
                cleanKey.includes("loaihoadon")
              ) {
                const typeStr = removeVietnameseTones(strVal);
                if (
                  typeStr.includes("phaitra") ||
                  typeStr.includes("muahang") ||
                  typeStr.includes("ncc") ||
                  typeStr.includes("nhacungcap") ||
                  typeStr.includes("vendor") ||
                  typeStr.includes("payable") ||
                  typeStr.includes("chi")
                ) {
                  rawType = "PAYABLE";
                } else if (
                  typeStr.includes("phaithu") ||
                  typeStr.includes("banhang") ||
                  typeStr.includes("khachhang") ||
                  typeStr.includes("customer") ||
                  typeStr.includes("receivable") ||
                  typeStr.includes("thu")
                ) {
                  rawType = "RECEIVABLE";
                }
              }
              // Hình thức thanh toán
              else if (
                cleanKey.includes("hinhthucthanhtoan") ||
                cleanKey.includes("hinhthuc") ||
                cleanKey.includes("phuongthuc") ||
                cleanKey.includes("paymentmethod") ||
                cleanKey.includes("method") ||
                cleanKey.includes("hinhthuctt")
              ) {
                const methStr = removeVietnameseTones(strVal);
                if (methStr.includes("tienmat") || methStr.includes("cash") || methStr.includes("tm")) {
                  rawPaymentMethod = "CASH";
                } else {
                  rawPaymentMethod = "BANK_TRANSFER";
                }
              }
              // Đã thanh toán (Kiểm tra trước để tránh nhầm với hạn thanh toán hoặc tiền)
              else if (
                cleanKey.includes("dathanhtoan") ||
                cleanKey.includes("datra") ||
                cleanKey.includes("datt") ||
                cleanKey.includes("tiendatra") ||
                cleanKey.includes("paidamount") ||
                cleanKey.includes("sotiendatra")
              ) {
                const numStr = String(colVal).replace(/[^\d]/g, "");
                rawPaidAmount = parseInt(numStr, 10) || 0;
              }
              // Tiền chưa thuế
              else if (
                cleanKey.includes("chuathue") ||
                cleanKey.includes("tientruocthue") ||
                cleanKey.includes("tienchuathue") ||
                cleanKey.includes("subtotal") ||
                cleanKey.includes("pretax")
              ) {
                const numStr = String(colVal).replace(/[^\d]/g, "");
                rawPreTaxAmount = parseInt(numStr, 10) || 0;
              }
              // Tiền thuế VAT
              else if (
                cleanKey.includes("tienthue") ||
                cleanKey.includes("thuevat") ||
                cleanKey.includes("vatamount") ||
                cleanKey.includes("taxamount") ||
                cleanKey === "thue" ||
                cleanKey === "vat"
              ) {
                const numStr = String(colVal).replace(/[^\d]/g, "");
                rawTaxAmount = parseInt(numStr, 10) || 0;
              }
              // Hàng hóa / Dịch vụ
              else if (
                cleanKey.includes("hanghoa") ||
                cleanKey.includes("dichvu") ||
                cleanKey.includes("tenhang") ||
                cleanKey.includes("noidung") ||
                cleanKey.includes("itemname") ||
                cleanKey.includes("description") ||
                cleanKey.includes("diengiai") ||
                cleanKey.includes("sanpham")
              ) {
                rawItemName = strVal;
              }
              // Ngày phát sinh
              else if (
                cleanKey.includes("ngayphatsinh") ||
                cleanKey.includes("ngayhoadon") ||
                cleanKey.includes("ngaylap") ||
                cleanKey.includes("ngaychungtu") ||
                cleanKey.includes("issuedate") ||
                (cleanKey.includes("ngay") && !cleanKey.includes("han") && !cleanKey.includes("hethan"))
              ) {
                rawIssueDateVal = colVal;
              }
              // Hạn thanh toán
              else if (
                cleanKey.includes("hanthanhtoan") ||
                cleanKey.includes("hanno") ||
                cleanKey.includes("ngayhethan") ||
                cleanKey.includes("duedate") ||
                cleanKey.includes("hantt") ||
                cleanKey.includes("thoihan") ||
                cleanKey === "han"
              ) {
                rawDueDateVal = colVal;
              }
              // Tổng tiền
              else if (
                cleanKey.includes("tongtien") ||
                cleanKey.includes("thanhtien") ||
                cleanKey.includes("tientong") ||
                cleanKey.includes("sotien") ||
                cleanKey.includes("totalamount") ||
                cleanKey.includes("amount") ||
                cleanKey === "tien"
              ) {
                const numStr = String(colVal).replace(/[^\d]/g, "");
                rawTotalAmount = parseInt(numStr, 10) || 0;
              }
              // Ghi chú
              else if (
                cleanKey.includes("ghichu") ||
                cleanKey.includes("notes") ||
                cleanKey.includes("note") ||
                cleanKey.includes("comment")
              ) {
                rawNotes = strVal;
              }
            }

            // Tính toán tổng tiền = Chưa thuế + Thuế nếu có
            if (rawPreTaxAmount > 0 || rawTaxAmount > 0) {
              if (rawTotalAmount === 0 || rawTotalAmount !== (rawPreTaxAmount + rawTaxAmount)) {
                rawTotalAmount = rawPreTaxAmount + rawTaxAmount;
              }
            } else if (rawTotalAmount > 0 && rawPreTaxAmount === 0 && rawTaxAmount === 0) {
              rawPreTaxAmount = rawTotalAmount;
              rawTaxAmount = 0;
            }

            // Khớp nối đối tác
            let matchedPartner = null;
            let partnerName = rawPartnerInput;
            let partnerId = "";
            let isNewPartner = false;

            if (rawPartnerInput) {
              const cleanInput = removeVietnameseTones(rawPartnerInput);
              const cleanRaw = rawPartnerInput.trim().toLowerCase();

              // 1. Khớp theo mã đối tác
              matchedPartner = existingPartners.find(p => p.code && p.code.trim().toLowerCase() === cleanRaw);

              // 2. Khớp theo mã số thuế
              if (!matchedPartner) {
                const rawTax = rawPartnerInput.replace(/[^\d]/g, "");
                if (rawTax.length >= 8) {
                  matchedPartner = existingPartners.find(p => p.taxCode && p.taxCode.replace(/[^\d]/g, "") === rawTax);
                }
              }

              // 3. Khớp theo tên đối tác
              if (!matchedPartner) {
                matchedPartner = existingPartners.find(p => removeVietnameseTones(p.name) === cleanInput);
              }

              // 4. Khớp tương đối tên
              if (!matchedPartner) {
                matchedPartner = existingPartners.find(p => {
                  const pClean = removeVietnameseTones(p.name);
                  return pClean.includes(cleanInput) || cleanInput.includes(pClean);
                });
              }

              if (matchedPartner) {
                partnerId = matchedPartner.id;
                partnerName = matchedPartner.name;
                // Nếu chưa có phân loại hóa đơn, tự động nhận theo phân loại đối tác
                if (!rawType) {
                  rawType = matchedPartner.type === "VENDOR" ? "PAYABLE" : "RECEIVABLE";
                }
              } else {
                isNewPartner = true;
                if (!seenNewPartnerNames.has(cleanInput)) {
                  seenNewPartnerNames.add(cleanInput);
                  newPartnerCount++;
                }
                if (!rawType) {
                  rawType = "RECEIVABLE";
                }
              }
            } else {
              if (!rawType) rawType = "RECEIVABLE";
            }

            // Xử lý ngày tháng
            const issueDate = parseDateString(rawIssueDateVal, new Date());
            let dueDate = "";
            if (rawDueDateVal) {
              dueDate = parseDateString(rawDueDateVal, new Date(issueDate));
            } else {
              // Tự tính hạn nợ dựa theo hạn nợ đối tác hoặc mặc định 30 ngày
              const termDays = matchedPartner ? (matchedPartner.creditTermDays || 30) : 30;
              const issueD = new Date(issueDate);
              const dueD = new Date(issueD.getTime() + termDays * 24 * 60 * 60 * 1000);
              dueDate = toInputDateFormat(dueD);
            }

            // Tự sinh số hóa đơn nếu trống
            if (!rawInvoiceNumber && rawPartnerInput && rawTotalAmount > 0) {
              rawInvoiceNumber = `HD-${Date.now().toString(36).toUpperCase()}-${idx + 1}`;
            }

            // Kiểm tra tính hợp lệ cơ bản
            const hasInvoiceNumber = rawInvoiceNumber.trim().length > 0;
            const hasPartner = rawPartnerInput.trim().length > 0;
            const hasAmount = rawTotalAmount > 0;

            // Quy tắc Validate Kế toán: Tiền mặt từ 5.000.000 VNĐ trở lên là không hợp lệ
            const isCashOverLimit = rawPaymentMethod === "CASH" && (rawPaidAmount >= 5000000 || rawTotalAmount >= 5000000);

            const isValid = hasInvoiceNumber && hasPartner && hasAmount && !isCashOverLimit;

            let error = "";
            if (!hasInvoiceNumber) error = "Thiếu số hóa đơn";
            else if (!hasPartner) error = "Thiếu tên/mã đối tác";
            else if (!hasAmount) error = "Tổng tiền phải lớn hơn 0";
            else if (isCashOverLimit) error = "Hình thức Tiền mặt từ 5.000.000 VNĐ trở lên không hợp lệ (Bắt buộc Chuyển khoản qua Ngân hàng).";

            // Kiểm tra trùng lặp số hóa đơn
            let isDuplicate = false;
            let duplicateReason = "";
            let matchedExistingInvoice = null;

            if (isValid) {
              const cleanInvNum = rawInvoiceNumber.trim().toLowerCase();

              // 1. Trùng với hóa đơn đã có trên hệ thống
              matchedExistingInvoice = existingInvoices.find(inv =>
                inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === cleanInvNum
              );

              if (matchedExistingInvoice) {
                isDuplicate = true;
                duplicateReason = `Trùng số hóa đơn "${rawInvoiceNumber}" đã có trên hệ thống (${matchedExistingInvoice.partnerName} - ${formatCurrency(matchedExistingInvoice.totalAmount)})`;
              }

              // 2. Trùng với dòng trước trong chính file Excel này
              if (!isDuplicate && seenInFileInvoiceNumbers.has(cleanInvNum)) {
                isDuplicate = true;
                duplicateReason = `Trùng số hóa đơn "${rawInvoiceNumber}" với dòng trước trong file Excel`;
              }

              if (cleanInvNum) {
                seenInFileInvoiceNumbers.add(cleanInvNum);
              }

              validCount++;
              if (isDuplicate) dupCount++; else newCount++;
            } else {
              invalidCount++;
            }

            invoices.push({
              rowIndex: idx + 2,
              invoiceNumber: rawInvoiceNumber,
              partnerInput: rawPartnerInput,
              partnerName: partnerName || rawPartnerInput,
              partnerId: partnerId,
              isNewPartner,
              matchedPartner,
              type: rawType || "RECEIVABLE",
              itemName: rawItemName || "Hàng hóa / Dịch vụ",
              issueDate,
              dueDate,
              preTaxAmount: rawPreTaxAmount,
              taxAmount: rawTaxAmount,
              totalAmount: rawTotalAmount,
              paidAmount: Math.min(rawPaidAmount, rawTotalAmount),
              paymentMethod: rawPaymentMethod,
              notes: rawNotes,
              isValid,
              isDuplicate,
              duplicateReason,
              matchedExistingInvoice,
              error
            });
          });

          resolve({
            invoices,
            summary: {
              total: rawRows.length,
              valid: validCount,
              newCount,
              dupCount,
              invalid: invalidCount,
              newPartnerCount
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

  /**
   * Xuất Bảng tổng hợp công nợ phải thu 12 tháng ra Excel theo chuẩn kế toán
   * @param {Object} matrixData Dữ liệu từ calculateMonthlyReceivablesMatrix
   * @param {number} year 
   */
  static exportMonthlyReceivablesMatrixToExcel(matrixData, year = new Date().getFullYear()) {
    if (!window.XLSX) {
      alert("Thư viện SheetJS chưa được tải!");
      return;
    }

    const { partnerMatrix = [], grandTotals = {} } = matrixData;

    const rows = partnerMatrix.map((item, idx) => {
      const row = {
        "STT": idx + 1,
        "Mã Đối Tác": item.code || item.id,
        "Tên Khách Hàng": item.name,
      };

      // 12 Tháng
      for (let m = 1; m <= 12; m++) {
        row[`Tháng ${m}.${year}`] = item.months[m - 1] || 0;
      }

      row["TỔNG NỢ (VNĐ)"] = item.totalDebt || 0;
      row["Đã Thanh Toán (VNĐ)"] = item.paidAmount || 0;
      row["Còn Nợ (VNĐ)"] = item.remainingDebt || 0;
      row["Tỷ Lệ Thu Hồi (%)"] = `${item.collectionRate || 0}%`;

      return row;
    });

    // Dòng Tổng Cộng
    const totalRow = {
      "STT": "TỔNG CỘNG",
      "Mã Đối Tác": "",
      "Tên Khách Hàng": "TỔNG NỢ TOÀN DOANH NGHIỆP",
    };
    for (let m = 1; m <= 12; m++) {
      totalRow[`Tháng ${m}.${year}`] = (grandTotals.months && grandTotals.months[m - 1]) || 0;
    }
    totalRow["TỔNG NỢ (VNĐ)"] = grandTotals.totalIncurred || 0;
    totalRow["Đã Thanh Toán (VNĐ)"] = grandTotals.totalPaid || 0;
    totalRow["Còn Nợ (VNĐ)"] = grandTotals.totalRemaining || 0;
    totalRow["Tỷ Lệ Thu Hồi (%)"] = `${grandTotals.overallCollectionRate || 0}%`;

    rows.push(totalRow);

    const worksheet = window.XLSX.utils.json_to_sheet(rows);

    // Cài đặt độ rộng cột
    worksheet["!cols"] = [
      { wch: 12 }, // STT
      { wch: 16 }, // Mã
      { wch: 38 }, // Tên KH
      ...Array(12).fill({ wch: 16 }), // 12 Tháng
      { wch: 20 }, // Tổng Nợ
      { wch: 20 }, // Đã Thu
      { wch: 20 }, // Còn Nợ
      { wch: 16 }  // Tỷ lệ
    ];

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, `Tong_Hop_Cong_No_${year}`);
    window.XLSX.writeFile(workbook, `Bang_Tong_Hop_Cong_No_Phai_Thu_${year}_${toInputDateFormat(new Date())}.xlsx`);
  }
}


