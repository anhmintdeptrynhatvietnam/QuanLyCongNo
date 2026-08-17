/**
 * VOUCHER TEMPLATES SERVICE - QUẢN LÝ CÔNG NỢ
 * Biểu mẫu in chuyên nghiệp chuẩn Bộ Tài Chính (TT 200/133) & Ngân hàng Việt Nam:
 * - Phiếu Thu (Mẫu 01-TT)
 * - Phiếu Chi (Mẫu 02-TT)
 * - Ủy Nhiệm Chi Ngân Hàng (UNC)
 * - Ủy Nhiệm Thu / Giấy Báo Có (UNT)
 * - Giấy Đề Nghị Thanh Toán
 */

import { formatCurrency, formatDate, numberToWordsVN } from '../utils/formatters.js';
import { escapeHtml } from '../utils/dom.js';
import { Modal } from '../components/modal.js';

export class VoucherTemplates {
  /**
   * Mở modal xem trước và in chứng từ bất kỳ
   */
  static openPreviewModal({ title, htmlContent, printTitle = "Chung_Tu" }) {
    const bodyHtml = `
      <div class="voucher-preview-container">
        <div class="voucher-preview-actions no-print">
          <div class="flex items-center gap-2">
            <span class="badge badge-paid">
              <i data-lucide="file-check" style="width: 12px; height: 12px;"></i>
              Bản Xem Trước In A4
            </span>
            <span style="font-size: 0.775rem; color: var(--text-muted);">Khổ giấy: A4 chuẩn kế toán tài chính</span>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-print-voucher-action">
            <i data-lucide="printer"></i>
            <span>In Chứng Từ / Lưu PDF</span>
          </button>
        </div>

        <div class="voucher-print-area">
          <div id="voucher-printable-content" style="width: 100%; display: flex; justify-content: center;">
            ${htmlContent}
          </div>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-modal-cancel">Đóng</button>
      <button class="btn btn-primary" id="btn-print-voucher-bottom">
        <i data-lucide="printer"></i>
        <span>In Chứng Từ</span>
      </button>
    `;

    Modal.open({
      title: title || "Xem Trước Chứng Từ Kế Toán",
      size: "xl",
      bodyHtml,
      footerHtml,
      onOpen: (body, footer) => {
        const doPrint = () => {
          const printable = body.querySelector("#voucher-printable-content");
          if (!printable) {
            window.print();
            return;
          }
          
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>${escapeHtml(printTitle)}</title>
                <style>
                  @page { size: A4 portrait; margin: 12mm 15mm 12mm 15mm; }
                  * { box-sizing: border-box; margin: 0; padding: 0; }
                  body { 
                    font-family: 'Times New Roman', Times, serif; 
                    font-size: 12.5pt; 
                    line-height: 1.45; 
                    color: #000; 
                    background: #fff; 
                    padding: 10px; 
                  }
                  ${VoucherTemplates.getPrintStyles()}
                </style>
              </head>
              <body>
                ${printable.innerHTML}
                <script>
                  window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                  };
                </script>
              </body>
              </html>
            `);
            printWindow.document.close();
          } else {
            window.print();
          }
        };

        const btn1 = body.querySelector("#btn-print-voucher-action");
        const btn2 = footer.querySelector("#btn-print-voucher-bottom");
        if (btn1) btn1.onclick = doPrint;
        if (btn2) btn2.onclick = doPrint;
      }
    });
  }

  /**
   * CSS in ấn chuyên nghiệp cho biểu mẫu
   */
  static getPrintStyles() {
    return `
      .voucher-sheet {
        background: #fff !important;
        color: #000 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        width: 100% !important;
        max-width: 100% !important;
        font-family: 'Times New Roman', Times, serif;
        font-size: 12.5pt;
        line-height: 1.45;
      }
      .voucher-header-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid #000;
      }
      .company-block h4 {
        font-size: 11pt;
        font-weight: bold;
        text-transform: uppercase;
        margin-bottom: 2px;
      }
      .company-block p {
        font-size: 9.5pt;
        color: #333;
        margin: 1px 0;
      }
      .form-meta-block {
        text-align: right;
      }
      .form-meta-box {
        border: 1px dashed #333;
        padding: 4px 10px;
        display: inline-block;
        text-align: right;
      }
      .form-meta-box b {
        font-size: 9.5pt;
        display: block;
      }
      .form-meta-box span {
        font-size: 8.5pt;
        font-style: italic;
        display: block;
      }
      .voucher-title-wrap {
        text-align: center;
        margin: 14px 0 16px;
      }
      .voucher-main-title {
        font-size: 17pt;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 3px;
        color: #000 !important;
      }
      .voucher-sub-title {
        font-size: 10.5pt;
        font-style: italic;
        color: #444;
      }
      .voucher-recipient-box {
        margin-bottom: 14px;
        padding: 6px 10px;
        border-left: 3px solid #000;
        font-size: 11pt;
      }
      .voucher-info-table {
        width: 100%;
        margin-bottom: 14px;
        border-collapse: collapse;
      }
      .voucher-info-table tr {
        border-bottom: 1px dashed #ccc;
      }
      .voucher-info-table td {
        padding: 5px 2px;
        vertical-align: top;
        font-size: 11.5pt;
      }
      .voucher-info-table td:first-child {
        width: 210px;
        font-weight: 500;
      }
      .amount-highlight {
        font-size: 13.5pt;
        font-weight: bold;
        font-family: 'Courier New', Courier, monospace;
      }
      .voucher-bank-card {
        border: 1px solid #666;
        padding: 6px 10px;
        margin: 4px 0;
      }
      .table-bordered {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0 16px;
      }
      .table-bordered th, .table-bordered td {
        border: 1px solid #000;
        padding: 6px 8px;
        font-size: 10.5pt;
      }
      .table-bordered th {
        background: #f0f0f0;
        font-weight: bold;
        text-transform: uppercase;
        font-size: 9.5pt;
      }
      .bank-table-grid {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0;
        border: 1.5px solid #000;
      }
      .bank-table-grid td, .bank-table-grid th {
        border: 1px solid #000;
        padding: 6px 8px;
        font-size: 10.5pt;
      }
      .bank-table-grid th {
        background: #f0f0f0;
        text-align: left;
        text-transform: uppercase;
      }
      .signature-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        text-align: center;
        margin-top: 20px;
        page-break-inside: avoid;
      }
      .signature-row.grid-5 {
        grid-template-columns: repeat(5, 1fr);
      }
      .signature-row.grid-3 {
        grid-template-columns: repeat(3, 1fr);
      }
      .sig-block b {
        display: block;
        font-size: 10pt;
        text-transform: uppercase;
        margin-bottom: 2px;
      }
      .sig-block span {
        display: block;
        font-size: 8.5pt;
        font-style: italic;
        color: #555;
      }
      .sig-space {
        height: 65px;
      }
      .sig-name {
        font-weight: bold;
        font-size: 10pt;
      }
      .text-right { text-align: right !important; }
      .text-center { text-align: center !important; }
      .font-mono { font-family: 'Courier New', Courier, monospace; }
    `;
  }

  /**
   * 1. Biểu mẫu Phiếu Thu (Mẫu số 01 - TT)
   */
  static renderReceiptCashHTML(payment, settings = {}, partner = {}) {
    const d = new Date(payment.paymentDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(payment.amount);

    return `
      <div class="voucher-sheet">
        <div class="voucher-header-grid">
          <div class="company-block">
            <h4>${escapeHtml(settings.companyName || "CÔNG TY DOANH NGHIỆP")}</h4>
            <p>Địa chỉ: ${escapeHtml(settings.companyAddress || "...")}</p>
            <p>MST: ${escapeHtml(settings.companyTaxCode || "...")} | SĐT: ${escapeHtml(settings.companyPhone || "...")}</p>
          </div>
          <div class="form-meta-block">
            <div class="form-meta-box">
              <b>Mẫu số 01 - TT</b>
              <span>(Ban hành theo TT số 200/2014/TT-BTC)</span>
              <div style="margin-top: 4px; font-size: 9.5pt; text-align: right;">
                <div>Số: <b>${escapeHtml(payment.paymentNumber)}</b></div>
                <div>Nợ: <b>1111</b> | Có: <b>131</b></div>
              </div>
            </div>
          </div>
        </div>

        <div class="voucher-title-wrap">
          <div class="voucher-main-title title-receipt">PHIẾU THU</div>
          <div class="voucher-sub-title">Ngày ${day} tháng ${month} năm ${year}</div>
        </div>

        <table class="voucher-info-table">
          <tr>
            <td>Họ và tên người nộp tiền:</td>
            <td><b style="font-size: 12pt;">${escapeHtml(payment.partnerName || partner.name || "...")}</b></td>
          </tr>
          <tr>
            <td>Địa chỉ:</td>
            <td>${escapeHtml(partner.address || settings.companyAddress || "...")}</td>
          </tr>
          <tr>
            <td>Lý do nộp:</td>
            <td>${escapeHtml(payment.notes || `Thu tiền công nợ bán hàng`)}</td>
          </tr>
          <tr>
            <td>Số tiền thu:</td>
            <td>
              <span class="amount-highlight text-green">${formatCurrency(payment.amount)}</span>
            </td>
          </tr>
          <tr>
            <td>Bằng chữ:</td>
            <td><i style="font-weight: bold; color: #0f172a;">${amountWords}</i></td>
          </tr>
          <tr>
            <td>Chứng từ gốc kèm theo:</td>
            <td>${(payment.allocations && payment.allocations.length) ? payment.allocations.map(a => `Hóa đơn ${escapeHtml(a.invoiceNumber)}`).join(', ') : 'Chứng từ bán hàng'}</td>
          </tr>
        </table>

        <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-top: 10px;">
          Ngày ${day} tháng ${month} năm ${year}
        </div>

        <div class="signature-row grid-5">
          <div class="sig-block">
            <b>Giám đốc</b>
            <span>(Ký, họ tên, đóng dấu)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Kế toán trưởng</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Người nộp tiền</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name">${escapeHtml(payment.partnerName || "")}</div>
          </div>
          <div class="sig-block">
            <b>Người lập phiếu</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Thủ quỹ</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
        </div>

        <div style="margin-top: 24px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 10pt; font-style: italic; color: #475569;">
          Đã nhận đủ số tiền (viết bằng chữ): ${amountWords}
        </div>
      </div>
    `;
  }

  /**
   * 2. Biểu mẫu Phiếu Chi (Mẫu số 02 - TT)
   */
  static renderPaymentCashHTML(payment, settings = {}, partner = {}) {
    const d = new Date(payment.paymentDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(payment.amount);

    return `
      <div class="voucher-sheet">
        <div class="voucher-header-grid">
          <div class="company-block">
            <h4>${escapeHtml(settings.companyName || "CÔNG TY DOANH NGHIỆP")}</h4>
            <p>Địa chỉ: ${escapeHtml(settings.companyAddress || "...")}</p>
            <p>MST: ${escapeHtml(settings.companyTaxCode || "...")} | SĐT: ${escapeHtml(settings.companyPhone || "...")}</p>
          </div>
          <div class="form-meta-block">
            <div class="form-meta-box">
              <b>Mẫu số 02 - TT</b>
              <span>(Ban hành theo TT số 200/2014/TT-BTC)</span>
              <div style="margin-top: 4px; font-size: 9.5pt; text-align: right;">
                <div>Số: <b>${escapeHtml(payment.paymentNumber)}</b></div>
                <div>Nợ: <b>331</b> | Có: <b>1111</b></div>
              </div>
            </div>
          </div>
        </div>

        <div class="voucher-title-wrap">
          <div class="voucher-main-title title-payment">PHIẾU CHI</div>
          <div class="voucher-sub-title">Ngày ${day} tháng ${month} năm ${year}</div>
        </div>

        <table class="voucher-info-table">
          <tr>
            <td>Họ và tên người nhận tiền:</td>
            <td><b style="font-size: 12pt;">${escapeHtml(payment.partnerName || partner.name || "...")}</b></td>
          </tr>
          <tr>
            <td>Địa chỉ:</td>
            <td>${escapeHtml(partner.address || settings.companyAddress || "...")}</td>
          </tr>
          <tr>
            <td>Lý do chi:</td>
            <td>${escapeHtml(payment.notes || `Thanh toán công nợ mua hàng cho nhà cung cấp`)}</td>
          </tr>
          <tr>
            <td>Số tiền chi:</td>
            <td>
              <span class="amount-highlight text-amber">${formatCurrency(payment.amount)}</span>
            </td>
          </tr>
          <tr>
            <td>Bằng chữ:</td>
            <td><i style="font-weight: bold; color: #0f172a;">${amountWords}</i></td>
          </tr>
          <tr>
            <td>Chứng từ gốc kèm theo:</td>
            <td>${(payment.allocations && payment.allocations.length) ? payment.allocations.map(a => `Hóa đơn ${escapeHtml(a.invoiceNumber)}`).join(', ') : 'Chứng từ mua hàng'}</td>
          </tr>
        </table>

        <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-top: 10px;">
          Ngày ${day} tháng ${month} năm ${year}
        </div>

        <div class="signature-row grid-5">
          <div class="sig-block">
            <b>Giám đốc</b>
            <span>(Ký, họ tên, đóng dấu)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Kế toán trưởng</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Người nhận tiền</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name">${escapeHtml(payment.partnerName || "")}</div>
          </div>
          <div class="sig-block">
            <b>Người lập phiếu</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Thủ quỹ</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
        </div>

        <div style="margin-top: 24px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 10pt; font-style: italic; color: #475569;">
          Đã nhận đủ số tiền (viết bằng chữ): ${amountWords}
        </div>
      </div>
    `;
  }

  /**
   * 3. Biểu mẫu Ủy Nhiệm Chi Ngân Hàng (UNC / Payment Order)
   */
  static renderPaymentBankUNC_HTML(payment, settings = {}, partner = {}) {
    const d = new Date(payment.paymentDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(payment.amount);

    return `
      <div class="voucher-sheet">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px;">
          <div>
            <h2 style="font-size: 18pt; font-weight: 800; color: #1e3a8a; letter-spacing: 0.05em; text-transform: uppercase;">ỦY NHIỆM CHI</h2>
            <div style="font-size: 10pt; font-style: italic; color: #64748b; font-weight: 600;">PAYMENT ORDER</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11pt;">Số / Ref No: <b style="font-family: monospace; color: #1e40af;">${escapeHtml(payment.paymentNumber)}</b></div>
            <div style="font-size: 10pt; font-style: italic; color: #64748b;">Ngày / Date: ${day}/${month}/${year}</div>
          </div>
        </div>

        <!-- Bảng thông tin thanh toán chuyển khoản -->
        <table class="bank-table-grid">
          <tr>
            <th style="width: 50%;">ĐƠN VỊ TRẢ TIỀN / APPLICANT</th>
            <th style="width: 50%;">ĐƠN VỊ THỤ HƯỞNG / BENEFICIARY</th>
          </tr>
          <tr>
            <td>
              <div style="font-size: 9.5pt; color: #64748b;">Tên đơn vị / Company name:</div>
              <div style="font-weight: 700; margin-bottom: 8px; font-size: 11pt;">${escapeHtml(settings.companyName || "CÔNG TY DOANH NGHIỆP")}</div>
              
              <div style="font-size: 9.5pt; color: #64748b;">Số tài khoản / Account No:</div>
              <div style="font-weight: 800; font-family: monospace; font-size: 12pt; margin-bottom: 8px; color: #1e40af;">
                ${escapeHtml(settings.companyBankAccount || "........................")}
              </div>

              <div style="font-size: 9.5pt; color: #64748b;">Tại Ngân hàng / At Bank:</div>
              <div style="font-weight: 600; font-size: 10.5pt;">${escapeHtml(settings.companyBankName || "........................")}</div>
            </td>
            <td>
              <div style="font-size: 9.5pt; color: #64748b;">Tên đơn vị / Beneficiary name:</div>
              <div style="font-weight: 700; margin-bottom: 8px; font-size: 11pt;">${escapeHtml(partner.name || payment.partnerName || "...")}</div>
              
              <div style="font-size: 9.5pt; color: #64748b;">Số tài khoản / Account No:</div>
              <div style="font-weight: 800; font-family: monospace; font-size: 12pt; margin-bottom: 8px; color: #1e40af;">
                ${escapeHtml(payment.bankAccount || partner.bankAccount || "........................")}
              </div>

              <div style="font-size: 9.5pt; color: #64748b;">Tại Ngân hàng / At Bank:</div>
              <div style="font-weight: 600; font-size: 10.5pt;">${escapeHtml(payment.bankName || partner.bankName || "........................")}</div>
            </td>
          </tr>
        </table>

        <!-- Số tiền & Nội dung -->
        <table class="bank-table-grid">
          <tr>
            <td style="width: 28%; font-weight: 700;">Số tiền bằng số / In figures:</td>
            <td>
              <span class="amount-highlight text-blue">${formatCurrency(payment.amount)}</span>
            </td>
          </tr>
          <tr>
            <td style="font-weight: 700;">Số tiền bằng chữ / In words:</td>
            <td><i style="font-weight: 700; font-size: 11pt; color: #0f172a;">${amountWords}</i></td>
          </tr>
          <tr>
            <td style="font-weight: 700;">Nội dung thanh toán / Details:</td>
            <td>${escapeHtml(payment.notes || `Thanh toán tiền công nợ theo hợp đồng / hóa đơn`)}</td>
          </tr>
        </table>

        <!-- Chữ ký 2 bên & Ngân hàng -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1.5px solid #334155; margin-top: 18px; text-align: center; border-radius: 4px; overflow: hidden;">
          <div style="padding: 10px; border-right: 1px solid #334155;">
            <b style="font-size: 10pt; text-transform: uppercase; color: #0f172a;">KẾ TOÁN TRƯỞNG</b>
            <div style="font-size: 8.5pt; font-style: italic; color: #64748b;">Chief Accountant</div>
            <div style="height: 65px;"></div>
          </div>
          <div style="padding: 10px; border-right: 1px solid #334155;">
            <b style="font-size: 10pt; text-transform: uppercase; color: #0f172a;">CHỦ TÀI KHOẢN / GIÁM ĐỐC</b>
            <div style="font-size: 8.5pt; font-style: italic; color: #64748b;">Account Holder (Sign & Stamp)</div>
            <div style="height: 65px;"></div>
          </div>
          <div style="padding: 10px; background: #f8fafc;">
            <b style="font-size: 10pt; text-transform: uppercase; color: #475569;">DÀNH CHO NGÂN HÀNG</b>
            <div style="font-size: 8.5pt; font-style: italic; color: #64748b;">Bank's Verification</div>
            <div style="height: 65px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 4. Biểu mẫu Ủy Nhiệm Thu Ngân Hàng (UNT / Collection Order)
   */
  static renderReceiptBankUNT_HTML(payment, settings = {}, partner = {}) {
    const d = new Date(payment.paymentDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(payment.amount);

    return `
      <div class="voucher-sheet">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #15803d; padding-bottom: 10px; margin-bottom: 14px;">
          <div>
            <h2 style="font-size: 18pt; font-weight: 800; color: #15803d; letter-spacing: 0.05em; text-transform: uppercase;">ỦY NHIỆM THU</h2>
            <div style="font-size: 10pt; font-style: italic; color: #64748b; font-weight: 600;">COLLECTION ORDER / PAYMENT ORDER</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11pt;">Số chứng từ: <b style="font-family: monospace; color: #15803d;">${escapeHtml(payment.paymentNumber)}</b></div>
            <div style="font-size: 10pt; font-style: italic; color: #64748b;">Ngày ghi nhận: ${day}/${month}/${year}</div>
          </div>
        </div>

        <table class="bank-table-grid">
          <tr>
            <th style="width: 50%;">ĐƠN VỊ CHUYỂN TIỀN (KHÁCH HÀNG)</th>
            <th style="width: 50%;">ĐƠN VỊ THỤ HƯỞNG (DOANH NGHIỆP)</th>
          </tr>
          <tr>
            <td>
              <div style="font-size: 9.5pt; color: #64748b;">Tên khách hàng:</div>
              <div style="font-weight: 700; margin-bottom: 8px; font-size: 11pt;">${escapeHtml(partner.name || payment.partnerName || "...")}</div>
              
              <div style="font-size: 9.5pt; color: #64748b;">Mã số thuế:</div>
              <div style="margin-bottom: 8px;">${escapeHtml(partner.taxCode || "...")}</div>

              <div style="font-size: 9.5pt; color: #64748b;">Tài khoản gửi (nếu có):</div>
              <div style="font-family: monospace; font-weight: 600;">${escapeHtml(payment.bankAccount || partner.bankAccount || "...")}</div>
            </td>
            <td>
              <div style="font-size: 9.5pt; color: #64748b;">Tên tài khoản thụ hưởng:</div>
              <div style="font-weight: 700; margin-bottom: 8px; font-size: 11pt;">${escapeHtml(settings.companyName || "CÔNG TY DOANH NGHIỆP")}</div>
              
              <div style="font-size: 9.5pt; color: #64748b;">Số tài khoản thụ hưởng:</div>
              <div style="font-weight: 800; font-family: monospace; font-size: 12pt; margin-bottom: 8px; color: #15803d;">
                ${escapeHtml(settings.companyBankAccount || "........................")}
              </div>

              <div style="font-size: 9.5pt; color: #64748b;">Tại Ngân hàng:</div>
              <div style="font-weight: 600;">${escapeHtml(settings.companyBankName || "........................")}</div>
            </td>
          </tr>
        </table>

        <table class="bank-table-grid">
          <tr>
            <td style="width: 28%; font-weight: 700;">Số tiền ghi có (VNĐ):</td>
            <td>
              <span class="amount-highlight text-green">${formatCurrency(payment.amount)}</span>
            </td>
          </tr>
          <tr>
            <td style="font-weight: 700;">Số tiền bằng chữ:</td>
            <td><i style="font-weight: 700; font-size: 11pt; color: #0f172a;">${amountWords}</i></td>
          </tr>
          <tr>
            <td style="font-weight: 700;">Nội dung giao dịch:</td>
            <td>${escapeHtml(payment.notes || `Khách hàng chuyển tiền thanh toán công nợ`)}</td>
          </tr>
        </table>

        <div class="signature-row grid-3" style="margin-top: 24px;">
          <div class="sig-block">
            <b>Người lập biểu</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Kế toán trưởng</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Kiểm soát viên ngân hàng</b>
            <span>(Ký, đóng dấu)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 5. Biểu mẫu Giấy Đề Nghị Thanh Toán (Payment Request Form)
   */
  static renderPaymentRequestHTML(request, settings = {}, partner = {}, invoiceList = []) {
    const d = new Date(request.requestDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(request.amount);
    const isBank = request.paymentMethod === "BANK_TRANSFER";

    let statusText = 'CHỜ PHÊ DUYỆT';
    let statusBadgeColor = '#b45309';
    let statusBadgeBg = '#fef3c7';

    if (request.status === 'PAID') {
      statusText = 'ĐÃ CHI TIỀN';
      statusBadgeColor = '#15803d';
      statusBadgeBg = '#dcfce7';
    } else if (request.status === 'APPROVED') {
      statusText = 'ĐÃ DUYỆT CHI';
      statusBadgeColor = '#1e40af';
      statusBadgeBg = '#dbeafe';
    }

    return `
      <div class="voucher-sheet">
        <!-- Header 2 Cột -->
        <div class="voucher-header-grid">
          <div class="company-block">
            <h4>${escapeHtml(settings.companyName || "CÔNG TY CỔ PHẦN CÔNG NGHỆ DOANH NGHIỆP")}</h4>
            <p>Địa chỉ: ${escapeHtml(settings.companyAddress || "Tòa nhà trụ sở chính, Hà Nội")}</p>
            <p>MST: ${escapeHtml(settings.companyTaxCode || "0109999888")} | SĐT: ${escapeHtml(settings.companyPhone || "024.3999.8888")}</p>
          </div>
          <div class="form-meta-block">
            <div class="form-meta-box">
              <b>MẪU GIẤY ĐỀ NGHỊ THANH TOÁN</b>
              <span>Số: <b style="font-family: monospace; font-size: 10pt; color: #1e40af;">${escapeHtml(request.requestNumber)}</b></span>
              <div style="margin-top: 4px;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 8pt; color: ${statusBadgeColor}; background: ${statusBadgeBg}; font-style: normal;">
                  ${statusText}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tiêu Đề Chính -->
        <div class="voucher-title-wrap">
          <div class="voucher-main-title title-bank">GIẤY ĐỀ NGHỊ THANH TOÁN</div>
          <div class="voucher-sub-title">Ngày ${day} tháng ${month} năm ${year}</div>
        </div>

        <!-- Kính Gửi -->
        <div class="voucher-recipient-box">
          <div><b>Kính gửi:</b></div>
          <div style="padding-left: 20px;">• Ban Giám Đốc</div>
          <div style="padding-left: 20px;">• Phòng Kế Toán - Tài Chính</div>
        </div>

        <!-- Bảng Thông Tin Chi Tiết -->
        <table class="voucher-info-table">
          <tr>
            <td>Họ tên người đề nghị:</td>
            <td>
              <b style="font-size: 12pt;">${escapeHtml(request.requesterName || "Kế toán công nợ")}</b>
              ${request.department ? ` &nbsp;&nbsp;|&nbsp;&nbsp; Bộ phận: <b>${escapeHtml(request.department)}</b>` : ''}
            </td>
          </tr>
          <tr>
            <td>Đơn vị nhận thanh toán:</td>
            <td><b style="font-size: 12pt; color: #0f172a;">${escapeHtml(partner.name || request.partnerName || "...")}</b></td>
          </tr>
          <tr>
            <td>Nội dung / Lý do:</td>
            <td>${escapeHtml(request.reason || "Thanh toán công nợ theo hợp đồng / hóa đơn phát sinh")}</td>
          </tr>
          <tr>
            <td>Số tiền đề nghị chi:</td>
            <td>
              <span class="amount-highlight text-blue">${formatCurrency(request.amount)}</span>
            </td>
          </tr>
          <tr>
            <td>Số tiền bằng chữ:</td>
            <td><i style="font-weight: 700; color: #0f172a; font-size: 11.5pt;">${amountWords}</i></td>
          </tr>
          <tr>
            <td>Hình thức thanh toán:</td>
            <td>
              <b>${isBank ? '🏦 Chuyển khoản qua Ngân hàng' : '💵 Tiền mặt tại quỹ'}</b>
            </td>
          </tr>
          ${isBank ? `
            <tr>
              <td>Tài khoản thụ hưởng:</td>
              <td>
                <div class="voucher-bank-card">
                  <div>- Tên chủ tài khoản: <b>${escapeHtml(request.bankAccountHolder || partner.bankAccountHolder || partner.name || "...")}</b></div>
                  <div>- Số tài khoản: <b style="font-family: monospace; font-size: 12pt; color: #1e40af; background: #eff6ff; padding: 2px 8px; border-radius: 4px;">${escapeHtml(request.bankAccount || partner.bankAccount || "...")}</b></div>
                  <div>- Tại Ngân hàng: <b>${escapeHtml(request.bankName || partner.bankName || "...")}</b> ${request.bankBranch ? `(Chi nhánh: ${escapeHtml(request.bankBranch)})` : ''}</div>
                </div>
              </td>
            </tr>
          ` : ''}
          <tr>
            <td>Hạn thanh toán yêu cầu:</td>
            <td><b style="color: #b45309;">${formatDate(request.deadlineDate || request.requestDate)}</b></td>
          </tr>
        </table>

        <!-- Bảng Kê Hóa Đơn (Nếu có) -->
        ${invoiceList.length > 0 ? `
          <div style="margin-top: 14px; margin-bottom: 6px; font-weight: 700; font-size: 11pt; color: #0f172a;">
            Bảng kê danh sách hóa đơn / chứng từ kèm theo:
          </div>
          <table class="table-bordered">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;">STT</th>
                <th style="width: 130px;">Số Hóa Đơn</th>
                <th>Nội Dung Hàng Hóa / Dịch Vụ</th>
                <th style="width: 100px; text-align: center;">Ngày HĐ</th>
                <th class="text-right" style="width: 130px;">Tổng Tiền (VNĐ)</th>
                <th class="text-right" style="width: 130px;">Còn Nợ (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceList.map((inv, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td class="font-mono" style="font-weight: 700; color: #1e40af;">${escapeHtml(inv.invoiceNumber)}</td>
                  <td>${escapeHtml(inv.itemName || inv.title || 'Hàng hóa / dịch vụ')}</td>
                  <td class="text-center">${formatDate(inv.issueDate)}</td>
                  <td class="text-right font-mono">${formatCurrency(inv.totalAmount)}</td>
                  <td class="text-right font-mono" style="font-weight: 700; color: #b45309;">${formatCurrency(Math.max(0, inv.totalAmount - inv.paidAmount))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <!-- Chữ Ký 4 Ô -->
        <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-top: 16px; margin-bottom: 6px;">
          Ngày ${day} tháng ${month} năm ${year}
        </div>

        <div class="signature-row">
          <div class="sig-block">
            <b>Người đề nghị</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name">${escapeHtml(request.requesterName || "Kế toán")}</div>
          </div>
          <div class="sig-block">
            <b>Phụ trách bộ phận</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Kế toán trưởng</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <b>Giám đốc phê duyệt</b>
            <span>(Ký, họ tên, đóng dấu)</span>
            <div class="sig-space"></div>
            <div class="sig-name"></div>
          </div>
        </div>
      </div>
    `;
  }
}
