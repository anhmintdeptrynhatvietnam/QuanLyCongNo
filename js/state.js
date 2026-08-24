/**
 * STATE STORE - QUẢN LÝ CÔNG NỢ
 * Singleton State Management (Pub/Sub pattern).
 * Quản lý nguồn dữ liệu duy nhất (Single Source of Truth) cho toàn bộ ứng dụng.
 */

import { StorageService } from './services/storage.js';
import { recalculatePartnerBalances, calculateInvoiceStatus, autoAllocatePaymentFIFO } from './services/debt-engine.js';
import { DEFAULT_SETTINGS, PAYMENT_REQUEST_STATUS, getVoucherType, VOUCHER_TYPE_PREFIXES, INVOICE_TYPES, PAYMENT_TYPES, PERSISTED_BRANCHES, emptyCatalogs } from './config.js';
import { FirebaseService } from './services/firebase.js';
import { ExchangeRateService } from './services/exchange-rate-service.js';
import { normalizeCatalogs, findCatalogUsage, findDuplicateEntry, SEED_CATALOGS } from './services/catalog-service.js';

class StateStore {
  constructor() {
    this.subscribers = new Set();
    this.state = {
      partners: [],
      invoices: [],
      payments: [],
      paymentRequests: [],
      exchangeRates: [], // Tỷ giá theo ngày, phục vụ bảng kê cước quốc tế
      catalogs: emptyCatalogs(), // Danh mục dùng chung: shippers, consignees, flights, ports, items
      rateCards: [], // Bảng giá cước riêng theo từng khách hàng + tuyến
      settings: { ...DEFAULT_SETTINGS },
      activeView: "dashboard",
      searchQuery: "",
      currentUser: null, // { uid, displayName, email, photoURL, isLoggedIn }
      syncStatus: "offline", // "offline" | "syncing" | "synced" | "error"
      lastSyncError: null
    };
  }

  /**
   * Khởi tạo State từ Storage và lắng nghe Firebase Auth
   */
  /**
   * Nạp các nhánh dữ liệu vào state từ một nguồn (LocalStorage / Cloud / dữ liệu Khách).
   *
   * Duyệt PERSISTED_BRANCHES thay vì gán tay từng nhánh: trước đây mỗi nhánh mới
   * phải thêm vào 6 chỗ gán khác nhau (init, cache local, dữ liệu Khách, reset,
   * tải Cloud, Realtime sync), và bỏ sót đúng một chỗ là dữ liệu biến mất ở đúng
   * một luồng đăng nhập — loại lỗi rất khó phát hiện.
   *
   * @param {Object|null} source Nguồn dữ liệu; null/undefined -> dùng giá trị mặc định
   */
  applyBranches(source) {
    for (const branch of PERSISTED_BRANCHES) {
      const value = source ? source[branch.key] : undefined;
      const isUsable = branch.isObject
        ? value && typeof value === 'object' && !Array.isArray(value)
        : Array.isArray(value);
      this.state[branch.key] = isUsable ? value : branch.fallback();
    }
    // Danh mục phải đủ 5 nhóm dù dữ liệu cũ chỉ có một phần
    this.state.catalogs = normalizeCatalogs(this.state.catalogs);
  }

  async init() {
    this.applyBranches(StorageService.loadAll(null));

    this.recomputeAndPersist(false);

    // Khởi tạo Firebase SDK
    if (FirebaseService.isConfigured()) {
      await FirebaseService.init();
      FirebaseService.onAuthStateChanged((user) => {
        this.handleAuthStateChange(user);
      });
    }
  }

