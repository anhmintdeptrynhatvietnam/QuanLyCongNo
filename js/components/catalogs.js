/**
 * CATALOGS VIEW - DANH MỤC DÙNG CHUNG & BẢNG GIÁ CƯỚC
 *
 * Một component CRUD duy nhất dựng bảng và form cho cả 5 danh mục từ CATALOG_DEFS,
 * cộng một tab riêng cho bảng giá cước (loại duy nhất có cấu trúc thật sự khác).
 */

import { BaseComponent } from './base-component.js';
import { stateStore } from '../state.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { qs, qsa, escapeHtml } from '../utils/dom.js';
import { formatCurrency, parseCurrency } from '../utils/formatters.js';
import { CATALOG_DEFS, CATALOG_TYPES, PORT_KIND_LABELS, PORT_KINDS } from '../config.js';
import { splitCustomsSuffix, findCatalogUsage } from '../services/catalog-service.js';

const RATE_CARDS_TAB = 'rateCards';

export class CatalogsView extends BaseComponent {
  constructor(containerId) {
    super(containerId);
    this.activeTab = CATALOG_TYPES[0];
  }

  render(state) {
    const catalogs = state.catalogs || {};
    const isRateTab = this.activeTab === RATE_CARDS_TAB;

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <i data-lucide="library" style="color: var(--primary-600);"></i>
            <span>Danh Mục Dùng Chung & Bảng Giá Cước</span>
          </div>
          <div class="flex items-center" style="gap: var(--space-2);">
            <button class="btn btn-secondary btn-sm" id="btn-seed-catalogs" title="Nạp sẵn shipper, mã chuyến bay, sân bay, sản phẩm lấy từ bảng kê mẫu">
              <i data-lucide="sparkles"></i>
              <span>Nhập Gợi Ý</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-add-entry">
              <i data-lucide="plus"></i>
              <span>Thêm Mới</span>
            </button>
          </div>
        </div>

        <div class="catalog-tabs">
          ${CATALOG_TYPES.map(type => `
            <button class="catalog-tab ${this.activeTab === type ? 'active' : ''}" data-tab="${type}">
              <i data-lucide="${CATALOG_DEFS[type].icon}"></i>
              <span>${escapeHtml(CATALOG_DEFS[type].label)}</span>
              <span class="catalog-tab-count">${(catalogs[type] || []).length}</span>
            </button>
          `).join('')}
          <button class="catalog-tab ${isRateTab ? 'active' : ''}" data-tab="${RATE_CARDS_TAB}">
            <i data-lucide="badge-dollar-sign"></i>
            <span>Bảng Giá Cước</span>
            <span class="catalog-tab-count">${(state.rateCards || []).length}</span>
          </button>
        </div>

        ${isRateTab ? this.renderRateCards(state) : this.renderCatalog(state, this.activeTab)}
      </div>
    `;
  }

  // ---------- Danh mục ----------

  renderCatalog(state, type) {
    const def = CATALOG_DEFS[type];
    const entries = (state.catalogs && state.catalogs[type]) || [];

    if (entries.length === 0) {
      return this.renderEmpty(`Chưa có bản ghi nào trong "${def.label}"`,
        'Bấm "Thêm Mới" để tạo, hoặc "Nhập Gợi Ý" để nạp sẵn dữ liệu từ bảng kê mẫu.');
    }

    return `
      <div style="overflow-x: auto;">
        <table class="data-table">
          <thead>
            <tr>
              ${def.fields.map(f => `<th>${escapeHtml(f.label)}</th>`).join('')}
              <th style="width: 90px;"></th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(entry => `
              <tr>
                ${def.fields.map(f => `<td>${this.renderCell(entry, f)}</td>`).join('')}
                <td>
                  <button class="btn btn-icon btn-sm btn-edit-entry" data-id="${entry.id}" title="Sửa">
                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                  </button>
                  <button class="btn btn-icon btn-sm btn-delete-entry" data-id="${entry.id}" title="Xóa">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger-600);"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderCell(entry, field) {
    const value = entry[field.key];

    if (field.type === 'select' && field.options) {
      return escapeHtml(field.options[value] || value || '—');
    }
    return escapeHtml(value || '—');
  }

  // ---------- Bảng giá ----------

  renderRateCards(state) {
    const cards = state.rateCards || [];

    if (cards.length === 0) {
      return this.renderEmpty('Chưa có bảng giá cước nào',
        'Mỗi khách hàng có giá riêng đàm phán. Chưa có bảng giá thì chưa lập được bảng kê cho khách đó.');
    }

    return `
      <div style="overflow-x: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Tuyến</th>
              <th>Giá kg đầu</th>
              <th>Giá mỗi kg tiếp theo</th>
              <th>Phí cố định</th>
              <th style="width: 90px;"></th>
            </tr>
          </thead>
          <tbody>
            ${cards.map(card => `
              <tr>
                <td style="font-weight: 500;">${escapeHtml(card.partnerName || card.partnerId)}</td>
                <td><code>${escapeHtml(card.pol)} → ${escapeHtml(card.pod)}</code></td>
                <td>${formatCurrency(card.baseFee, false)} ${escapeHtml(card.currency || 'KRW')}</td>
                <td>${formatCurrency(card.stepFee, false)} ${escapeHtml(card.currency || 'KRW')}</td>
                <td>
                  ${(card.fixedFees || []).length === 0 ? '—' : (card.fixedFees || []).map(fee => `
                    <div style="font-size: 0.75rem;">
                      ${escapeHtml(fee.label)}: <b>${formatCurrency(fee.amount, false)} ${escapeHtml(fee.currency)}</b>
                      ${fee.requiresCustoms ? '<span style="color: var(--warning-600);">(chỉ khi TQ)</span>' : ''}
                    </div>
                  `).join('')}
                </td>
                <td>
                  <button class="btn btn-icon btn-sm btn-edit-rate" data-id="${card.id}" title="Sửa">
                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                  </button>
                  <button class="btn btn-icon btn-sm btn-delete-rate" data-id="${card.id}" title="Xóa">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger-600);"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: var(--space-3);">
          Cước một dòng bảng kê = <b>giá kg đầu + (số kg − 1) × giá mỗi kg tiếp theo</b>,
          cộng các phí cố định áp dụng được.
        </div>
      </div>
    `;
  }

  renderEmpty(title, hint) {
    return `
      <div class="empty-state" style="text-align: center; padding: var(--space-8) var(--space-4);">
        <i data-lucide="inbox" style="width: 40px; height: 40px; color: var(--text-muted);"></i>
        <div style="font-weight: 600; margin-top: var(--space-3);">${escapeHtml(title)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: var(--space-1); max-width: 460px; margin-left: auto; margin-right: auto;">
          ${escapeHtml(hint)}
        </div>
      </div>
    `;
  }

  // ---------- Events ----------

  afterRender(state) {
    qsa('.catalog-tab', this.container).forEach(btn => {
      btn.onclick = () => {
        this.activeTab = btn.dataset.tab;
        this.mount(stateStore.state);
      };
    });

    const addBtn = qs('#btn-add-entry', this.container);
    if (addBtn) {
      addBtn.onclick = () => {
        if (this.activeTab === RATE_CARDS_TAB) this.showRateCardModal();
        else this.showEntryModal(this.activeTab);
      };
    }

    const seedBtn = qs('#btn-seed-catalogs', this.container);
    if (seedBtn) {
      seedBtn.onclick = () => {
        const { added, skipped } = stateStore.seedCatalogs();
        if (added === 0) Toast.info(`Danh mục đã có đủ dữ liệu gợi ý (bỏ qua ${skipped} bản ghi trùng).`);
        else Toast.success(`Đã thêm ${added} bản ghi gợi ý${skipped > 0 ? `, bỏ qua ${skipped} bản ghi đã có` : ''}.`);
      };
    }

    qsa('.btn-edit-entry', this.container).forEach(btn => {
      btn.onclick = () => {
        const entry = (stateStore.state.catalogs[this.activeTab] || []).find(e => e.id === btn.dataset.id);
        if (entry) this.showEntryModal(this.activeTab, entry);
      };
    });

    qsa('.btn-delete-entry', this.container).forEach(btn => {
      btn.onclick = () => this.handleDeleteEntry(btn.dataset.id);
    });

    qsa('.btn-edit-rate', this.container).forEach(btn => {
      btn.onclick = () => {
        const card = (stateStore.state.rateCards || []).find(c => c.id === btn.dataset.id);
        if (card) this.showRateCardModal(card);
      };
    });

    qsa('.btn-delete-rate', this.container).forEach(btn => {
      btn.onclick = () => {
        const card = (stateStore.state.rateCards || []).find(c => c.id === btn.dataset.id);
        if (!card) return;
        if (!confirm(`Xóa bảng giá của ${card.partnerName || card.partnerId} tuyến ${card.pol} → ${card.pod}?`)) return;
        const res = stateStore.deleteRateCard(card.id);
        if (res.ok) Toast.info('Đã xóa bảng giá.');
        else Toast.show(res.error, 'warning', 'Không xóa được', 9000);
      };
    });
  }

  handleDeleteEntry(id) {
    const type = this.activeTab;
    const entry = (stateStore.state.catalogs[type] || []).find(e => e.id === id);
    if (!entry) return;

    const usage = findCatalogUsage(stateStore.state, type, entry);
    if (usage.count > 0) {
      Toast.show(
        `"${entry.name || entry.code}" đang được dùng ở: ${usage.where.join(', ')}. Sửa các dòng đó trước khi xóa.`,
        'warning', 'Không xóa được', 9000
      );
      return;
    }

    if (!confirm(`Xóa "${entry.name || entry.code}" khỏi danh mục?`)) return;

    const res = stateStore.deleteCatalogEntry(type, id);
    if (res.ok) Toast.info('Đã xóa khỏi danh mục.');
    else Toast.show(res.error, 'warning', 'Không xóa được', 9000);
  }

  // ---------- Form danh mục ----------

  showEntryModal(type, entry = null) {
    const def = CATALOG_DEFS[type];
    const isEdit = Boolean(entry);

    Modal.open({
      title: `${isEdit ? 'Sửa' : 'Thêm'} — ${def.label}`,
      bodyHtml: def.fields.map(field => this.renderFormField(field, entry)).join(''),
      footerHtml: `
        <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
        <button class="btn btn-primary" id="btn-save-entry">${isEdit ? 'Lưu' : 'Thêm'}</button>
      `,
      onOpen: (body, footer) => {
        qs('#btn-save-entry', footer).onclick = () => this.saveEntry(type, entry, body);
      }
    });
  }

  renderFormField(field, entry) {
    const value = entry ? entry[field.key] : (field.defaultValue ?? '');
    const id = `cat-field-${field.key}`;

    if (field.type === 'select') {
      return `
        <div class="form-group">
          <label class="form-label">${escapeHtml(field.label)}</label>
          <select class="form-control" id="${id}">
            ${Object.entries(field.options).map(([key, label]) => `
              <option value="${key}" ${value === key ? 'selected' : ''}>${escapeHtml(label)}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    return `
      <div class="form-group">
        <label class="form-label">
          ${escapeHtml(field.label)}${field.required ? ' <span class="required">*</span>' : ''}
        </label>
        <input type="text" class="form-control" id="${id}"
               value="${escapeHtml(value || '')}"
               placeholder="${escapeHtml(field.placeholder || '')}"
               ${field.uppercase ? 'style="text-transform: uppercase;"' : ''}>
      </div>
    `;
  }

  saveEntry(type, existing, body) {
    const def = CATALOG_DEFS[type];
    const payload = existing ? { id: existing.id } : {};

    for (const field of def.fields) {
      const el = qs(`#cat-field-${field.key}`, body);
      if (!el) continue;

      let raw = String(el.value || '').trim();
      if (field.uppercase) raw = raw.toUpperCase();
      payload[field.key] = raw;

      if (field.required && !payload[field.key]) {
        Toast.warning(`Chưa nhập "${field.label}".`);
        return;
      }
    }

    // Shipper: tách hậu tố TQ/KTQ nếu người dùng gõ kèm vào tên.
    // Danh mục chỉ lưu tên công ty; trạng thái thông quan chọn trên từng dòng bảng
    // kê, vì cùng một công ty có lô thông quan và lô không thông quan.
    let notice = '';
    if (type === 'shippers') {
      const split = splitCustomsSuffix(payload.name);
      if (split.strippedSuffix) {
        payload.name = split.name;
        notice = `Đã bỏ hậu tố "${split.strippedSuffix}" khỏi tên. ` +
                 `Trạng thái thông quan được chọn trên từng dòng bảng kê, không lưu ở danh mục.`;
      }
      if (!payload.name) {
        Toast.warning('Tên người gửi không được rỗng sau khi bỏ hậu tố.');
        return;
      }
    }

    const res = stateStore.upsertCatalogEntry(type, payload);
    if (!res.ok) {
      Toast.show(res.error, 'warning', 'Không lưu được', 8000);
      return;
    }

    Modal.close();
    if (notice) Toast.show(notice, 'info', 'Đã chuẩn hóa tên', 9000);
    else Toast.success(existing ? 'Đã cập nhật danh mục.' : 'Đã thêm vào danh mục.');
  }

  // ---------- Form bảng giá ----------

  showRateCardModal(card = null) {
    const state = stateStore.state;
    const isEdit = Boolean(card);
    const ports = (state.catalogs && state.catalogs.ports) || [];
    const customers = (state.partners || []).filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH');

    if (customers.length === 0) {
      Toast.warning('Chưa có khách hàng nào. Thêm khách hàng ở mục "Khách hàng & NCC" trước.');
      return;
    }
    if (ports.length === 0) {
      Toast.warning('Chưa có sân bay nào trong danh mục. Thêm sân bay hoặc bấm "Nhập Gợi Ý" trước.');
      return;
    }

    const fees = card && card.fixedFees ? card.fixedFees : [];

    Modal.open({
      title: `${isEdit ? 'Sửa' : 'Thêm'} Bảng Giá Cước`,
      size: 'lg',
      bodyHtml: `
        <div class="form-group">
          <label class="form-label">Khách hàng <span class="required">*</span></label>
          <select class="form-control" id="rc-partner">
            <option value="">-- Chọn khách hàng --</option>
            ${customers.map(p => `
              <option value="${p.id}" ${card && card.partnerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
            `).join('')}
          </select>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: var(--space-1);">
            Giá cước là giá riêng đàm phán với từng khách, không dùng chung.
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">POL - Điểm đi <span class="required">*</span></label>
            <select class="form-control" id="rc-pol">
              ${ports.filter(p => p.kind !== PORT_KINDS.POD).map(p => `
                <option value="${escapeHtml(p.code)}" ${card && card.pol === p.code ? 'selected' : ''}>${escapeHtml(p.code)} — ${escapeHtml(p.name || '')}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">POD - Điểm đến <span class="required">*</span></label>
            <select class="form-control" id="rc-pod">
              ${ports.filter(p => p.kind !== PORT_KINDS.POL).map(p => `
                <option value="${escapeHtml(p.code)}" ${card && card.pod === p.code ? 'selected' : ''}>${escapeHtml(p.code)} — ${escapeHtml(p.name || '')}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label">Giá kg đầu tiên (KRW) <span class="required">*</span></label>
            <input type="text" class="form-control currency-input" id="rc-base" value="${card ? card.baseFee : 20000}">
          </div>
          <div class="form-group">
            <label class="form-label">Giá mỗi kg tiếp theo (KRW) <span class="required">*</span></label>
            <input type="text" class="form-control currency-input" id="rc-step" value="${card ? card.stepFee : 8750}">
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid var(--border-subtle); margin: var(--space-4) 0;">

        <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
          <label class="form-label" style="margin: 0;">Phí cố định</label>
          <button class="btn btn-secondary btn-sm" id="rc-add-fee" type="button">
            <i data-lucide="plus"></i><span>Thêm phí</span>
          </button>
        </div>
        <div id="rc-fees">
          ${fees.map((fee, i) => this.renderFeeRow(fee, i)).join('')}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: var(--space-2);">
          Phí VND được cộng thẳng vào tổng tiền, không quy đổi theo tỷ giá.
          Bật "Chỉ khi thông quan" thì phí chỉ áp cho dòng có shipper TQ.
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
        <button class="btn btn-primary" id="btn-save-rate">${isEdit ? 'Lưu' : 'Thêm'}</button>
      `,
      onOpen: (body, footer) => {
        const feesBox = qs('#rc-fees', body);

        const bindRemove = () => {
          qsa('.rc-remove-fee', feesBox).forEach(btn => {
            btn.onclick = () => { btn.closest('.rc-fee-row').remove(); };
          });
        };

        qs('#rc-add-fee', body).onclick = () => {
          const idx = qsa('.rc-fee-row', feesBox).length;
          feesBox.insertAdjacentHTML('beforeend', this.renderFeeRow(
            { label: 'Phí giám sát tờ khai', amount: 300000, currency: 'VND', requiresCustoms: true }, idx
          ));
          if (window.lucide) window.lucide.createIcons({ root: feesBox });
          bindRemove();
        };

        bindRemove();
        qs('#btn-save-rate', footer).onclick = () => this.saveRateCard(card, body);
      }
    });
  }

  renderFeeRow(fee, index) {
    return `
      <div class="rc-fee-row" data-index="${index}">
        <input type="text" class="form-control rc-fee-label" placeholder="Tên phí" value="${escapeHtml(fee.label || '')}">
        <input type="text" class="form-control rc-fee-amount" placeholder="Số tiền" value="${fee.amount ?? ''}">
        <select class="form-control rc-fee-currency">
          <option value="VND" ${fee.currency === 'VND' ? 'selected' : ''}>VND</option>
          <option value="KRW" ${fee.currency === 'KRW' ? 'selected' : ''}>KRW</option>
        </select>
        <label class="rc-fee-customs" title="Chỉ áp dụng cho dòng có shipper thông quan (TQ)">
          <input type="checkbox" class="rc-fee-requires" ${fee.requiresCustoms ? 'checked' : ''}>
          <span>Chỉ khi TQ</span>
        </label>
        <button class="btn btn-icon btn-sm rc-remove-fee" type="button" title="Bỏ phí này">
          <i data-lucide="x" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    `;
  }

  saveRateCard(existing, body) {
    const partnerId = qs('#rc-partner', body).value;
    const pol = qs('#rc-pol', body).value;
    const pod = qs('#rc-pod', body).value;
    const baseFee = parseCurrency(qs('#rc-base', body).value);
    const stepFee = parseCurrency(qs('#rc-step', body).value);

    if (!partnerId) { Toast.warning('Chưa chọn khách hàng.'); return; }
    if (baseFee <= 0) { Toast.warning('Giá kg đầu tiên phải lớn hơn 0.'); return; }

    const fixedFees = qsa('.rc-fee-row', body).map(row => ({
      label: String(qs('.rc-fee-label', row).value || '').trim(),
      amount: parseCurrency(qs('.rc-fee-amount', row).value),
      currency: qs('.rc-fee-currency', row).value,
      requiresCustoms: qs('.rc-fee-requires', row).checked
    })).filter(fee => fee.label && fee.amount > 0);

    const res = stateStore.upsertRateCard({
      id: existing ? existing.id : undefined,
      partnerId, pol, pod, baseFee, stepFee,
      currency: 'KRW',
      fixedFees
    });

    if (!res.ok) {
      Toast.show(res.error, 'warning', 'Không lưu được', 8000);
      return;
    }

    Modal.close();
    Toast.success(existing ? 'Đã cập nhật bảng giá.' : 'Đã thêm bảng giá.');
  }
}
