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

    // Cập nhật badges & user status
    this.updateBadges(stateStore.state);
    this.updateUserAndSyncStatus(stateStore.state);
    stateStore.subscribe((state) => {
      this.updateBadges(state);
      this.updateUserAndSyncStatus(state);
    });

    // Handle initial route
    this.handleHashChange();
  }

  static handleHashChange() {
    // Hash có dạng "#view" hoặc "#view/<tham-so>", ví dụ "#manifests/mf_123" để mở
    // thẳng một bảng kê ở màn hình nhập toàn màn hình (F5 vẫn ở đúng bảng kê đó).
    const rawHash = window.location.hash.replace("#", "") || "dashboard";
    const [rawView, ...restSegments] = rawHash.split("/");
    const routeParam = restSegments.join("/") || null;
    const validViews = ["dashboard", "partners", "invoices", "payment-requests", "payments", "reports", "exchange-rates", "catalogs", "manifests", "settings"];
    const activeView = validViews.includes(rawView) ? rawView : "dashboard";

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
      "payment-requests": "Quản Lý Giấy Đề Nghị Thanh Toán",
      payments: "Quản Lý Thu Chi & Chứng Từ Thanh Toán",
      reports: "Báo Cáo Tuổi Nợ & Đối Chiếu Công Nợ",
      "exchange-rates": "Tỷ Giá Ngoại Tệ Theo Ngày",
      catalogs: "Danh Mục Dùng Chung & Bảng Giá Cước",
      manifests: "Bảng Kê Chi Tiết Cước Quốc Tế",
      settings: "Cài Đặt Hệ Thống & Dữ Liệu"
    };

    const titleEl = qs("#page-title");
    if (titleEl) {
      titleEl.textContent = titleMap[activeView] || "Quản Lý Công Nợ";
    }

    if (typeof this.onRouteChange === "function") {
      this.onRouteChange(activeView, routeParam);
    }
  }

  static updateUserAndSyncStatus(state) {
    // 1. Cập nhật User Pill trên Top Header
    const userContainer = qs("#header-user-container");
    if (userContainer) {
      if (state.currentUser) {
        const u = state.currentUser;
        userContainer.innerHTML = `
          <a href="#settings" class="header-user-pill" title="Tài khoản: ${u.email} (Bấm để xem Cài đặt)">
            ${u.photoURL ? `
              <img class="header-user-avatar" src="${u.photoURL}" alt="Avatar" referrerpolicy="no-referrer">
            ` : `
              <div class="header-user-avatar-fallback">${u.displayName.charAt(0).toUpperCase()}</div>
            `}
            <span style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.displayName}</span>
          </a>
        `;
      } else {
        userContainer.innerHTML = `
          <a href="#settings" class="btn btn-secondary btn-sm" style="height: 32px; font-size: 0.775rem;">
            <i data-lucide="log-in" style="width: 14px; height: 14px;"></i>
            <span>Đăng Nhập</span>
          </a>
        `;
      }
    }

    // 2. Cập nhật Sidebar Footer Sync Text
    const syncText = qs("#sync-text");
    const syncDot = qs(".sync-dot");
    if (syncText) {
      if (state.currentUser) {
        if (state.syncStatus === "error") {
          syncText.textContent = "⚠️ Lỗi đồng bộ Cloud";
          syncText.title = state.lastSyncError || "Lỗi quyền hoặc kết nối Firestore";
          if (syncDot) syncDot.style.backgroundColor = "var(--danger-500)";
        } else if (state.syncStatus === "syncing") {
          syncText.textContent = "Đang đồng bộ Cloud...";
          if (syncDot) syncDot.style.backgroundColor = "var(--warning-500)";
        } else {
          syncText.textContent = `Cloud: ${state.currentUser.email.split('@')[0]}`;
          if (syncDot) syncDot.style.backgroundColor = "var(--success-500)";
        }
      } else {
        syncText.textContent = "Chế độ: Offline LocalStorage";
        if (syncDot) {
          syncDot.style.backgroundColor = "var(--text-muted)";
        }
      }
    }
  }

  static updateBadges(state) {
    // Overdue invoices badge
    const overdueCount = (state.invoices || []).filter(i => i.status === INVOICE_STATUS.OVERDUE).length;
    const badge = qs("#badge-overdue-count");
    if (badge) {
      if (overdueCount > 0) {
        badge.textContent = overdueCount;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    // Pending payment requests badge
    const pendingRequestsCount = (state.paymentRequests || []).filter(r => r.status === "PENDING").length;
    const reqBadge = qs("#badge-pending-request-count");
    if (reqBadge) {
      if (pendingRequestsCount > 0) {
        reqBadge.textContent = pendingRequestsCount;
        reqBadge.classList.remove("hidden");
      } else {
        reqBadge.classList.add("hidden");
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
