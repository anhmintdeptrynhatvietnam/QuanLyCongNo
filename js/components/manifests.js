/**
 * MANIFESTS VIEW - BẢNG KÊ CHI TIẾT CƯỚC QUỐC TẾ
 *
 * Hai chế độ: danh sách bảng kê, và bảng nhập inline kiểu Excel.
 *
 * Nguyên tắc kiến trúc quan trọng nhất ở đây: **bản nháp sống trong view, không
 * trong stateStore**. `app.js` đăng ký `stateStore.subscribe` -> mỗi `notify()` gọi
 * `mount()` -> `BaseComponent.mount` gán lại `container.innerHTML`, tức mất focus
 * và mất vị trí con trỏ. Với bảng 42 dòng × ~20 ô thì đẩy từng ký tự vào state là
 * không dùng được. Nên: gõ -> sửa draft + cập nhật đúng ô trên DOM; bấm Lưu ->
 * đẩy một lần vào stateStore.
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { qs, qsa, escapeHtml, refreshLucideIcons } from '../utils/dom.js';
import { formatCurrency, formatDate, formatDateTime, toInputDateFormat } from '../utils/formatters.js';
import {
  MANIFEST_COLUMNS, MANIFEST_STATUS, MANIFEST_STATUS_LABELS,
  DEFAULT_DESCRIPTION_TEMPLATE, DEFAULT_DELIVERY_CHARGE, STORAGE_KEYS
} from '../config.js';
import { computeSheet, createLine, renderLineDescription } from '../services/manifest-engine.js';
import { ExchangeRateService } from '../services/exchange-rate-service.js';
import { findRateCard, formatShipperName } from '../services/catalog-service.js';

export class ManifestsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.mode = 'list';
    this.draft = null;
    this.baseUpdatedAt = null;
    this.dirty = false;
    this.showExtraColumns = false;

    // Bảng cần ~2552px ở bề rộng cột thường — vẫn quá màn 1920 kể cả khi đã ẩn
    // sidebar, nên chế độ nén bật sẵn; người dùng tắt thì nhớ lựa chọn đó.
    this.compact = localStorage.getItem(STORAGE_KEYS.MANIFEST_COMPACT) !== '0';
    this.metaOpen = true;
  }

  /**
   * Bỏ qua re-render khi con trỏ đang ở trong một ô của bảng.
   *
   * Không có chốt này thì một `notify()` bất kỳ (đồng bộ Firestore từ máy khác,
   * toast, badge) sẽ dựng lại innerHTML giữa lúc kế toán đang gõ.
   */
  mount(state) {
    if (this.mode === 'edit' && this.hasFocusInside()) {
      this.pendingRemount = true;
      return;
    }
    super.mount(state);
  }

  hasFocusInside() {
    const active = document.activeElement;
    if (!active || !this.container) return false;
    const tag = (active.tagName || '').toLowerCase();
    return this.container.contains(active) && ['input', 'select', 'textarea'].includes(tag);
  }

  // ============ Bối cảnh tính toán ============

  /** Bảng giá áp dụng cho draft hiện tại */
  rateCardOf(state, draft) {
    if (!draft) return null;
    if (draft.rateCardId) {
      const byId = (state.rateCards || []).find(rc => rc.id === draft.rateCardId);
      if (byId) return byId;
    }
    const firstLine = (draft.lines || [])[0];
    return findRateCard(state.rateCards, draft.partnerId, firstLine?.pol, firstLine?.pod);
  }

  /** Tính lại toàn bộ draft */
  computeDraft(state, draft) {
    return computeSheet(draft, {
      rateCard: this.rateCardOf(state, draft),
      rateResolver: (date) => ExchangeRateService.getKrwToVnd(state.exchangeRates, date)
    });
  }

  visibleColumns() {
    return MANIFEST_COLUMNS.filter(c => this.showExtraColumns || !c.extra);
  }

  /** Bề rộng tối thiểu của một cột theo chế độ đang bật */
  columnWidth(col) {
    return this.compact ? (col.compactWidth || col.width) : col.width;
  }

  /**
   * Vị trí trái của các cột dính, cộng dồn theo bề rộng ĐANG dùng.
   *
   * Trước đây offset nằm cứng trong CSS (left: 44px / 174px) nên đổi bề rộng cột
   * là ba cột dính chồng lên nhau. Tính ở đây thì chế độ nén và chế độ thường
   * dùng chung một đường dẫn, không phải sửa CSS mỗi lần đổi số.
   */
  stickyOffsets(cols) {
    const offsets = {};
    let left = 0;
    for (const col of cols) {
      if (!col.sticky) break; // các cột dính luôn nằm liền nhau ở đầu bảng
      offsets[col.key] = left;
      left += this.columnWidth(col);
    }
    return offsets;
  }

  /** Style vị trí cho ô của cột dính */
  stickyStyle(col, offsets) {
    return col.sticky ? ` style="left: ${offsets[col.key]}px;"` : '';
  }

  /** Class cho ô: cột dính cuối cùng được đánh dấu để kẻ đường phân vùng */
  stickyClass(col, offsets) {
    if (!col.sticky) return '';
    const keys = Object.keys(offsets);
    return keys[keys.length - 1] === col.key ? 'is-sticky is-sticky-last' : 'is-sticky';
  }

  /**
   * Bật/tắt chế độ toàn màn hình cho màn hình nhập.
   *
   * Cờ đặt trên <body> chứ không trong view: sidebar và top header nằm ngoài
   * container của view, chỉ CSS ở cấp body mới với tới được.
   */
  setFullscreen(on) {
    document.body.classList.toggle('mf-fullscreen', on);
  }

  /** Đổi hash mà KHÔNG kích hoạt hashchange — tránh vòng lặp mở lại chính nó */
  syncHash(hash) {
    if (window.location.hash === hash) return;
    history.replaceState(null, '', hash);
  }

  /**
   * Router gọi vào đây: "#manifests/<id>" mở thẳng màn hình nhập của bảng kê đó,
   * "#manifests" trả về danh sách.
   */
  applyRoute(param, state) {
    if (param) {
      if (this.mode === 'edit' && this.draft && this.draft.id === param) {
        this.setFullscreen(true);
        super.mount(state);
        return;
      }
      if ((state.manifests || []).some(x => x.id === param)) {
        this.openManifest(param);
        return;
      }
      Toast.warning('Không tìm thấy bảng kê trong đường dẫn. Đã mở danh sách.');
      this.syncHash('#manifests');
    }

    if (this.mode === 'edit' && this.draft) {
      if (this.dirty && !confirm('Bảng kê có thay đổi chưa lưu. Rời khỏi và bỏ thay đổi?')) {
        this.syncHash(`#manifests/${this.draft.id}`);
        this.setFullscreen(true);
        super.mount(state);
        return;
      }
      this.draft = null;
      this.baseUpdatedAt = null;
      this.dirty = false;
    }

    this.mode = 'list';
    this.setFullscreen(false);
    super.mount(state);
  }

  /** Rời view: luôn trả shell về trạng thái thường, nếu không sidebar sẽ mất ở view khác */
  destroy() {
    this.setFullscreen(false);
  }

  /** Cảnh báo thiếu bảng giá / thiếu tỷ giá — tách riêng để refreshTotals cập nhật được */
  renderBanners(rateCard, missing) {
    const banners = [];

    if (!rateCard) {
      banners.push(`
        <div class="manifest-banner is-danger">
          <i data-lucide="alert-circle"></i>
          <span>Khách hàng này chưa có bảng giá cho tuyến đang dùng. Vào
          <b>Danh Mục &amp; Bảng Giá</b> tạo bảng giá trước, nếu không cước sẽ tính bằng 0.</span>
        </div>
      `);
    }

    if (missing > 0) {
      banners.push(`
        <div class="manifest-banner is-warning">
          <i data-lucide="alert-triangle"></i>
          <span><b>${missing} dòng chưa có tỷ giá</b> — chưa thể phát hành. Các dòng đó
          không được tính vào tổng. Nhập tỷ giá cho những ngày đó ở mục
          <b>Tỷ Giá Theo Ngày</b>.</span>
        </div>
      `);
    }

    // Rỗng thật sự (không phải chuỗi toàn khoảng trắng) để CSS :empty bỏ luôn
    // phần đệm — màn hình nhập không được mất chiều cao vào một khối trống.
    return banners.join('');
  }

  // ============ Render ============

  render(state) {
    return this.mode === 'edit' && this.draft
      ? this.renderEditor(state)
      : this.renderList(state);
  }

  renderList(state) {
    const manifests = [...(state.manifests || [])].sort((a, b) =>
      String(b.issueDate || '').localeCompare(String(a.issueDate || '')));

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <i data-lucide="file-spreadsheet" style="color: var(--primary-600);"></i>
            <span>Bảng Kê Chi Tiết Cước Quốc Tế</span>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-new-manifest">
            <i data-lucide="plus"></i><span>Lập Bảng Kê</span>
          </button>
        </div>

        ${manifests.length === 0 ? `
          <div class="empty-state" style="text-align: center; padding: var(--space-8) var(--space-4);">
            <i data-lucide="file-plus" style="width: 40px; height: 40px; color: var(--text-muted);"></i>
            <div style="font-weight: 600; margin-top: var(--space-3);">Chưa có bảng kê nào</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: var(--space-1);">
              Cần có tỷ giá và bảng giá của khách trước khi lập bảng kê.
            </div>
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Số bảng kê</th><th>Ngày</th><th>Khách hàng</th>
                  <th style="text-align: right;">Số dòng</th>
                  <th style="text-align: right;">Tổng KRW</th>
                  <th style="text-align: right;">Tổng VND</th>
                  <th>Trạng thái</th><th style="width: 130px;"></th>
                </tr>
              </thead>
              <tbody>
                ${manifests.map(m => this.renderListRow(m)).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  renderListRow(m) {
    const issued = m.status === MANIFEST_STATUS.ISSUED;
    const totals = m.totals || {};
    return `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(m.sheetNo)}</td>
        <td>${formatDate(m.issueDate)}</td>
        <td>${escapeHtml(m.partnerName || '—')}</td>
        <td style="text-align: right;">${(m.lines || []).length}</td>
        <td style="text-align: right;" class="num-cell">${totals.totalKrw ? formatCurrency(totals.totalKrw, false) : '—'}</td>
        <td style="text-align: right; font-weight: 600;" class="num-cell">${totals.grandTotal ? formatCurrency(totals.grandTotal, false) : '—'}</td>
        <td>
          <span class="badge ${issued ? 'badge-paid' : 'badge-unpaid'}">
            ${MANIFEST_STATUS_LABELS[m.status] || m.status}
          </span>
        </td>
        <td>
          <button class="btn btn-icon btn-sm btn-open-manifest" data-id="${m.id}" title="Mở">
            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
          </button>
          <button class="btn btn-icon btn-sm btn-export-manifest" data-id="${m.id}" title="Xuất Excel">
            <i data-lucide="download" style="width: 14px; height: 14px;"></i>
          </button>
          <button class="btn btn-icon btn-sm btn-delete-manifest" data-id="${m.id}" title="Xóa">
            <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger-600);"></i>
          </button>
        </td>
      </tr>
    `;
  }

  /**
   * Màn hình nhập chạy toàn màn hình: sidebar và top header bị ẩn, mọi khối phụ
   * (thanh công cụ, thông tin đầu bảng, tổng cuối) đều cố định chiều cao, phần
   * còn lại của viewport thuộc về bảng.
   */
  renderEditor(state) {
    const d = this.draft;
    const computed = this.computeDraft(state, d);
    const rateCard = this.rateCardOf(state, d);
    const issued = d.status === MANIFEST_STATUS.ISSUED;
    const missing = computed.missingRateLines.length;
    const cols = this.visibleColumns();
    const offsets = this.stickyOffsets(cols);

    return `
      <div class="mf-workspace ${this.compact ? 'is-compact' : ''}">
        <div class="mf-topbar">
          <div class="mf-topbar-left">
            <button class="btn btn-secondary btn-sm" id="btn-back-list" title="Đóng màn hình nhập, quay lại danh sách bảng kê">
              <i data-lucide="arrow-left"></i><span>Danh sách</span>
            </button>
            <span class="mf-topbar-title">Bảng kê ${escapeHtml(d.sheetNo)}</span>
            <span class="badge ${issued ? 'badge-paid' : 'badge-unpaid'}">
              ${MANIFEST_STATUS_LABELS[d.status]}
            </span>
            ${this.dirty ? '<span class="badge badge-partial">Chưa lưu</span>' : ''}
          </div>

          <div class="mf-topbar-right">
            <button class="btn btn-secondary btn-sm" id="btn-toggle-meta"
                    title="Ẩn/hiện thông tin đầu bảng kê để bảng cao thêm">
              <i data-lucide="${this.metaOpen ? 'chevron-up' : 'chevron-down'}"></i>
              <span>Thông tin</span>
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-toggle-compact"
                    title="${this.compact
                      ? 'Đang nén bề rộng cột. Bấm để trả cột về bề rộng thường.'
                      : 'Nén bề rộng cột để bớt cuộn ngang.'}">
              <i data-lucide="${this.compact ? 'maximize-2' : 'minimize-2'}"></i>
              <span>${this.compact ? 'Cột rộng' : 'Nén cột'}</span>
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-toggle-extra">
              <i data-lucide="${this.showExtraColumns ? 'eye-off' : 'eye'}"></i>
              <span>${this.showExtraColumns ? 'Ẩn' : 'Hiện'} phí phụ</span>
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-save-manifest">
              <i data-lucide="save"></i><span>Lưu</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-issue-manifest">
              <i data-lucide="check-circle"></i><span>${issued ? 'Phát hành lại' : 'Phát hành'}</span>
            </button>
          </div>
        </div>

        <div class="mf-meta ${this.metaOpen ? '' : 'is-hidden'}">
          ${this.renderHeaderForm(state, d, rateCard)}
        </div>

        <div class="mf-banners" id="manifest-banners">${this.renderBanners(rateCard, missing)}</div>

        <div class="manifest-table-wrap">
          <table class="manifest-table" id="manifest-table">
            <thead>
              <tr>
                ${cols.map(c => `
                  <th class="${this.stickyClass(c, offsets)}"
                      style="min-width: ${this.columnWidth(c)}px;${c.sticky ? ` left: ${offsets[c.key]}px;` : ''}"
                      ${c.hint ? `title="${escapeHtml(c.hint)}"` : ''}>${escapeHtml(c.label)}</th>
                `).join('')}
                <th style="min-width: 64px;"></th>
              </tr>
            </thead>
            <tbody id="manifest-tbody">
              ${computed.lines.map((line, i) => this.renderLineRow(state, line, i, cols, offsets)).join('')}
            </tbody>
            <tfoot id="manifest-tfoot">
              ${this.renderTotalsRow(computed, cols)}
            </tfoot>
          </table>
        </div>

        <div class="mf-footbar">
          <div class="mf-footbar-left">
            <button class="btn btn-primary btn-sm" id="btn-add-line" title="Thêm dòng, kế thừa lựa chọn của dòng trước">
              <i data-lucide="plus"></i><span>Thêm dòng</span>
            </button>
            <span class="mf-hint">
              ${computed.lines.length} dòng · Ô nền xám là ô hệ thống tự tính — sửa được, khi sửa sẽ đổi màu.
            </span>
          </div>
          ${this.renderSummary(computed)}
        </div>
      </div>
    `;
  }

  renderHeaderForm(state, d, rateCard) {
    const customers = (state.partners || []).filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH');
    return `
      <div class="manifest-header-form">
        <div class="form-group">
          <label class="form-label">Số bảng kê</label>
          <input type="text" class="form-control" id="mf-sheetno" value="${escapeHtml(d.sheetNo)}">
        </div>
        <div class="form-group">
          <label class="form-label">Ngày lập</label>
          <input type="date" class="form-control" id="mf-issuedate" value="${escapeHtml(d.issueDate)}">
        </div>
        <div class="form-group">
          <label class="form-label">Khách hàng</label>
          <select class="form-control" id="mf-partner">
            ${customers.map(p => `
              <option value="${p.id}" ${d.partnerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Biển số xe</label>
          <input type="text" class="form-control" id="mf-truckplate" value="${escapeHtml(d.truckPlate || '')}" placeholder="29D-565.94">
        </div>
        <div class="form-group">
          <label class="form-label">Tuyến (dùng trong diễn giải)</label>
          <input type="text" class="form-control" id="mf-route" value="${escapeHtml(d.route || '')}" placeholder="KCN Tiên Sơn - Hà Nội - SEOUL">
        </div>
        <div class="form-group">
          <label class="form-label">Thuế GTGT (%)</label>
          <input type="number" step="0.1" min="0" class="form-control" id="mf-vat" value="${d.vatRate ?? 0}">
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Bảng giá đang dùng:
            ${rateCard
              ? `<b>${formatCurrency(rateCard.baseFee, false)} KRW</b> cho kg đầu,
                 <b>${formatCurrency(rateCard.stepFee, false)} KRW</b> mỗi kg tiếp theo
                 (tuyến ${escapeHtml(rateCard.pol)} → ${escapeHtml(rateCard.pod)})`
              : '<span style="color: var(--danger-600);">chưa có</span>'}
            ${d.updatedAt ? ` · Sửa lần cuối ${formatDateTime(d.updatedAt)} bởi ${escapeHtml(d.updatedBy || '—')}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderLineRow(state, line, index, cols, offsets) {
    const noRate = line.totalVnd === null;
    return `
      <tr data-index="${index}" class="${noRate ? 'line-no-rate' : ''}">
        ${cols.map(c => `<td class="${this.stickyClass(c, offsets)}"${this.stickyStyle(c, offsets)}>${this.renderCellInput(state, line, index, c)}</td>`).join('')}
        <td class="mf-row-actions">
          <button class="btn btn-icon btn-sm btn-dup-line" data-index="${index}" title="Nhân bản dòng">
            <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
          </button>
          <button class="btn btn-icon btn-sm btn-del-line" data-index="${index}" title="Xóa dòng">
            <i data-lucide="x" style="width: 13px; height: 13px; color: var(--danger-600);"></i>
          </button>
        </td>
      </tr>
    `;
  }

  renderCellInput(state, line, index, col) {
    const raw = line[col.key];
    const overridden = Boolean(line.overrides && col.key in line.overrides);
    const attr = `data-index="${index}" data-key="${col.key}"`;
    const catalogs = state.catalogs || {};

    switch (col.kind) {
      case 'readonly':
        return `<span class="mf-static">${escapeHtml(col.key === 'no' ? String(index + 1) : (raw ?? ''))}</span>`;

      case 'date':
        return `<input type="date" class="mf-cell" ${attr} value="${escapeHtml(raw || '')}">`;

      case 'text':
        return `<input type="text" class="mf-cell" ${attr} value="${escapeHtml(raw || '')}">`;

      case 'integer':
        return `<input type="number" step="1" min="0" class="mf-cell mf-num" ${attr} value="${raw ?? 0}">`;

      // Số thập phân: KHÔNG dùng .currency-input. Helper tiền tệ xoá mọi ký tự
      // không phải chữ số, nên 10.5 sẽ thành 105 -> cước sai 9 lần.
      case 'decimal':
        return `<input type="number" step="0.01" min="0" class="mf-cell mf-num decimal-input" ${attr} value="${raw ?? 0}">`;

      case 'currency':
        return `<input type="number" step="1" min="0" class="mf-cell mf-num" ${attr} value="${raw ?? 0}">`;

      case 'checkbox':
        return `<input type="checkbox" class="mf-cell mf-check" ${attr} ${raw ? 'checked' : ''}>`;

      case 'select': {
        const list = catalogs[col.source] || [];
        const isShipper = col.source === 'shippers';
        const valueOf = (e) => (col.source === 'flights' || col.source === 'ports' ? e.code : e.id);
        const labelOf = (e) => (col.source === 'flights' || col.source === 'ports' ? e.code : e.name);
        return `
          <select class="mf-cell" ${attr}>
            <option value="">—</option>
            ${list.map(e => `
              <option value="${escapeHtml(valueOf(e))}" ${String(raw) === String(valueOf(e)) ? 'selected' : ''}>
                ${escapeHtml(labelOf(e))}
              </option>
            `).join('')}
          </select>
          ${isShipper && raw ? `<div class="mf-shipper-preview" title="Chuỗi sẽ xuất ra cột SHIPPER">${escapeHtml(this.shipperLabel(state, line))}</div>` : ''}
        `;
      }

      case 'description': {
        const text = renderLineDescription(line, this.draft);
        return `<span class="mf-desc" style="max-width: ${this.columnWidth(col)}px;"
                  title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
      }

      case 'computed': {
        const display = raw === null || raw === undefined ? '' : raw;
        return `<input type="number" step="0.01" class="mf-cell mf-num mf-computed ${overridden ? 'is-overridden' : ''}"
                  ${attr} value="${display}"
                  placeholder="${raw === null ? '—' : ''}"
                  title="${overridden ? 'Đã sửa tay, không còn theo bảng giá' : 'Hệ thống tự tính'}">`;
      }

      default:
        return '';
    }
  }

  /** Chuỗi shipper sẽ xuất ra Excel, gồm hậu tố TQ/KTQ theo cờ của dòng */
  shipperLabel(state, line) {
    const shipper = (state.catalogs?.shippers || []).find(s => s.id === line.shipperId);
    return shipper ? formatShipperName(shipper, line.customsCleared) : '';
  }

  renderTotalsRow(computed, cols) {
    const t = computed.totals;
    const cell = (col) => {
      switch (col.key) {
        case 'no': return '<b>Tổng</b>';
        case 'ct': return `<b>${t.columnTotals.ct}</b>`;
        case 'gwt': return `<b>${t.columnTotals.gwt}</b>`;
        case 'cwt': return `<b>${t.columnTotals.cwt}</b>`;
        case 'freightCharge': return `<b>${formatCurrency(t.columnTotals.freightCharge, false)}</b>`;
        case 'deliveryCharge': return `<b>${formatCurrency(t.columnTotals.deliveryCharge, false)}</b>`;
        case 'fuel': return `<b>${formatCurrency(t.columnTotals.fuel, false)}</b>`;
        case 'customsCharge': return `<b>${formatCurrency(t.columnTotals.customsCharge, false)}</b>`;
        case 'pickFee': return `<b>${formatCurrency(t.columnTotals.pickFee, false)}</b>`;
        case 'declarationSupervisionFee': return `<b>${formatCurrency(t.columnTotals.fixedVndFees, false)}</b>`;
        case 'totalKrw': return `<b>${formatCurrency(t.totalKrw, false)}</b>`;
        case 'totalVnd': return `<b>${formatCurrency(t.totalVnd, false)}</b>`;
        default: return '';
      }
    };
    const offsets = this.stickyOffsets(cols);
    return `
      <tr class="manifest-totals-row">
        ${cols.map(c => `<td class="${this.stickyClass(c, offsets)}"${this.stickyStyle(c, offsets)}>${cell(c)}</td>`).join('')}
        <td></td>
      </tr>
    `;
  }

  renderSummary(computed) {
    const t = computed.totals;
    return `
      <div class="manifest-summary" id="manifest-summary">
        <div class="manifest-summary-words" title="${escapeHtml(t.amountInWords)}">
          Bằng chữ: ${escapeHtml(t.amountInWords)}
        </div>
        <div class="manifest-summary-row">
          <span>Tổng KRW</span><b class="num-cell">${formatCurrency(t.totalKrw, false)}</b>
        </div>
        <div class="manifest-summary-row">
          <span>Tổng VND</span><b class="num-cell">${formatCurrency(t.totalVnd, false)}</b>
        </div>
        <div class="manifest-summary-row">
          <span>GTGT ${t.vatRate}%</span><b class="num-cell">${formatCurrency(t.vatAmount, false)}</b>
        </div>
        <div class="manifest-summary-row is-grand">
          <span>Thanh toán</span><b class="num-cell">${formatCurrency(t.grandTotal)}</b>
        </div>
      </div>
    `;
  }

  // ============ Events ============

  afterRender(state) {
    if (this.mode === 'edit' && this.draft) this.bindEditor(state);
    else this.bindList(state);
  }

  bindList(state) {
    const newBtn = qs('#btn-new-manifest', this.container);
    if (newBtn) newBtn.onclick = () => this.showCreateModal(state);

    qsa('.btn-open-manifest', this.container).forEach(b => {
      b.onclick = () => this.openManifest(b.dataset.id);
    });
    qsa('.btn-export-manifest', this.container).forEach(b => {
      b.onclick = () => this.exportManifest(b.dataset.id);
    });
    qsa('.btn-delete-manifest', this.container).forEach(b => {
      b.onclick = () => this.deleteManifest(b.dataset.id);
    });
  }

  bindEditor(state) {
    qs('#btn-back-list', this.container).onclick = () => this.backToList();
    qs('#btn-add-line', this.container).onclick = () => this.addLine();
    qs('#btn-save-manifest', this.container).onclick = () => this.save();
    qs('#btn-issue-manifest', this.container).onclick = () => this.issue();
    qs('#btn-toggle-extra', this.container).onclick = () => {
      this.showExtraColumns = !this.showExtraColumns;
      super.mount(stateStore.state);
    };
    qs('#btn-toggle-meta', this.container).onclick = () => {
      this.metaOpen = !this.metaOpen;
      super.mount(stateStore.state);
    };
    qs('#btn-toggle-compact', this.container).onclick = () => {
      this.compact = !this.compact;
      localStorage.setItem(STORAGE_KEYS.MANIFEST_COMPACT, this.compact ? '1' : '0');
      super.mount(stateStore.state);
    };

    // Form đầu bảng
    const bindHeader = (sel, key, transform = (v) => v) => {
      const el = qs(sel, this.container);
      if (!el) return;
      el.onchange = () => {
        this.draft[key] = transform(el.value);
        this.dirty = true;
        if (key === 'partnerId' || key === 'route' || key === 'truckPlate' || key === 'vatRate') {
          super.mount(stateStore.state);
        }
      };
    };
    bindHeader('#mf-sheetno', 'sheetNo');
    bindHeader('#mf-issuedate', 'issueDate');
    bindHeader('#mf-partner', 'partnerId');
    bindHeader('#mf-truckplate', 'truckPlate');
    bindHeader('#mf-route', 'route');
    bindHeader('#mf-vat', 'vatRate', (v) => Number(v) || 0);

    // Event delegation ở cấp tbody: 42 dòng × 20 ô mà gắn từng ô thì quá nhiều listener
    const tbody = qs('#manifest-tbody', this.container);
    if (tbody) {
      tbody.oninput = (e) => this.onCellInput(e, state);
      tbody.onchange = (e) => this.onCellChange(e, state);
    }

    qsa('.btn-del-line', this.container).forEach(b => {
      b.onclick = () => this.deleteLine(Number(b.dataset.index));
    });
    qsa('.btn-dup-line', this.container).forEach(b => {
      b.onclick = () => this.duplicateLine(Number(b.dataset.index));
    });
  }

  /** Đọc giá trị ô về đúng kiểu dữ liệu */
  readCell(el, key) {
    const col = MANIFEST_COLUMNS.find(c => c.key === key);
    if (!col) return el.value;
    if (col.kind === 'checkbox') return el.checked;
    if (['integer', 'decimal', 'currency', 'computed'].includes(col.kind)) {
      const raw = String(el.value).trim();
      if (raw === '') return col.kind === 'computed' ? null : 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    return el.value;
  }

  /**
   * Gõ trong ô: sửa draft rồi cập nhật đúng các ô tính toán của DÒNG đó.
   * Không gọi mount(), không đụng stateStore -> không mất focus.
   */
  onCellInput(e, state) {
    const el = e.target;
    if (!el.classList || !el.classList.contains('mf-cell')) return;

    const index = Number(el.dataset.index);
    const key = el.dataset.key;
    const line = this.draft.lines[index];
    if (!line) return;

    const value = this.readCell(el, key);
    const col = MANIFEST_COLUMNS.find(c => c.key === key);

    if (col && col.kind === 'computed') {
      line.overrides = line.overrides || {};
      if (value === null) delete line.overrides[key];
      else line.overrides[key] = value;
      el.classList.add('is-overridden');
    } else {
      line[key] = value;
    }

    this.dirty = true;
    this.refreshRow(state, index);
    this.refreshTotals(state);
  }

  onCellChange(e, state) {
    const el = e.target;
    if (!el.classList || !el.classList.contains('mf-cell')) return;
    // select / checkbox / date chỉ bắn change, không bắn input
    this.onCellInput(e, state);
    this.refreshDerivedCells(state, Number(el.dataset.index));
  }

  /** Cập nhật các ô tính toán của một dòng, ghi trực tiếp vào value */
  refreshRow(state, index) {
    const computed = this.computeDraft(state, this.draft);
    const line = computed.lines[index];
    if (!line) return;

    const row = qs(`#manifest-tbody tr[data-index="${index}"]`, this.container);
    if (!row) return;

    row.classList.toggle('line-no-rate', line.totalVnd === null);

    for (const col of MANIFEST_COLUMNS.filter(c => c.kind === 'computed')) {
      const cell = qs(`[data-key="${col.key}"]`, row);
      if (!cell || cell === document.activeElement) continue;
      const overridden = Boolean(line.overrides && col.key in line.overrides);
      cell.value = line[col.key] === null || line[col.key] === undefined ? '' : line[col.key];
      cell.classList.toggle('is-overridden', overridden);
    }
  }

  /** Cập nhật phần không phải ô nhập (diễn giải, nhãn shipper) sau khi đổi select */
  refreshDerivedCells(state, index) {
    const row = qs(`#manifest-tbody tr[data-index="${index}"]`, this.container);
    if (!row) return;
    const line = this.draft.lines[index];

    const desc = qs('.mf-desc', row);
    if (desc) {
      const text = renderLineDescription(line, this.draft);
      desc.textContent = text;
      desc.title = text;
    }
    const preview = qs('.mf-shipper-preview', row);
    if (preview) preview.textContent = this.shipperLabel(state, line);
  }

  refreshTotals(state) {
    const computed = this.computeDraft(state, this.draft);
    const tfoot = qs('#manifest-tfoot', this.container);
    if (tfoot) tfoot.innerHTML = this.renderTotalsRow(computed, this.visibleColumns());
    const summary = qs('#manifest-summary', this.container);
    if (summary) summary.outerHTML = this.renderSummary(computed);

    // Banner "thiếu tỷ giá" phụ thuộc dữ liệu dòng — phải cập nhật lại ở đây,
    // nếu không nó đứng yên với số dòng thiếu tỷ giá cũ sau khi sửa ngày/dòng.
    const banners = qs('#manifest-banners', this.container);
    if (banners) {
      banners.innerHTML = this.renderBanners(this.rateCardOf(state, this.draft), computed.missingRateLines.length);
      refreshLucideIcons();
    }
  }

  // ============ Hành động ============

  showCreateModal(state) {
    const customers = (state.partners || []).filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH');
    if (customers.length === 0) {
      Toast.warning('Chưa có khách hàng nào. Thêm ở mục "Khách hàng & NCC" trước.');
      return;
    }

    Modal.open({
      title: 'Lập Bảng Kê Mới',
      bodyHtml: `
        <div class="form-group">
          <label class="form-label">Khách hàng <span class="required">*</span></label>
          <select class="form-control" id="new-mf-partner">
            ${customers.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Số bảng kê <span class="required">*</span></label>
          <input type="text" class="form-control" id="new-mf-sheetno" placeholder="MVN - MC/2026">
        </div>
        <div class="form-group">
          <label class="form-label">Ngày lập</label>
          <input type="date" class="form-control" id="new-mf-date" value="${toInputDateFormat(new Date())}">
        </div>
        <div class="form-group">
          <label class="form-label">Biển số xe</label>
          <input type="text" class="form-control" id="new-mf-plate" placeholder="29D-565.94">
        </div>
        <div class="form-group">
          <label class="form-label">Tuyến</label>
          <input type="text" class="form-control" id="new-mf-route" placeholder="KCN Tiên Sơn - Hà Nội - SEOUL">
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
        <button class="btn btn-primary" id="btn-create-mf">Tạo</button>
      `,
      onOpen: (body, footer) => {
        qs('#btn-create-mf', footer).onclick = () => {
          const res = stateStore.addManifest({
            partnerId: qs('#new-mf-partner', body).value,
            sheetNo: qs('#new-mf-sheetno', body).value,
            issueDate: qs('#new-mf-date', body).value,
            truckPlate: qs('#new-mf-plate', body).value,
            route: qs('#new-mf-route', body).value,
            descriptionTemplate: DEFAULT_DESCRIPTION_TEMPLATE,
            lines: []
          });
          if (!res.ok) { Toast.show(res.error, 'warning', 'Không tạo được', 8000); return; }
          Modal.close();
          Toast.success('Đã tạo bảng kê. Bấm "Thêm dòng" để nhập đơn hàng.');
          this.openManifest(res.manifest.id);
        };
      }
    });
  }

  openManifest(id) {
    const manifest = (stateStore.state.manifests || []).find(m => m.id === id);
    if (!manifest) { Toast.error('Không tìm thấy bảng kê.'); return; }

    // Sao sâu: draft phải tách khỏi state để gõ không làm bẩn dữ liệu đã lưu
    this.draft = JSON.parse(JSON.stringify(manifest));
    this.baseUpdatedAt = manifest.updatedAt || null;
    this.dirty = false;
    this.mode = 'edit';
    this.setFullscreen(true);
    this.syncHash(`#manifests/${id}`);
    super.mount(stateStore.state);
  }

  backToList() {
    if (this.dirty && !confirm('Bảng kê có thay đổi chưa lưu. Rời khỏi và bỏ thay đổi?')) return;
    this.mode = 'list';
    this.draft = null;
    this.baseUpdatedAt = null;
    this.dirty = false;
    this.setFullscreen(false);
    this.syncHash('#manifests');
    super.mount(stateStore.state);
  }

  addLine() {
    const lines = this.draft.lines;
    const prev = lines.length > 0 ? lines[lines.length - 1] : null;
    lines.push(createLine(prev, {
      date: prev ? prev.date : this.draft.issueDate,
      deliveryCharge: DEFAULT_DELIVERY_CHARGE
    }));
    this.dirty = true;
    super.mount(stateStore.state);
    this.focusLine(lines.length - 1, 'blNo');
  }

  duplicateLine(index) {
    const source = this.draft.lines[index];
    if (!source) return;
    this.draft.lines.splice(index + 1, 0, JSON.parse(JSON.stringify(source)));
    this.dirty = true;
    super.mount(stateStore.state);
    this.focusLine(index + 1, 'blNo');
  }

  deleteLine(index) {
    if (!this.draft.lines[index]) return;
    this.draft.lines.splice(index, 1);
    this.dirty = true;
    super.mount(stateStore.state);
  }

  focusLine(index, key) {
    const el = qs(`#manifest-tbody tr[data-index="${index}"] [data-key="${key}"]`, this.container);
    if (el && typeof el.focus === 'function') el.focus();
  }

  /** Đưa draft vào stateStore, kiểm tra xung đột ghi đè */
  save() {
    const res = stateStore.updateManifest(this.draft.id, {
      sheetNo: this.draft.sheetNo,
      issueDate: this.draft.issueDate,
      partnerId: this.draft.partnerId,
      partnerName: (stateStore.state.partners.find(p => p.id === this.draft.partnerId) || {}).name || '',
      truckPlate: this.draft.truckPlate,
      route: this.draft.route,
      vatRate: this.draft.vatRate,
      descriptionTemplate: this.draft.descriptionTemplate,
      lines: this.draft.lines
    }, this.baseUpdatedAt);

    if (!res.ok) {
      Toast.show(res.error, 'warning', res.conflict ? 'Xung đột khi lưu' : 'Không lưu được', 12000);
      return false;
    }

    this.draft = JSON.parse(JSON.stringify(res.manifest));
    this.baseUpdatedAt = res.manifest.updatedAt;
    this.dirty = false;
    Toast.success('Đã lưu bảng kê.');
    super.mount(stateStore.state);
    return true;
  }

  issue() {
    if (this.dirty && !this.save()) return;

    const state = stateStore.state;
    const computed = this.computeDraft(state, this.draft);

    if (computed.missingRateLines.length > 0) {
      Toast.show(
        `Còn ${computed.missingRateLines.length} dòng chưa có tỷ giá. Nhập tỷ giá cho những ngày đó trước khi phát hành.`,
        'warning', 'Chưa thể phát hành', 10000
      );
      return;
    }

    const label = `${formatCurrency(computed.totals.grandTotal)} cho ${escapeHtml(this.draft.partnerName)}`;
    if (!confirm(`Phát hành bảng kê ${this.draft.sheetNo} và ghi nhận công nợ phải thu ${label}?`)) return;

    const res = stateStore.issueManifest(this.draft.id, computed);
    if (!res.ok) {
      Toast.show(res.error, 'warning', 'Không phát hành được', 12000);
      return;
    }

    this.draft = JSON.parse(JSON.stringify(
      stateStore.state.manifests.find(m => m.id === this.draft.id)));
    this.baseUpdatedAt = this.draft.updatedAt;
    this.dirty = false;
    Toast.show(
      `${res.reissued ? 'Đã cập nhật' : 'Đã tạo'} hóa đơn phải thu ${res.invoice.invoiceNumber} — ` +
      `${formatCurrency(res.invoice.totalAmount)}, hạn ${formatDate(res.invoice.dueDate)}.`,
      'success', res.reissued ? 'Phát hành lại' : 'Đã phát hành', 9000
    );
    super.mount(stateStore.state);
  }

  deleteManifest(id) {
    const m = (stateStore.state.manifests || []).find(x => x.id === id);
    if (!m) return;
    if (!confirm(`Xóa bảng kê ${m.sheetNo}?`)) return;

    const res = stateStore.deleteManifest(id);
    if (res.ok) { Toast.info('Đã xóa bảng kê.'); return; }

    if (res.hasInvoice) {
      this.showInvoiceConflictModal(m, res.error);
      return;
    }
    Toast.show(res.error, 'warning', 'Không xóa được', 9000);
  }

  /** Bảng kê đã phát hành: hỏi rõ, không âm thầm xóa hóa đơn có phát sinh */
  showInvoiceConflictModal(manifest, message) {
    const invoice = stateStore.state.invoices.find(i => i.id === manifest.linkedInvoiceId);
    const paid = (invoice?.paidAmount || 0) > 0;

    Modal.open({
      title: 'Bảng kê đã phát hành',
      bodyHtml: `
        <p style="margin-bottom: var(--space-3);">${escapeHtml(message)}</p>
        ${paid ? `
          <div class="manifest-banner is-warning" style="margin: 0 0 var(--space-3);">
            <i data-lucide="alert-triangle"></i>
            <span>Hóa đơn này đã thu <b>${formatCurrency(invoice.paidAmount)}</b>.
            Không xóa được hóa đơn khi đã có phát sinh thanh toán.</span>
          </div>
        ` : ''}
        <div style="display: grid; gap: var(--space-2);">
          ${!paid ? `
            <button class="btn btn-secondary" id="mf-del-both" style="justify-content: flex-start;">
              <i data-lucide="trash-2"></i><span>Xóa cả bảng kê và hóa đơn</span>
            </button>
          ` : ''}
          <button class="btn btn-secondary" id="mf-unlink" style="justify-content: flex-start;">
            <i data-lucide="unlink"></i><span>Giữ hóa đơn, chỉ bỏ liên kết rồi xóa bảng kê</span>
          </button>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>`,
      onOpen: (body) => {
        const delBoth = qs('#mf-del-both', body);
        if (delBoth) delBoth.onclick = () => {
          stateStore.deleteInvoice(manifest.linkedInvoiceId);
          stateStore.unlinkManifestInvoice(manifest.id);
          stateStore.deleteManifest(manifest.id);
          Modal.close();
          Toast.info('Đã xóa bảng kê và hóa đơn liên kết.');
        };
        qs('#mf-unlink', body).onclick = () => {
          stateStore.unlinkManifestInvoice(manifest.id);
          stateStore.deleteManifest(manifest.id);
          Modal.close();
          Toast.info('Đã xóa bảng kê, hóa đơn được giữ lại.');
        };
      }
    });
  }

  async exportManifest(id) {
    const manifest = (stateStore.state.manifests || []).find(m => m.id === id);
    if (!manifest) return;

    const state = stateStore.state;
    const computed = this.computeDraft(state, manifest);

    try {
      const { exportManifestToExcel } = await import('../services/manifest-export.js');
      await exportManifestToExcel(manifest, computed, state);
      Toast.success(`Đã xuất file Excel cho bảng kê ${manifest.sheetNo}.`);
    } catch (err) {
      Toast.show(err.message || 'Không xuất được file Excel.', 'error', 'Lỗi xuất Excel', 12000);
    }
  }
}
