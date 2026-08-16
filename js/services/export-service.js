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
}
