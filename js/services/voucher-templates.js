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
            <span class="badge badge-paid">Bản Xem Trước In A4</span>
            <span style="font-size: 0.775rem; color: var(--text-muted);">Khổ giấy: A4/A5 chuẩn kế toán</span>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-print-voucher-action">
            <i data-lucide="printer"></i>
            <span>In Chứng Từ / Lưu PDF</span>
          </button>
        </div>

        <div class="voucher-print-area" id="voucher-printable-content">
          ${htmlContent}
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
      size: "lg",
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
                  body { font-family: 'Times New Roman', Times, serif; font-size: 12.5pt; line-height: 1.4; color: #000; background: #fff; padding: 10px; }
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
        background: #fff;
        color: #000;
        padding: 20px;
        font-family: 'Times New Roman', Times, serif;
        font-size: 12.5pt;
        line-height: 1.45;
      }
      .voucher-header-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        margin-bottom: 14px;
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
      .form-meta-block b {
        font-size: 10pt;
        display: block;
      }
      .form-meta-block span {
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
      }
      .voucher-sub-title {
        font-size: 10.5pt;
        font-style: italic;
      }
      .voucher-info-table {
        width: 100%;
        margin-bottom: 14px;
      }
      .voucher-info-table td {
        padding: 4px 0;
        vertical-align: top;
      }
      .signature-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        text-align: center;
        margin-top: 20px;
        page-break-inside: avoid;
      }
      .sig-block b {
        display: block;
        font-size: 10.5pt;
        text-transform: uppercase;
        margin-bottom: 3px;
      }
      .sig-block span {
        display: block;
        font-size: 9pt;
        font-style: italic;
        color: #555;
      }
      .sig-space {
        height: 65px;
      }
      .sig-name {
        font-weight: bold;
        font-size: 10.5pt;
      }
      .bank-table-grid {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0;
      }
      .bank-table-grid td, .bank-table-grid th {
        border: 1px solid #000;
        padding: 6px 8px;
        font-size: 10.5pt;
      }
      .bank-table-grid th {
        background: #f0f0f0;
        text-align: left;
      }
      .table-bordered {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0;
      }
      .table-bordered th, .table-bordered td {
        border: 1px solid #333;
        padding: 5px 7px;
        font-size: 10pt;
      }
      .table-bordered th {
        background: #f5f5f5;
        font-weight: bold;
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
            <h4>${escapeHtml(settings.companyName || "DOANH NGHIỆP")}</h4>
            <p>Địa chỉ: ${escapeHtml(settings.companyAddress || "...")}</p>
            <p>MST: ${escapeHtml(settings.companyTaxCode || "...")} | SĐT: ${escapeHtml(settings.companyPhone || "...")}</p>
          </div>
          <div class="form-meta-block">
            <b>Mẫu số 01 - TT</b>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
            <div style="margin-top: 6px; font-size: 10.5pt;">
              <div>Số: <b>${escapeHtml(payment.paymentNumber)}</b></div>
              <div>Nợ: 1111</div>
              <div>Có: 131</div>
            </div>
          </div>
        </div>

        <div class="voucher-title-wrap">
          <div class="voucher-main-title">PHIẾU THU</div>
          <div class="voucher-sub-title">Ngày ${day} tháng ${month} năm ${year}</div>
        </div>

        <table class="voucher-info-table">
          <tr>
            <td style="width: 220px;">Họ và tên người nộp tiền:</td>
            <td><b>${escapeHtml(payment.partnerName || partner.name || "...")}</b></td>
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
            <td>Số tiền:</td>
            <td>
              <b style="font-size: 13.5pt; color: #166534;">${formatCurrency(payment.amount)}</b>
            </td>
          </tr>
          <tr>
            <td>Bằng chữ:</td>
            <td><i style="font-weight: 600;">${amountWords}</i></td>
          </tr>
          <tr>
            <td>Kèm theo:</td>
            <td>${(payment.allocations && payment.allocations.length) ? payment.allocations.map(a => `HĐ ${a.invoiceNumber}`).join(', ') : 'Chứng từ gốc'}</td>
          </tr>
        </table>

        <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-top: 8px;">
          Ngày ${day} tháng ${month} năm ${year}
        </div>

        <div class="signature-row" style="grid-template-columns: repeat(5, 1fr);">
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

        <div style="margin-top: 20px; font-size: 10pt; font-style: italic; border-top: 1px dashed #999; padding-top: 6px;">
          + Đã nhận đủ số tiền (viết bằng chữ): ${amountWords}.
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
            <h4>${escapeHtml(settings.companyName || "DOANH NGHIỆP")}</h4>
            <p>Địa chỉ: ${escapeHtml(settings.companyAddress || "...")}</p>
            <p>MST: ${escapeHtml(settings.companyTaxCode || "...")} | SĐT: ${escapeHtml(settings.companyPhone || "...")}</p>
          </div>
          <div class="form-meta-block">
            <b>Mẫu số 02 - TT</b>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
            <div style="margin-top: 6px; font-size: 10.5pt;">
              <div>Số: <b>${escapeHtml(payment.paymentNumber)}</b></div>
              <div>Nợ: 331</div>
              <div>Có: 1111</div>
            </div>
          </div>
        </div>

        <div class="voucher-title-wrap">
          <div class="voucher-main-title">PHIẾU CHI</div>
          <div class="voucher-sub-title">Ngày ${day} tháng ${month} năm ${year}</div>
        </div>

        <table class="voucher-info-table">
          <tr>
            <td style="width: 220px;">Họ và tên người nhận tiền:</td>
            <td><b>${escapeHtml(payment.partnerName || partner.name || "...")}</b></td>
          </tr>
          <tr>
            <td>Địa chỉ:</td>
            <td>${escapeHtml(partner.address || "...")}</td>
          </tr>
          <tr>
            <td>Lý do chi:</td>
            <td>${escapeHtml(payment.notes || `Thanh toán tiền hàng / dịch vụ cho Nhà cung cấp`)}</td>
          </tr>
          <tr>
            <td>Số tiền:</td>
            <td>
              <b style="font-size: 13.5pt; color: #b45309;">${formatCurrency(payment.amount)}</b>
            </td>
          </tr>
          <tr>
            <td>Bằng chữ:</td>
            <td><i style="font-weight: 600;">${amountWords}</i></td>
          </tr>
          <tr>
            <td>Kèm theo:</td>
            <td>${(payment.allocations && payment.allocations.length) ? payment.allocations.map(a => `HĐ ${a.invoiceNumber}`).join(', ') : 'Chứng từ gốc'}</td>
          </tr>
        </table>

        <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-top: 8px;">
          Ngày ${day} tháng ${month} năm ${year}
        </div>

        <div class="signature-row" style="grid-template-columns: repeat(5, 1fr);">
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

        <div style="margin-top: 20px; font-size: 10pt; font-style: italic; border-top: 1px dashed #999; padding-top: 6px;">
          + Đã nhận đủ số tiền (viết bằng chữ): ${amountWords}.
        </div>
      </div>
    `;
  }

  /**
   * 3. Biểu mẫu Ủy Nhiệm Chi Ngân Hàng (UNC - Payment Order)
   */
  static renderPaymentBankUNC_HTML(payment, settings = {}, partner = {}) {
    const d = new Date(payment.paymentDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(payment.amount);

    return `
      <div class="voucher-sheet" style="border: 2px solid #0f172a; padding: 20px; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <h2 style="font-size: 17pt; font-weight: bold; color: #1e3a8a; letter-spacing: 0.5px;">ỦY NHIỆM CHI</h2>
            <div style="font-size: 10pt; font-style: italic; color: #475569;">PAYMENT ORDER</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11pt;">Số / No: <b>${escapeHtml(payment.paymentNumber)}</b></div>
            <div style="font-size: 10pt; font-style: italic;">Ngày / Date: ${day}/${month}/${year}</div>
          </div>
        </div>

        <!-- Bảng thông tin thanh toán chuyển khoản -->
        <table class="bank-table-grid">
          <tr>
            <th style="width: 50%; text-transform: uppercase;">ĐƠN VỊ TRẢ TIỀN / APPLICANT</th>
            <th style="width: 50%; text-transform: uppercase;">ĐƠN VỊ THỤ HƯỞNG / BENEFICIARY</th>
          </tr>
          <tr>
            <td>
              <div style="font-size: 9.5pt; color: #555;">Tên đơn vị / Company name:</div>
              <div style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(settings.companyName || "DOANH NGHIỆP TRẢ TIỀN")}</div>
              
              <div style="font-size: 9.5pt; color: #555;">Số tài khoản / Account No:</div>
              <div style="font-weight: bold; font-family: monospace; font-size: 11.5pt; margin-bottom: 5px; color: #1e40af;">
                ${escapeHtml(settings.companyBankAccount || "........................")}
              </div>

              <div style="font-size: 9.5pt; color: #555;">Tại Ngân hàng / At Bank:</div>
              <div style="font-weight: 600;">${escapeHtml(settings.companyBankName || "........................")}</div>
            </td>
            <td>
              <div style="font-size: 9.5pt; color: #555;">Tên đơn vị / Beneficiary name:</div>
              <div style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(partner.name || payment.partnerName || "...")}</div>
              
              <div style="font-size: 9.5pt; color: #555;">Số tài khoản / Account No:</div>
              <div style="font-weight: bold; font-family: monospace; font-size: 11.5pt; margin-bottom: 5px; color: #1e40af;">
                ${escapeHtml(payment.bankAccount || partner.bankAccount || "........................")}
              </div>

              <div style="font-size: 9.5pt; color: #555;">Tại Ngân hàng / At Bank:</div>
              <div style="font-weight: 600;">${escapeHtml(payment.bankName || partner.bankName || "........................")}</div>
            </td>
          </tr>
        </table>

        <!-- Số tiền & Nội dung -->
        <table class="bank-table-grid">
          <tr>
            <td style="width: 25%; font-weight: bold;">Số tiền bằng số / In figures:</td>
            <td style="font-size: 13.5pt; font-weight: bold; color: #1e3a8a;">
              ${formatCurrency(payment.amount)}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Số tiền bằng chữ / In words:</td>
            <td><i style="font-weight: 600; font-size: 10.5pt;">${amountWords}</i></td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Nội dung thanh toán / Details of payment:</td>
            <td>${escapeHtml(payment.notes || `Thanh toán tiền công nợ theo hợp đồng / hóa đơn`)}</td>
          </tr>
        </table>

        <!-- Chữ ký 2 bên & Ngân hàng -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #000; margin-top: 14px; text-align: center;">
          <div style="padding: 8px; border-right: 1px solid #000;">
            <b style="font-size: 9.5pt; text-transform: uppercase;">KẾ TOÁN TRƯỞNG</b>
            <div style="font-size: 8pt; font-style: italic; color: #555;">Chief Accountant</div>
            <div style="height: 60px;"></div>
          </div>
          <div style="padding: 8px; border-right: 1px solid #000;">
            <b style="font-size: 9.5pt; text-transform: uppercase;">CHỦ TÀI KHOẢN / GIÁM ĐỐC</b>
            <div style="font-size: 8pt; font-style: italic; color: #555;">Account Holder (Sign & Stamp)</div>
            <div style="height: 60px;"></div>
          </div>
          <div style="padding: 8px; background: #fafafa;">
            <b style="font-size: 9.5pt; text-transform: uppercase; color: #475569;">DÀNH CHO NGÂN HÀNG</b>
            <div style="font-size: 8pt; font-style: italic; color: #555;">Bank's Verification</div>
            <div style="height: 60px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 4. Biểu mẫu Ủy Nhiệm Thu / Báo Có Ngân Hàng (UNT / Credit Advice)
   */
  static renderReceiptBankUNT_HTML(payment, settings = {}, partner = {}) {
    const d = new Date(payment.paymentDate || new Date());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const amountWords = numberToWordsVN(payment.amount);

    return `
      <div class="voucher-sheet" style="border: 2px solid #0f172a; padding: 20px; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <h2 style="font-size: 17pt; font-weight: bold; color: #15803d; letter-spacing: 0.5px;">GIẤY BÁO CÓ / ỦY NHIỆM THU</h2>
            <div style="font-size: 10pt; font-style: italic; color: #475569;">CREDIT ADVICE / COLLECTION ORDER</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11pt;">Số chứng từ: <b>${escapeHtml(payment.paymentNumber)}</b></div>
            <div style="font-size: 10pt; font-style: italic;">Ngày giao dịch: ${day}/${month}/${year}</div>
          </div>
        </div>

        <table class="bank-table-grid">
          <tr>
            <th style="width: 50%; text-transform: uppercase;">ĐƠN VỊ CHUYỂN TIỀN (KHÁCH HÀNG)</th>
            <th style="width: 50%; text-transform: uppercase;">ĐƠN VỊ THỤ HƯỞNG (DOANH NGHIỆP)</th>
          </tr>
          <tr>
            <td>
              <div style="font-size: 9.5pt; color: #555;">Tên khách hàng:</div>
              <div style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(partner.name || payment.partnerName || "...")}</div>
              
              <div style="font-size: 9.5pt; color: #555;">Mã số thuế:</div>
              <div style="margin-bottom: 5px;">${escapeHtml(partner.taxCode || "...")}</div>

              <div style="font-size: 9.5pt; color: #555;">Tài khoản ngân hàng gửi (nếu có):</div>
              <div style="font-family: monospace;">${escapeHtml(payment.bankAccount || partner.bankAccount || "...")}</div>
            </td>
            <td>
              <div style="font-size: 9.5pt; color: #555;">Tên tài khoản thụ hưởng:</div>
              <div style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(settings.companyName || "DOANH NGHIỆP")}</div>
              
              <div style="font-size: 9.5pt; color: #555;">Số tài khoản thụ hưởng:</div>
              <div style="font-weight: bold; font-family: monospace; font-size: 11.5pt; margin-bottom: 5px; color: #15803d;">
                ${escapeHtml(settings.companyBankAccount || "........................")}
              </div>

              <div style="font-size: 9.5pt; color: #555;">Tại Ngân hàng:</div>
              <div style="font-weight: 600;">${escapeHtml(settings.companyBankName || "........................")}</div>
            </td>
          </tr>
        </table>

        <table class="bank-table-grid">
          <tr>
            <td style="width: 25%; font-weight: bold;">Số tiền ghi có (VNĐ):</td>
            <td style="font-size: 13.5pt; font-weight: bold; color: #15803d;">
              ${formatCurrency(payment.amount)}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Số tiền bằng chữ:</td>
            <td><i style="font-weight: 600; font-size: 10.5pt;">${amountWords}</i></td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Nội dung giao dịch:</td>
            <td>${escapeHtml(payment.notes || `Khách hàng thanh toán tiền nợ hóa đơn qua tài khoản ngân hàng`)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Hóa đơn đã cấn trừ:</td>
            <td>${(payment.allocations && payment.allocations.length) ? payment.allocations.map(a => `<b>${a.invoiceNumber}</b> (${formatCurrency(a.amount)})`).join('; ') : 'Tự động cấn trừ FIFO'}</td>
          </tr>
        </table>

        <div style="display: grid; grid-template-columns: 1fr 1fr; margin-top: 20px; text-align: center;">
          <div>
            <b>NGƯỜI GHI SỔ / KẾ TOÁN</b>
            <div style="font-size: 9pt; font-style: italic; color: #555;">(Ký, họ tên)</div>
            <div style="height: 60px;"></div>
          </div>
          <div>
            <b>KẾ TOÁN TRƯỞNG / DUYỆT</b>
            <div style="font-size: 9pt; font-style: italic; color: #555;">(Ký, họ tên)</div>
            <div style="height: 60px;"></div>
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

    return `
      <div class="voucher-sheet">
        <div class="voucher-header-grid">
          <div class="company-block">
            <h4>${escapeHtml(settings.companyName || "DOANH NGHIỆP")}</h4>
            <p>Địa chỉ: ${escapeHtml(settings.companyAddress || "...")}</p>
            <p>MST: ${escapeHtml(settings.companyTaxCode || "...")} | SĐT: ${escapeHtml(settings.companyPhone || "...")}</p>
          </div>
          <div class="form-meta-block">
            <b>MẪU GIẤY ĐỀ NGHỊ THANH TOÁN</b>
            <span>Số: <b>${escapeHtml(request.requestNumber)}</b></span>
            <span>Trạng thái: <b>${escapeHtml(request.status === 'PAID' ? 'ĐÃ CHI TIỀN' : request.status === 'APPROVED' ? 'ĐÃ DUYỆT' : 'CHỜ DUYỆT')}</b></span>
          </div>
        </div>

        <div class="voucher-title-wrap">
          <div class="voucher-main-title">GIẤY ĐỀ NGHỊ THANH TOÁN</div>
          <div class="voucher-sub-title">Ngày ${day} tháng ${month} năm ${year}</div>
        </div>

        <div style="margin-bottom: 12px; font-size: 11pt;">
          <div><b>Kính gửi:</b> - Ban Giám Đốc</div>
          <div style="padding-left: 58px;">- Phòng Kế Toán - Tài Chính</div>
        </div>

        <table class="voucher-info-table">
          <tr>
            <td style="width: 220px;">Họ tên người đề nghị:</td>
            <td><b>${escapeHtml(request.requesterName || "Kế toán công nợ")}</b> ${request.department ? ` - Bộ phận: <b>${escapeHtml(request.department)}</b>` : ''}</td>
          </tr>
          <tr>
            <td>Đơn vị nhận thanh toán:</td>
            <td><b>${escapeHtml(partner.name || request.partnerName || "...")}</b></td>
          </tr>
          <tr>
            <td>Nội dung thanh toán:</td>
            <td>${escapeHtml(request.reason || "Thanh toán công nợ theo hợp đồng / hóa đơn phát sinh")}</td>
          </tr>
          <tr>
            <td>Số tiền đề nghị:</td>
            <td>
              <b style="font-size: 13.5pt; color: #1e3a8a;">${formatCurrency(request.amount)}</b>
            </td>
          </tr>
          <tr>
            <td>Bằng chữ:</td>
            <td><i style="font-weight: 600;">${amountWords}</i></td>
          </tr>
          <tr>
            <td>Hình thức thanh toán:</td>
            <td>
              <b>${isBank ? 'Chuyển khoản qua Ngân hàng' : 'Tiền mặt'}</b>
            </td>
          </tr>
          ${isBank ? `
            <tr>
              <td>Thông tin tài khoản thụ hưởng:</td>
              <td>
                <div>- Tên chủ tài khoản: <b>${escapeHtml(request.bankAccountHolder || partner.bankAccountHolder || partner.name || "...")}</b></div>
                <div>- Số tài khoản: <b style="font-family: monospace; font-size: 11.5pt; color: #1e40af;">${escapeHtml(request.bankAccount || partner.bankAccount || "...")}</b></div>
                <div>- Tại Ngân hàng: <b>${escapeHtml(request.bankName || partner.bankName || "...")}</b> ${request.bankBranch ? `(Chi nhánh: ${escapeHtml(request.bankBranch)})` : ''}</div>
              </td>
            </tr>
          ` : ''}
          <tr>
            <td>Hạn thanh toán yêu cầu:</td>
            <td><b>${formatDate(request.deadlineDate || request.requestDate)}</b></td>
          </tr>
        </table>

        ${invoiceList.length > 0 ? `
          <div style="margin-top: 10px; margin-bottom: 6px; font-weight: bold; font-size: 10.5pt;">Bảng kê danh sách hóa đơn / chứng từ kèm theo:</div>
          <table class="table-bordered">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;">STT</th>
                <th>Số Hóa Đơn</th>
                <th>Nội Dung Hàng Hóa / Dịch Vụ</th>
                <th>Ngày Hóa Đơn</th>
                <th class="text-right">Tổng Tiền (VNĐ)</th>
                <th class="text-right">Còn Nợ (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceList.map((inv, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td class="font-mono" style="font-weight: bold;">${escapeHtml(inv.invoiceNumber)}</td>
                  <td>${escapeHtml(inv.itemName || inv.title || '-')}</td>
                  <td>${formatDate(inv.issueDate)}</td>
                  <td class="text-right font-mono">${formatCurrency(inv.totalAmount)}</td>
                  <td class="text-right font-mono" style="font-weight: bold; color: #b45309;">${formatCurrency(Math.max(0, inv.totalAmount - inv.paidAmount))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-top: 12px;">
          Ngày ${day} tháng ${month} năm ${year}
        </div>

        <div class="signature-row" style="grid-template-columns: repeat(4, 1fr);">
          <div class="sig-block">
            <b>Người đề nghị</b>
            <span>(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <div class="sig-name">${escapeHtml(request.requesterName || "")}</div>
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