  /**
   * Xử lý chuyển đổi tài khoản người dùng (Đăng nhập / Đổi tài khoản / Đăng xuất)
   */
  async handleAuthStateChange(user) {
    if (user) {
      this.state.currentUser = user;
      this.state.syncStatus = "syncing";
      this.state.lastSyncError = null;
      this.notify();

      const userId = user.uid;
      // 1. Tải cache cục bộ của user trước để hiển thị tức thì
      const localData = StorageService.loadAll(userId);
      const hasLocalData = (localData.partners && localData.partners.length > 0) || 
                           (localData.invoices && localData.invoices.length > 0);

      if (hasLocalData) {
        this.applyBranches(localData);
      } else {
        // Nếu user này chưa có cache local, kiểm tra xem có dữ liệu Guest (Offline) vừa nhập không
        const guestData = StorageService.loadAll(null);
        const hasGuestData = (guestData.partners && guestData.partners.length > 0) ||
                             (guestData.invoices && guestData.invoices.length > 0);
        if (hasGuestData) {
          console.log("[StateStore] Tự động chuyển đổi dữ liệu Khách (Guest) sang tài khoản Google mới đăng nhập...");
          this.applyBranches(guestData);
          StorageService.saveAll(this.state, userId);
        } else {
          this.applyBranches(null);
        }
      }

      // 2. Kéo dữ liệu từ Cloud Firestore
      try {
        const cloudData = await FirebaseService.fetchUserData(userId);
        if (cloudData && ((cloudData.partners && cloudData.partners.length > 0) || (cloudData.invoices && cloudData.invoices.length > 0) || (cloudData.payments && cloudData.payments.length > 0))) {
          this.applyBranches(cloudData);
          this.state.invoices = this.state.invoices.map(inv => ({
            ...inv,
            status: calculateInvoiceStatus(inv)
          }));
          this.state.syncStatus = "synced";
          this.state.lastSyncError = null;
          StorageService.saveAll(this.state, userId);
        } else if (this.state.partners.length > 0 || this.state.invoices.length > 0) {
          // Nếu trên Cloud chưa có dữ liệu mà máy có dữ liệu thì đẩy lên Cloud
          await FirebaseService.saveUserData(userId, this.state);
          this.state.syncStatus = "synced";
          this.state.lastSyncError = null;
        } else {
          this.state.syncStatus = "synced";
          this.state.lastSyncError = null;
        }
      } catch (cloudErr) {
        console.error("[StateStore] Lỗi khi tải dữ liệu Cloud Firestore:", cloudErr);
        this.state.syncStatus = "error";
        this.state.lastSyncError = cloudErr.message || "Lỗi quyền hoặc kết nối Cloud Firestore";
      }

      // 3. Lắng nghe Realtime sync từ Cloud
      FirebaseService.listenUserData(userId, (remoteData) => {
        if (remoteData) {
          this.applyBranches(remoteData);
          this.state.invoices = this.state.invoices.map(inv => ({
            ...inv,
            status: calculateInvoiceStatus(inv)
          }));
          this.state.partners = recalculatePartnerBalances(this.state.partners, this.state.invoices);
          this.state.syncStatus = "synced";
          this.state.lastSyncError = null;
          StorageService.saveAll(this.state, userId);
          this.notify();
        }
      }, (err) => {
        this.state.syncStatus = "error";
        this.state.lastSyncError = err?.message || "Lỗi Realtime Firestore";
        this.notify();
      });

      this.recomputeAndPersist(true);
    } else {
      // Đăng xuất -> Chuyển về chế độ Khách (Offline Guest)
      this.state.currentUser = null;
      this.state.syncStatus = "offline";
      this.state.lastSyncError = null;

      this.applyBranches(StorageService.loadAll(null));

      this.recomputeAndPersist(true);
    }
  }

  /**
   * Đăng ký subscriber lắng nghe thay đổi State
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Thông báo cho tất cả subscribers
   */
  notify() {
    this.subscribers.forEach(cb => {
      try {
        cb(this.state);
      } catch (err) {
        console.error("[StateStore] Lỗi khi thực thi subscriber:", err);
      }
    });
  }

  /**
   * Tự động tính toán lại số dư đối tác và lưu trữ xuống Local & Cloud
   * @param {boolean} shouldNotify
   */
  recomputeAndPersist(shouldNotify = true) {
    // 1. Cập nhật trạng thái từng hóa đơn theo ngày hiện tại
    this.state.invoices = this.state.invoices.map(inv => ({
      ...inv,
      status: calculateInvoiceStatus(inv)
    }));

    // 2. Tính lại số dư 2 chiều cho từng khách hàng & NCC
    this.state.partners = recalculatePartnerBalances(this.state.partners, this.state.invoices);

    const userId = this.state.currentUser?.uid || null;

    // 3. Ghi dữ liệu xuống LocalStorage
    // Truyền cả state: saveAll chỉ ghi những nhánh có trong PERSISTED_BRANCHES,
    // nên thêm nhánh dữ liệu mới không cần sửa lại chỗ này.
    StorageService.saveAll(this.state, userId);

    // 4. Đồng bộ lên Cloud Firestore nếu đang đăng nhập
    if (userId && FirebaseService.isInitialized) {
      FirebaseService.saveUserData(userId, this.state)
        .then(() => {
          this.state.syncStatus = "synced";
          this.state.lastSyncError = null;
        })
        .catch(err => {
          console.error("[StateStore] Lỗi đồng bộ Cloud Firestore:", err);
          this.state.syncStatus = "error";
          this.state.lastSyncError = err.message || "Lỗi quyền hoặc kết nối Firestore";
        });
    }

    if (shouldNotify) {
      this.notify();
    }
  }

  // ==========================================
  // PARTNERS (KHÁCH HÀNG & NHÀ CUNG CẤP)
  // ==========================================

  addPartner(partnerData) {
    const id = partnerData.id || `P-${Date.now().toString(36).toUpperCase()}`;
    const newPartner = {
      ...partnerData,
      id,
      createdAt: new Date().toISOString()
    };
    this.state.partners.push(newPartner);
    this.recomputeAndPersist();
    return newPartner;
  }

