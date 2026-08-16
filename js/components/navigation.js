/**
 * NAVIGATION & SHELL CONTROLLER - QUẢN LÝ CÔNG NỢ
 * Điều hướng Router SPA, Quản lý Sidebar Mobile, và Cập nhật Badge nợ quá hạn.
 */

import { stateStore } from '../state.js';
import { INVOICE_STATUS } from '../config.js';
import { qs, qsa, refreshLucideIcons } from '../utils/dom.js';

export class Navigation {
  static init(onRouteChange) {
    this.onRouteChange = onRouteChange;

    // Lắng nghe hashchange
    window.addEventListener("hashchange", () => {
      this.handleHashChange();
    });

    // Toggle Sidebar trên Mobile
    const toggleBtn = qs("#btn-toggle-sidebar");
    const sidebar = qs("#sidebar");
    if (toggleBtn && sidebar) {
      toggleBtn.onclick = () => {
        sidebar.classList.toggle("open");
      };
    }

    // Đóng sidebar khi click ngoài trên mobile
    document.addEventListener("click", (e) => {
      if (window.innerWidth <= 1024 && sidebar && sidebar.classList.contains("open")) {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
          sidebar.classList.remove("open");
        }
      }
    });

    // Theme Toggle
    this.initTheme();

    // Cập nhật badges
    this.updateBadges(stateStore.state);
    stateStore.subscribe((state) => this.updateBadges(state));

    // Handle initial route
    this.handleHashChange();
  }

  static handleHashChange() {
    const rawHash = window.location.hash.replace("#", "") || "dashboard";
    const validViews = ["dashboard", "partners", "invoices", "payments", "reports", "settings"];
    const activeView = validViews.includes(rawHash) ? rawHash : "dashboard";

    // Update active nav class
    qsa(".nav-item").forEach(item => {
      if (item.dataset.view === activeView) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    // Update Top Header Page Title
    const titleMap = {
      dashboard: "Dashboard Tổng Quan",
      partners: "Danh Mục Khách Hàng & Nhà Cung Cấp",
      invoices: "Quản Lý Hóa Đơn & Nợ Phát Sinh",
      payments: "Quản Lý Phiếu Thu / Chi & Khớp Nợ",
      reports: "Báo Cáo Tuổi Nợ & Đối Chiếu Công Nợ",
      settings: "Cài Đặt Hệ Thống & Dữ Liệu"
    };

    const titleEl = qs("#page-title");
    if (titleEl) {
      titleEl.textContent = titleMap[activeView] || "Quản Lý Công Nợ";
    }

    if (typeof this.onRouteChange === "function") {
      this.onRouteChange(activeView);
    }
  }

  static updateBadges(state) {
    const overdueCount = state.invoices.filter(i => i.status === INVOICE_STATUS.OVERDUE).length;
    const badge = qs("#badge-overdue-count");
    if (badge) {
      if (overdueCount > 0) {
        badge.textContent = overdueCount;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }
  }

  static initTheme() {
    const savedTheme = localStorage.getItem("qlcn_theme_mode") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    this.updateThemeIcon(savedTheme);

    const themeBtn = qs("#btn-theme-toggle");
    if (themeBtn) {
      themeBtn.onclick = () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
        const nextTheme = currentTheme === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("qlcn_theme_mode", nextTheme);
        this.updateThemeIcon(nextTheme);
      };
    }
  }

  static updateThemeIcon(theme) {
    const icon = qs("#theme-icon");
    if (icon) {
      icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
      refreshLucideIcons();
    }
  }
}
