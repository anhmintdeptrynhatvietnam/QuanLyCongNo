/**
 * BASE COMPONENT - QUẢN LÝ CÔNG NỢ
 * Lớp trừu tượng định nghĩa vòng đời cơ bản của một View giao diện.
 */

import { refreshLucideIcons } from '../utils/dom.js';
import { initCurrencyInputs } from '../utils/formatters.js';

export class BaseComponent {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
  }

  /**
   * Render HTML string vào container và chạy lifecycle hooks
   * @param {Object} state
   */
  mount(state) {
    if (!this.container) return;
    this.container.innerHTML = this.render(state);
    this.afterRender(state);
    refreshLucideIcons();
    initCurrencyInputs(this.container);
  }

  /**
   * Phương thức trả về HTML template
   * @param {Object} state
   * @returns {string}
   */
  render(state) {
    return `<div>Base Component</div>`;
  }

  /**
   * Hook sau khi render: Gán event listeners, khởi tạo biểu đồ, etc.
   * @param {Object} state
   */
  afterRender(state) {}

  /**
   * Cleanup khi chuyển trang
   */
  destroy() {}
}