  /**
   * Kiểm tra xem thông tin đối tác có bị trùng với đối tác nào trên hệ thống không
   */
  checkPartnerDuplicate({ code, taxCode, name, excludeId = null }) {
    const cleanCode = (code || "").trim().toLowerCase();
    const cleanTax = (taxCode || "").replace(/[^\d]/g, "");
    const cleanName = (name || "").trim().toLowerCase();

    let codeDup = null;
    let taxDup = null;
    let nameDup = null;

    for (const p of this.state.partners) {
      if (excludeId && p.id === excludeId) continue;

      if (!codeDup && cleanCode && p.code && p.code.trim().toLowerCase() === cleanCode) {
        codeDup = { field: "code", message: `Mã đối tác "${code}" đã thuộc về "${p.name}".`, matchedPartner: p };
      }
      if (!taxDup && cleanTax && p.taxCode && p.taxCode.replace(/[^\d]/g, "") === cleanTax) {
        taxDup = { field: "taxCode", message: `Mã số thuế "${taxCode}" đã thuộc về "${p.name}".`, matchedPartner: p };
      }
      if (!nameDup && cleanName && p.name && p.name.trim().toLowerCase() === cleanName) {
        nameDup = { field: "name", message: `Tên đối tác "${name}" đã có trên hệ thống (${p.code}).`, matchedPartner: p };
      }
    }

    return {
      isDuplicate: !!(codeDup || taxDup || nameDup),
      codeDup,
      taxDup,
      nameDup
    };
  }

  /**
   * Thêm hàng loạt đối tác (Batch Import từ Excel) kèm tùy chọn xử lý trùng
   * @param {Array<Object>} partnersList
   * @param {"SKIP"|"UPDATE"|"ALLOW"} duplicateMode
   * @returns {{ insertedCount: number, updatedCount: number, skippedCount: number }}
   */
  addPartnersBatch(partnersList = [], duplicateMode = "SKIP") {
    const now = new Date().toISOString();
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    partnersList.forEach((p, idx) => {
      if (!p.isValid) return;

      if (p.isDuplicate && duplicateMode === "SKIP") {
        skippedCount++;
        return;
      }

      if (p.isDuplicate && duplicateMode === "UPDATE" && p.matchedExistingPartner) {
        // Cập nhật thông tin cho đối tác đã có
        const existingIdx = this.state.partners.findIndex(item => item.id === p.matchedExistingPartner.id);
        if (existingIdx !== -1) {
          this.state.partners[existingIdx] = {
            ...this.state.partners[existingIdx],
            taxCode: p.taxCode || this.state.partners[existingIdx].taxCode,
            phone: p.phone || this.state.partners[existingIdx].phone,
            address: p.address || this.state.partners[existingIdx].address,
            creditLimit: p.creditLimit || this.state.partners[existingIdx].creditLimit,
            creditTermDays: p.creditTermDays || this.state.partners[existingIdx].creditTermDays,
            type: p.type || this.state.partners[existingIdx].type,
            updatedAt: now
          };
          updatedCount++;
        }
        return;
      }

      // Thêm mới
      const id = p.id || `P-${Date.now().toString(36).toUpperCase()}-${idx + 1}`;
      const partnerObj = {
        ...p,
        id,
        code: p.code || id,
        creditLimit: Number(p.creditLimit) || 0,
        creditTermDays: Number(p.creditTermDays) || 30,
        totalReceivable: 0,
        totalPayable: 0,
        createdAt: now
      };
      this.state.partners.push(partnerObj);
      insertedCount++;
    });

    this.recomputeAndPersist();
    return { insertedCount, updatedCount, skippedCount };
  }

  updatePartner(id, updatedFields) {
    const index = this.state.partners.findIndex(p => p.id === id);
    if (index !== -1) {
      this.state.partners[index] = {
        ...this.state.partners[index],
        ...updatedFields,
        updatedAt: new Date().toISOString()
      };
      this.recomputeAndPersist();
      return true;
    }
    return false;
  }

  deletePartner(id) {
    // Kiểm tra xem đối tác có hóa đơn phát sinh không
    const hasInvoices = this.state.invoices.some(inv => inv.partnerId === id);
    if (hasInvoices) {
      throw new Error("Không thể xóa đối tác đã có hóa đơn phát sinh trong hệ thống!");
    }
    this.state.partners = this.state.partners.filter(p => p.id !== id);
    this.recomputeAndPersist();
  }

  // ==========================================
  // INVOICES (HÓA ĐƠN / CHỨNG TỪ NỢ)
  // ==========================================

