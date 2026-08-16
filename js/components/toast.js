/**
 * TOAST NOTIFICATION COMPONENT - QUẢN LÝ CÔNG NỢ
 */

import { qs, escapeHtml } from '../utils/dom.js';

export class Toast {
  static show(message, type = "info", title = "", duration = 3500) {
    const container = qs("#toast-container");
    if (!container) return;

    const toastEl = document.createElement("div");
    toastEl.className = "toast";

    let iconName = "info";
    let iconColor = "var(--primary-500)";

    if (type === "success") {
      iconName = "check-circle";
      iconColor = "var(--success-500)";
      if (!title) title = "Thành công";
    } else if (type === "error" || type === "danger") {
      iconName = "alert-circle";
      iconColor = "var(--danger-500)";
      if (!title) title = "Lỗi";
    } else if (type === "warning") {
      iconName = "alert-triangle";
      iconColor = "var(--warning-500)";
      if (!title) title = "Cảnh báo";
    } else {
      if (!title) title = "Thông báo";
    }

    toastEl.innerHTML = `
      <div class="toast-icon" style="color: ${iconColor};">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
      </div>
    `;

    container.appendChild(toastEl);

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons({ root: toastEl });
    }

    setTimeout(() => {
      toastEl.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(100%)";
      setTimeout(() => toastEl.remove(), 300);
    }, duration);
  }

  static success(msg, title = "Thành công") { this.show(msg, "success", title); }
  static error(msg, title = "Lỗi xử lý") { this.show(msg, "error", title); }
  static warning(msg, title = "Chú ý") { this.show(msg, "warning", title); }
  static info(msg, title = "Thông báo") { this.show(msg, "info", title); }
}
