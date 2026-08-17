/**
 * MODAL COMPONENT - QUẢN LÝ CÔNG NỢ
 * Quản lý mở/đóng modal, render tiêu đề, body và các action buttons.
 */

import { qs, refreshLucideIcons } from '../utils/dom.js';
import { initCurrencyInputs } from '../utils/formatters.js';

export class Modal {
  static open({ title, bodyHtml, footerHtml, size = "md", onOpen }) {
    const backdrop = qs("#app-modal");
    const dialogEl = qs(".modal-dialog", backdrop);
    const titleEl = qs("#modal-title");
    const bodyEl = qs("#modal-body");
    const footerEl = qs("#modal-footer");

    if (!backdrop) return;

    if (dialogEl) {
      dialogEl.className = "modal-dialog" + (size ? ` modal-${size}` : " modal-md");
    }

    titleEl.innerHTML = title || "";
    bodyEl.innerHTML = bodyHtml || "";
    footerEl.innerHTML = footerHtml || `
      <button class="btn btn-secondary" id="btn-modal-cancel">Đóng</button>
    `;

    backdrop.classList.add("open");
    refreshLucideIcons();
    initCurrencyInputs(bodyEl);

    // Event listeners
    const closeBtn = qs("#modal-btn-close");
    const cancelBtn = qs("#btn-modal-cancel");

    if (closeBtn) closeBtn.onclick = () => this.close();
    if (cancelBtn) cancelBtn.onclick = () => this.close();

    // Close on backdrop click (click outside dialog)
    backdrop.onclick = (e) => {
      if (e.target === backdrop) this.close();
    };

    if (typeof onOpen === "function") {
      onOpen(bodyEl, footerEl);
    }
  }

  static close() {
    const backdrop = qs("#app-modal");
    if (backdrop) {
      backdrop.classList.remove("open");
    }
  }
}