  addInvoice(invoiceData) {
    const id = invoiceData.id || `INV-${Date.now().toString(36).toUpperCase()}`;
    const preTax = Number(invoiceData.preTaxAmount) || (Number(invoiceData.totalAmount) - (Number(invoiceData.taxAmount) || 0));
    const tax = Number(invoiceData.taxAmount) || 0;
    const total = Number(invoiceData.totalAmount) || (preTax + tax);
    const paid = Number(invoiceData.paidAmount) || 0;
    const method = invoiceData.paymentMethod || "BANK_TRANSFER";

    const newInvoice = {
      ...invoiceData,
      id,
      preTaxAmount: preTax,
      taxAmount: tax,
      totalAmount: total,
      paidAmount: paid,
      paymentMethod: method,
      createdAt: new Date().toISOString()
    };
    newInvoice.status = calculateInvoiceStatus(newInvoice);

    this.state.invoices.unshift(newInvoice);

    // Nếu có thanh toán ngay lúc tạo hóa đơn -> Tự động sinh chứng từ thanh toán tương ứng
    if (paid > 0) {
      const isReceivable = newInvoice.type === "RECEIVABLE";
      const vType = getVoucherType(isReceivable ? "RECEIPT" : "PAYMENT", method);
      const prefix = VOUCHER_TYPE_PREFIXES[vType] || "CT";

      const autoPayment = {
        id: `PAY-${Date.now().toString(36).toUpperCase()}`,
        paymentNumber: `${prefix}-${Date.now().toString().slice(-6)}`,
        type: isReceivable ? "RECEIPT" : "PAYMENT",
        paymentMethod: method,
        voucherType: vType,
        partnerId: newInvoice.partnerId,
        partnerName: newInvoice.partnerName,
        paymentDate: newInvoice.issueDate || new Date().toISOString().split("T")[0],
        amount: paid,
        notes: `Thanh toán khi lập Hóa đơn ${newInvoice.invoiceNumber}`,
        allocations: [
          { invoiceId: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber, amount: paid }
        ],
        createdAt: new Date().toISOString()
      };
      this.state.payments.unshift(autoPayment);
    }

    this.recomputeAndPersist();
    return newInvoice;
  }

  /**
   * Kiểm tra xem số hóa đơn có bị trùng với hóa đơn nào trên hệ thống không
   */
  checkInvoiceDuplicate({ invoiceNumber, excludeId = null }) {
    const cleanNum = (invoiceNumber || "").trim().toLowerCase();
    if (!cleanNum) return { isDuplicate: false, matchedInvoice: null };

    for (const inv of this.state.invoices) {
      if (excludeId && inv.id === excludeId) continue;
      if (inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === cleanNum) {
        return {
          isDuplicate: true,
          matchedInvoice: inv,
          message: `Số hóa đơn "${invoiceNumber}" đã tồn tại (${inv.partnerName} - ${inv.totalAmount} VNĐ).`
        };
      }
    }

    return { isDuplicate: false, matchedInvoice: null };
  }

  /**
   * Thêm hàng loạt hóa đơn (Batch Import từ Excel) kèm tùy chọn xử lý trùng và tự tạo đối tác
   * @param {Array<Object>} invoicesList
   * @param {"SKIP"|"UPDATE"|"ALLOW"} duplicateMode
   * @param {boolean} autoCreatePartners
   * @returns {{ insertedCount: number, updatedCount: number, skippedCount: number, createdPartnersCount: number, autoCreatedPaymentsCount: number }}
   */
  addInvoicesBatch(invoicesList = [], duplicateMode = "SKIP", autoCreatePartners = true) {
    const now = new Date().toISOString();
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let createdPartnersCount = 0;
    let autoCreatedPaymentsCount = 0;

    // Cache để gom các đối tác mới được tạo tự động
    const newPartnerMap = new Map();

    invoicesList.forEach((invData, idx) => {
      if (!invData.isValid) return;

      // 1. Xử lý gắn đối tác / tạo đối tác mới nếu cần
      let partnerId = invData.partnerId;
      let partnerName = invData.partnerName || invData.partnerInput;

      if ((!partnerId || invData.isNewPartner) && autoCreatePartners) {
        const partnerKey = (invData.partnerInput || "").trim().toLowerCase();
        if (newPartnerMap.has(partnerKey)) {
          const cachedPartner = newPartnerMap.get(partnerKey);
          partnerId = cachedPartner.id;
          partnerName = cachedPartner.name;
        } else {
          // Kiểm tra xem đối tác đã có trong state chưa
          const existing = this.state.partners.find(p => 
            p.name.trim().toLowerCase() === partnerKey || 
            (p.code && p.code.trim().toLowerCase() === partnerKey)
          );
          if (existing) {
            partnerId = existing.id;
            partnerName = existing.name;
            newPartnerMap.set(partnerKey, existing);
          } else {
            // Tạo đối tác mới
            const newPId = `P-${Date.now().toString(36).toUpperCase()}-${createdPartnersCount + 1}`;
            const partnerType = invData.type === "PAYABLE" ? "VENDOR" : "CUSTOMER";
            const createdPartner = {
              id: newPId,
              code: newPId,
              name: invData.partnerInput.trim(),
              type: partnerType,
              taxCode: "",
              phone: "",
              address: "",
              creditLimit: 0,
              creditTermDays: 30,
              totalReceivable: 0,
              totalPayable: 0,
              createdAt: now
            };
            this.state.partners.push(createdPartner);
            newPartnerMap.set(partnerKey, createdPartner);
            partnerId = newPId;
            partnerName = createdPartner.name;
            createdPartnersCount++;
          }
        }
      }

      const preTax = Number(invData.preTaxAmount) || (Number(invData.totalAmount) - (Number(invData.taxAmount) || 0));
      const tax = Number(invData.taxAmount) || 0;
      const total = Number(invData.totalAmount) || (preTax + tax);
      const paid = Number(invData.paidAmount) || 0;
      const method = invData.paymentMethod || "BANK_TRANSFER";

      // 2. Xử lý trùng lặp
      if (invData.isDuplicate && duplicateMode === "SKIP") {
        skippedCount++;
        return;
      }

      if (invData.isDuplicate && duplicateMode === "UPDATE" && invData.matchedExistingInvoice) {
        const existingIdx = this.state.invoices.findIndex(item => item.id === invData.matchedExistingInvoice.id);
        if (existingIdx !== -1) {
          const currentInv = this.state.invoices[existingIdx];
          const updatedTotal = total || currentInv.totalAmount;
          const updatedPaid = invData.paidAmount !== undefined && invData.paidAmount !== null && invData.paidAmount > 0 
            ? Number(invData.paidAmount) 
            : currentInv.paidAmount;

          this.state.invoices[existingIdx] = {
            ...currentInv,
            partnerId: partnerId || currentInv.partnerId,
            partnerName: partnerName || currentInv.partnerName,
            type: invData.type || currentInv.type,
            itemName: invData.itemName || currentInv.itemName,
            issueDate: invData.issueDate || currentInv.issueDate,
            dueDate: invData.dueDate || currentInv.dueDate,
            preTaxAmount: preTax,
            taxAmount: tax,
            totalAmount: updatedTotal,
            paidAmount: updatedPaid,
            paymentMethod: method,
            notes: invData.notes || currentInv.notes,
            updatedAt: now
          };
          this.state.invoices[existingIdx].status = calculateInvoiceStatus(this.state.invoices[existingIdx]);
          updatedCount++;
        }
        return;
      }

      // 3. Thêm mới hóa đơn
      const id = invData.id || `INV-${Date.now().toString(36).toUpperCase()}-${idx + 1}`;
      const newInvoice = {
        id,
        invoiceNumber: invData.invoiceNumber,
        partnerId: partnerId || "",
        partnerName: partnerName || invData.partnerInput || "Đối tác",
        type: invData.type || "RECEIVABLE",
        itemName: invData.itemName || "Hàng hóa / Dịch vụ",
        issueDate: invData.issueDate,
        dueDate: invData.dueDate,
        preTaxAmount: preTax,
        taxAmount: tax,
        totalAmount: total,
        paidAmount: paid,
        paymentMethod: method,
        notes: invData.notes || "",
        createdAt: now
      };
      newInvoice.status = calculateInvoiceStatus(newInvoice);

      this.state.invoices.unshift(newInvoice);
      insertedCount++;

      // 4. Tự động sinh chứng từ thanh toán (UNT / UNC / PT / PC) nếu có số tiền đã thanh toán
      if (paid > 0) {
        const isReceivable = newInvoice.type === "RECEIVABLE";
        const vType = getVoucherType(isReceivable ? "RECEIPT" : "PAYMENT", method);
        const prefix = VOUCHER_TYPE_PREFIXES[vType] || "CT";

        const autoPayment = {
          id: `PAY-${Date.now().toString(36).toUpperCase()}-${idx + 1}`,
          paymentNumber: `${prefix}-${Date.now().toString().slice(-6)}${idx + 1}`,
          type: isReceivable ? "RECEIPT" : "PAYMENT",
          paymentMethod: method,
          voucherType: vType,
          partnerId: newInvoice.partnerId,
          partnerName: newInvoice.partnerName,
          paymentDate: newInvoice.issueDate || now.split("T")[0],
          amount: paid,
          notes: `Thanh toán tự động khi nhập Hóa đơn ${newInvoice.invoiceNumber}`,
          allocations: [
            { invoiceId: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber, amount: paid }
          ],
          createdAt: now
        };

        this.state.payments.unshift(autoPayment);
        autoCreatedPaymentsCount++;
      }
    });

    this.recomputeAndPersist();
    return { insertedCount, updatedCount, skippedCount, createdPartnersCount, autoCreatedPaymentsCount };
  }

  updateInvoice(id, updatedFields) {
    const index = this.state.invoices.findIndex(inv => inv.id === id);
    if (index !== -1) {
      this.state.invoices[index] = {
        ...this.state.invoices[index],
        ...updatedFields,
        updatedAt: new Date().toISOString()
      };
      this.recomputeAndPersist();
      return true;
    }
    return false;
  }

  deleteInvoice(id) {
    // Kiểm tra xem hóa đơn đã có phiếu thanh toán cấn trừ chưa
    const hasPayments = this.state.payments.some(pay =>
      (pay.allocations || []).some(alloc => alloc.invoiceId === id)
    );
    if (hasPayments) {
      throw new Error("Không thể xóa hóa đơn đã có phiếu thu/chi thanh toán!");
    }
    this.state.invoices = this.state.invoices.filter(inv => inv.id !== id);
    this.recomputeAndPersist();
  }

  // ==========================================
  // PAYMENTS (PHIẾU THU / CHI & ỦY NHIỆM THU / CHI)
  // ==========================================

  addPayment(paymentData) {
    const id = paymentData.id || `PAY-${Date.now().toString(36).toUpperCase()}`;
    const voucherType = paymentData.voucherType || getVoucherType(paymentData.type, paymentData.paymentMethod);
    
    const newPayment = {
      ...paymentData,
      id,
      voucherType,
      amount: Number(paymentData.amount) || 0,
      createdAt: new Date().toISOString()
    };

    // Cập nhật paidAmount cho các hóa đơn được phân bổ
    (newPayment.allocations || []).forEach(alloc => {
      const inv = this.state.invoices.find(i => i.id === alloc.invoiceId);
      if (inv) {
        inv.paidAmount = (Number(inv.paidAmount) || 0) + (Number(alloc.amount) || 0);
        inv.status = calculateInvoiceStatus(inv);
      }
    });

    this.state.payments.unshift(newPayment);
    this.recomputeAndPersist();
    return newPayment;
  }

  deletePayment(id) {
    const payment = this.state.payments.find(p => p.id === id);
    if (!payment) return;

    // Hoàn trả lại paidAmount cho các hóa đơn đã được cấn trừ
    (payment.allocations || []).forEach(alloc => {
      const inv = this.state.invoices.find(i => i.id === alloc.invoiceId);
      if (inv) {
        inv.paidAmount = Math.max(0, (Number(inv.paidAmount) || 0) - (Number(alloc.amount) || 0));
        inv.status = calculateInvoiceStatus(inv);
      }
    });

    // Nếu có Giấy Đề Nghị Thanh Toán gắn liền với thanh toán này, khôi phục về APPROVED
    this.state.paymentRequests.forEach(pr => {
      if (pr.paymentId === id) {
        pr.status = PAYMENT_REQUEST_STATUS.APPROVED;
        delete pr.paymentId;
      }
    });

    this.state.payments = this.state.payments.filter(p => p.id !== id);
    this.recomputeAndPersist();
  }

  // ==========================================
  // PAYMENT REQUESTS (GIẤY ĐỀ NGHỊ THANH TOÁN)
  // ==========================================

  addPaymentRequest(requestData) {
    const id = requestData.id || `PR-${Date.now().toString(36).toUpperCase()}`;
    const requestNumber = requestData.requestNumber || `ĐNTT-${Date.now().toString().slice(-6)}`;
    
    const newRequest = {
      ...requestData,
      id,
      requestNumber,
      amount: Number(requestData.amount) || 0,
      status: requestData.status || PAYMENT_REQUEST_STATUS.PENDING,
      createdAt: new Date().toISOString()
    };

    this.state.paymentRequests.unshift(newRequest);
    this.recomputeAndPersist();
    return newRequest;
  }

  updatePaymentRequest(id, updatedFields) {
    const index = this.state.paymentRequests.findIndex(pr => pr.id === id);
    if (index !== -1) {
      this.state.paymentRequests[index] = {
        ...this.state.paymentRequests[index],
        ...updatedFields,
        updatedAt: new Date().toISOString()
      };
      this.recomputeAndPersist();
      return true;
    }
    return false;
  }

  deletePaymentRequest(id) {
    const pr = this.state.paymentRequests.find(r => r.id === id);
    if (pr && pr.status === PAYMENT_REQUEST_STATUS.PAID) {
      throw new Error("Không thể xóa Giấy Đề Nghị Thanh Toán đã được chi tiền! Vui lòng hủy chứng từ thanh toán liên quan trước.");
    }
    this.state.paymentRequests = this.state.paymentRequests.filter(r => r.id !== id);
    this.recomputeAndPersist();
  }

  approvePaymentRequest(id) {
    return this.updatePaymentRequest(id, { status: PAYMENT_REQUEST_STATUS.APPROVED });
  }

  rejectPaymentRequest(id, reason = "") {
    return this.updatePaymentRequest(id, {
      status: PAYMENT_REQUEST_STATUS.REJECTED,
      rejectReason: reason
    });
  }

  /**
   * Chuyển đổi Giấy Đề Nghị Thanh Toán sang Ủy Nhiệm Chi (hoặc Phiếu Chi) và cấn trừ công nợ
   */
  executePaymentRequestToVoucher(id, voucherOptions = {}) {
    const pr = this.state.paymentRequests.find(r => r.id === id);
    if (!pr) throw new Error("Không tìm thấy Giấy Đề Nghị Thanh Toán!");
    if (pr.status === PAYMENT_REQUEST_STATUS.PAID) {
      throw new Error("Giấy Đề Nghị Thanh Toán này đã được chi tiền trước đó!");
    }

    const isCash = pr.paymentMethod === "CASH" || voucherOptions.paymentMethod === "CASH";
    const paymentMethod = isCash ? "CASH" : "BANK_TRANSFER";
    const type = PAYMENT_TYPES.PAYMENT; // Chi tiền
    const prefix = isCash ? VOUCHER_TYPE_PREFIXES.PAYMENT_CASH : VOUCHER_TYPE_PREFIXES.PAYMENT_BANK;
    const paymentNumber = voucherOptions.paymentNumber || `${prefix}-${Date.now().toString().slice(-6)}`;

    // Tự động phân bổ hóa đơn theo FIFO
    const allocations = voucherOptions.allocations || autoAllocatePaymentFIFO(
      pr.partnerId,
      pr.amount,
      INVOICE_TYPES.PAYABLE,
      this.state.invoices
    );

    const paymentData = {
      paymentNumber,
      type,
      paymentMethod,
      voucherType: isCash ? "PAYMENT_CASH" : "PAYMENT_BANK",
      partnerId: pr.partnerId,
      partnerName: pr.partnerName,
      paymentDate: voucherOptions.paymentDate || new Date().toISOString().split("T")[0],
      amount: pr.amount,
      bankName: pr.bankName || voucherOptions.bankName || "",
      bankAccount: pr.bankAccount || voucherOptions.bankAccount || "",
      bankAccountHolder: pr.bankAccountHolder || voucherOptions.bankAccountHolder || "",
      notes: voucherOptions.notes || `Chi thanh toán theo ${pr.requestNumber}: ${pr.reason || ''}`.trim(),
      allocations,
      paymentRequestId: pr.id
    };

    const newPayment = this.addPayment(paymentData);

    // Cập nhật trạng thái Giấy Đề Nghị Thanh Toán
    pr.status = PAYMENT_REQUEST_STATUS.PAID;
    pr.paymentId = newPayment.id;
    pr.paidDate = newPayment.paymentDate;
    this.recomputeAndPersist();

    return newPayment;
  }

  // ==========================================
  // SETTINGS & DEMO DATA
  // ==========================================

  updateSettings(newSettings) {
    this.state.settings = {
      ...this.state.settings,
      ...newSettings
    };
    this.recomputeAndPersist();
  }

  loadDemoData() {
    this.applyBranches(StorageService.generateDemoData());
    this.recomputeAndPersist();
  }

  resetAllData() {
    this.applyBranches(null);
    this.recomputeAndPersist();
  }

  // ==========================================
  // TỶ GIÁ THEO NGÀY
  // ==========================================

  /**
   * Gộp danh sách tỷ giá vừa nhập từ Excel vào dữ liệu hiện có (cập nhật đè theo ngày)
   * @param {Array} incomingRates
   * @returns {{added: number, updated: number}}
   */
  importExchangeRates(incomingRates = []) {
    const { rates, added, updated } = ExchangeRateService.merge(this.state.exchangeRates, incomingRates);
    this.state.exchangeRates = rates;
    this.recomputeAndPersist();
    return { added, updated };
  }

  /**
   * Sửa hoặc thêm tỷ giá của một ngày
   * @param {string} date YYYY-MM-DD
   * @param {{krwToVnd?: number|null, usdToVnd?: number|null}} fields
   */
  upsertExchangeRate(date, fields = {}) {
    if (!date) return;
    const { rates } = ExchangeRateService.merge(this.state.exchangeRates, [
      { date, krwToVnd: null, usdToVnd: null, source: "MANUAL", ...fields }
    ]);
    this.state.exchangeRates = rates;
    this.recomputeAndPersist();
  }

  /**
   * Xóa tỷ giá của một ngày
   * @param {string} date YYYY-MM-DD
   */
  deleteExchangeRate(date) {
    this.state.exchangeRates = this.state.exchangeRates.filter(r => r.date !== date);
    this.recomputeAndPersist();
  }

  // ==========================================
  // DANH MỤC DÙNG CHUNG
  // ==========================================

  /**
   * Thêm mới hoặc cập nhật một bản ghi danh mục.
   * @param {string} type shippers | consignees | flights | ports | items
   * @param {Object} entry Không có `id` -> thêm mới
   * @returns {{ok: boolean, error?: string, entry?: Object}}
   */
  upsertCatalogEntry(type, entry) {
    const list = this.state.catalogs[type];
    if (!list) return { ok: false, error: `Không có danh mục "${type}".` };

    const duplicate = findDuplicateEntry(list, entry, type, entry.id || null);
    if (duplicate) {
      return { ok: false, error: `"${duplicate.name || duplicate.code}" đã có trong danh mục.` };
    }

    if (entry.id) {
      this.state.catalogs[type] = list.map(e => (e.id === entry.id ? { ...e, ...entry } : e));
    } else {
      const saved = { ...entry, id: `${type.slice(0, 3).toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
      this.state.catalogs[type] = [...list, saved];
      this.recomputeAndPersist();
      return { ok: true, entry: saved };
    }

    this.recomputeAndPersist();
    return { ok: true, entry };
  }

  /**
   * Xóa một bản ghi danh mục, chặn lại nếu đang được bảng kê hoặc bảng giá dùng.
   * @param {string} type
   * @param {string} id
   * @returns {{ok: boolean, error?: string}}
   */
  deleteCatalogEntry(type, id) {
    const list = this.state.catalogs[type] || [];
    const entry = list.find(e => e.id === id);
    if (!entry) return { ok: false, error: "Không tìm thấy bản ghi." };

    const usage = findCatalogUsage(this.state, type, entry);
    if (usage.count > 0) {
      return {
        ok: false,
        error: `Không xóa được vì đang được dùng ở: ${usage.where.join(', ')}. ` +
               `Sửa các dòng đó trước khi xóa.`
      };
    }

    this.state.catalogs[type] = list.filter(e => e.id !== id);
    this.recomputeAndPersist();
    return { ok: true };
  }

  /**
   * Nạp dữ liệu gợi ý cho danh mục, bỏ qua bản ghi đã có.
   * @returns {{added: number, skipped: number}}
   */
  seedCatalogs() {
    let added = 0;
    let skipped = 0;

    for (const [type, entries] of Object.entries(SEED_CATALOGS)) {
      const list = this.state.catalogs[type] || [];
      const next = [...list];

      for (const entry of entries) {
        if (findDuplicateEntry(next, entry, type)) {
          skipped++;
          continue;
        }
        next.push({ ...entry, id: `${type.slice(0, 3).toUpperCase()}-SEED-${added}-${Math.random().toString(36).slice(2, 7)}` });
        added++;
      }

      this.state.catalogs[type] = next;
    }

    this.recomputeAndPersist();
    return { added, skipped };
  }

  // ==========================================
  // BẢNG GIÁ CƯỚC
  // ==========================================

  /**
   * Thêm mới hoặc cập nhật bảng giá. Mỗi khách hàng chỉ có một bảng giá cho một tuyến.
   * @param {Object} card
   * @returns {{ok: boolean, error?: string, card?: Object}}
   */
  upsertRateCard(card) {
    if (!card.partnerId) return { ok: false, error: "Chưa chọn khách hàng." };
    if (!card.pol || !card.pod) return { ok: false, error: "Chưa chọn tuyến (POL / POD)." };

    const clash = this.state.rateCards.find(rc =>
      rc.id !== card.id &&
      rc.partnerId === card.partnerId &&
      rc.pol === card.pol &&
      rc.pod === card.pod
    );
    if (clash) {
      return { ok: false, error: `Khách hàng này đã có bảng giá cho tuyến ${card.pol} → ${card.pod}.` };
    }

    const partner = this.state.partners.find(p => p.id === card.partnerId);
    const withName = { ...card, partnerName: partner ? partner.name : card.partnerName || "" };

    if (card.id) {
      this.state.rateCards = this.state.rateCards.map(rc => (rc.id === card.id ? { ...rc, ...withName } : rc));
      this.recomputeAndPersist();
      return { ok: true, card: withName };
    }

    const saved = { ...withName, id: `RC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    this.state.rateCards = [...this.state.rateCards, saved];
    this.recomputeAndPersist();
    return { ok: true, card: saved };
  }

  /**
   * Xóa bảng giá. Chặn lại nếu đang có bảng kê tham chiếu.
   * @param {string} id
   * @returns {{ok: boolean, error?: string}}
   */
  deleteRateCard(id) {
    const used = (this.state.manifests || []).filter(m => m.rateCardId === id);
    if (used.length > 0) {
      const names = used.map(m => m.sheetNo || m.id).join(', ');
      return { ok: false, error: `Không xóa được vì đang được dùng ở bảng kê: ${names}.` };
    }

    this.state.rateCards = this.state.rateCards.filter(rc => rc.id !== id);
    this.recomputeAndPersist();
    return { ok: true };
  }
}

export const stateStore = new StateStore();
