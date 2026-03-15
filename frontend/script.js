// ══════════════════════════════════════════════════
// CAMPUSBITES  script.js  v5.0 — Notifications + No Flicker
// ══════════════════════════════════════════════════

// ── Global state ──────────────────────────────────
let menuItems        = [];
let cart             = JSON.parse(localStorage.getItem("cart")) || [];
let selectedCategory = "all";
let currentAdminTab  = "orders";
let revenueChart     = null;
let aoCart           = [];

const API = "https://college-canteen-qr2t.onrender.com";

function getAuthHeaders() {
  // Check both storages — localStorage for "remember me", sessionStorage for session-only
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  return {
    "Authorization": "Bearer " + token,
    "Content-Type":  "application/json",
  };
}

// Helper: get stored user from either storage
function _getStoredUser() {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// Helper: get token from either storage
function _getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

// ── Screenshot URL normalizer ──────────────────────
// Handles all formats the backend might store:
//   "payment_xxx.jpg"              → full URL with /uploads/payments/
//   "uploads/payments/xxx.jpg"     → full URL with leading /
//   "/uploads/payments/xxx.jpg"    → full URL with host
//   "https://render.com/uploads/…" → already full, return as-is
function _resolveScreenshotUrl(raw) {
  if (!raw) return null;
  raw = raw.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/uploads/")) return API + raw;
  if (raw.startsWith("uploads/"))  return API + "/" + raw;
  // bare filename
  return API + "/uploads/payments/" + raw;
}

// ── Safe user name/email extractor ────────────────
// user field may be a populated object, a string ID, or null
function _userName(o) {
  if (!o) return "Student";
  // Walk-in order created by admin
  if (o.customerName && o.customerName.trim()) return o.customerName.trim();
  // Populated user object
  if (o.user && typeof o.user === "object" && o.user.name) return o.user.name.trim();
  // Some backends return userName directly on order
  if (o.userName && o.userName.trim()) return o.userName.trim();
  return "Student";
}
function _userEmail(o) {
  if (o.user && typeof o.user === "object") return o.user.email || "";
  return "";
}
function _userRoll(o) {
  if (o.user && typeof o.user === "object") return o.user.rollNumber || "";
  return "";
}
function _userBranch(o) {
  if (o.user && typeof o.user === "object") return o.user.branch || "";
  return "";
}

// ── Extract UTR from all possible fields ──────────
// Backend stores UTR in different places depending on version:
//   o.paymentUtrNote   — dedicated field (newer)
//   o.utrNumber        — multer form field name
//   o.notes            — embedded as "UTR: 426819200123"
function _extractUtr(o) {
  // Check all possible field names first
  if (o.paymentUtrNote && String(o.paymentUtrNote).trim()) return String(o.paymentUtrNote).trim();
  if (o.utrNumber       && String(o.utrNumber).trim())       return String(o.utrNumber).trim();
  if (o.utr             && String(o.utr).trim())             return String(o.utr).trim();
  // Parse from notes string — matches "UTR: 123", "UTR:123", "UTR 123"
  if (o.notes) {
    const utrMatch = o.notes.match(/UTR\s*[:\-]?\s*([A-Za-z0-9]{8,})/i);
    if (utrMatch) return utrMatch[1];
  }
  return null;
}

// ══════════════════════════════════════════════════
// LUNCH BREAK ENFORCEMENT
// ══════════════════════════════════════════════════
function isLunchBreakNow() {
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 13 * 60 + 10 && mins < 14 * 60;
}

function updateLunchBanner() {
  const banner   = document.getElementById("lunchBanner");
  const placeBtn = document.getElementById("placeOrderBtn");
  const msgEl    = document.getElementById("lunchBannerMsg");
  if (!banner) return;
  if (isLunchBreakNow()) {
    banner.style.display = "flex";
    if (msgEl) msgEl.textContent = "🍽️ Online ordering paused (1:10–2:00 PM) — Visit the canteen counter directly!";
    if (placeBtn) { placeBtn.disabled = true; placeBtn.textContent = "🚫 Visit Canteen (Lunch Break)"; }
  } else {
    banner.style.display = "none";
    if (placeBtn) { placeBtn.disabled = false; placeBtn.textContent = "🎉 Place Order"; }
  }
}

// ══════════════════════════════════════════════════
// SHOW/HIDE PASSWORD
// ══════════════════════════════════════════════════
window.togglePassword = function(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  btn.innerHTML = show
    ? `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
};

// ══════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════
function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className   = `toast show toast-${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3500);
}

// ══════════════════════════════════════════════════
// BROWSER NOTIFICATIONS — shared by admin + student
// ══════════════════════════════════════════════════
let _notifEnabled = false;

// Auto-enable if already granted in a previous session
if (typeof Notification !== "undefined" && Notification.permission === "granted") {
  _notifEnabled = true;
}

// Auto-prompt for permission silently when user is logged in
// Called after login and on DOMContentLoaded if already logged in
async function _autoRequestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") { _notifEnabled = true; return; }
  if (Notification.permission === "denied")  return; // user explicitly denied — don't ask again
  // "default" — ask once
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      _notifEnabled = true;
      _fireNotif("🔔 CampusBites", "You'll now get order status notifications!", "init");
    }
  } catch(e) {}
}

async function requestPushPermission() {
  const btn = document.getElementById("notifBtn");
  if (!("Notification" in window)) { showToast("Notifications not supported on this browser", "error"); return; }
  if (Notification.permission === "denied") {
    showToast("Notifications blocked — enable in browser settings 🔔", "error"); return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") { showToast("Notification permission denied", "error"); return; }
  _notifEnabled = true;
  if (btn) { btn.textContent = "🔔 Notifications ON"; btn.style.background = "#2D6A4F"; }
  showToast("Notifications enabled ✅", "success");
  _fireNotif("🎉 CampusBites", "You will now receive order alerts!", "admin-init");
}

function _fireNotif(title, body, tag) {
  // Always check live permission — don't rely on _notifEnabled flag
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body:  body || "",
      icon:  "/images/upi-qr.PNG",
      badge: "/images/upi-qr.PNG",
      tag:   tag || "cb-" + Date.now(),
      requireInteraction: false,
    });
    // Auto-close after 6 seconds
    setTimeout(() => { try { n.close(); } catch(e) {} }, 6000);
  } catch(e) {
    console.warn("Notification failed:", e);
    // On some browsers (especially mobile), Notification() throws even when permission=granted
    // In that case silently ignore
  }
}

// Debug helper — call from browser console to test: window._testNotif()
window._testNotif = () => _fireNotif("🔔 Test", "Notifications are working!", "test-" + Date.now());

// ── Student notifications — track order status changes ──
// Stores last known status per order so we only fire on actual changes
const _studentOrderStatusCache = new Map();

function _checkStudentOrderNotifs(orders) {
  if (Notification.permission !== "granted") return;
  orders.forEach(o => {
    const prev = _studentOrderStatusCache.get(o._id);
    const cur  = o.status + "|" + (o.paymentStatus || "");
    // First time seeing this order — just record, don't fire
    if (!prev) { _studentOrderStatusCache.set(o._id, cur); return; }
    if (prev !== cur) {
      // Status or payment status changed — fire appropriate notification
      if (o.status === "ready") {
        _fireNotif("🔔 Order Ready!", `Your order #${o._id.slice(-6).toUpperCase()} is ready for pickup!`, "ready-" + o._id);
      } else if (o.status === "confirmed") {
        _fireNotif("✅ Order Confirmed", `Order #${o._id.slice(-6).toUpperCase()} has been confirmed.`, "confirmed-" + o._id);
      } else if (o.status === "preparing") {
        _fireNotif("🍳 Being Prepared", `Order #${o._id.slice(-6).toUpperCase()} is being prepared.`, "preparing-" + o._id);
      } else if (o.status === "delivered") {
        _fireNotif("🎉 Picked Up!", `Order #${o._id.slice(-6).toUpperCase()} marked as delivered.`, "delivered-" + o._id);
      } else if (o.status === "cancelled") {
        _fireNotif("❌ Order Cancelled", `Order #${o._id.slice(-6).toUpperCase()} was cancelled.`, "cancelled-" + o._id);
      }
      // Payment status notifications
      if (o.paymentStatus === "rejected" && !prev.includes("rejected")) {
        _fireNotif("❌ Payment Rejected", `Payment for order #${o._id.slice(-6).toUpperCase()} was rejected. Please re-order.`, "payrej-" + o._id);
      } else if (o.paymentStatus === "paid" && prev.includes("awaiting")) {
        _fireNotif("✅ Payment Approved!", `Your UPI payment for order #${o._id.slice(-6).toUpperCase()} was verified.`, "paypaid-" + o._id);
      }
    }
    _studentOrderStatusCache.set(o._id, cur);
  });
}

// ── Admin notifications — new orders + new payment uploads ──
let _adminLastOrderIds  = null;
let _adminLastPmtIds    = null;

function _checkAdminNewOrderNotifs(orders) {
  if (Notification.permission !== "granted") return;
  const currentIds = new Set(orders.map(o => o._id));
  if (_adminLastOrderIds === null) {
    // First poll — just record IDs, don't fire
    _adminLastOrderIds = new Set(currentIds);
    return;
  }
  // Any brand-new order ID we haven't seen before
  const newOrders = orders.filter(o => !_adminLastOrderIds.has(o._id));
  newOrders.forEach(o => {
    const isCash   = o.paymentMethod === "cash";
    const isOnline = o.paymentMethod === "online";
    const name     = _userName(o);
    if (isCash) {
      _fireNotif(
        `🛎️ New Order — ₹${o.totalAmount}`,
        `${name} placed an order (#${o._id.slice(-6).toUpperCase()}) · Cash on pickup`,
        "new-order-" + o._id
      );
    } else if (isOnline) {
      _fireNotif(
        `💳 New UPI Order — ₹${o.totalAmount}`,
        `${name} placed an order (#${o._id.slice(-6).toUpperCase()}) · Verify payment`,
        "new-upi-" + o._id
      );
    }
  });
  // Update tracked IDs
  _adminLastOrderIds = new Set(currentIds);
}

// Called during payments poll — notify admin of new screenshot uploads
function _checkAdminNewPaymentUploads(orders) {
  if (Notification.permission !== "granted") return;
  const currentPmtIds = new Set(orders.map(o => o._id));
  if (_adminLastPmtIds === null) {
    _adminLastPmtIds = currentPmtIds;
    return;
  }
  const newUploads = orders.filter(o => !_adminLastPmtIds.has(o._id));
  if (newUploads.length > 0) {
    _fireNotif(
      `💳 ${newUploads.length} New Payment${newUploads.length > 1 ? "s" : ""} to Verify!`,
      newUploads.map(o => `#${o._id.slice(-6).toUpperCase()} · ₹${o.totalAmount} · ${o.user?.name || "Student"}`).join("\n"),
      "new-payment-" + Date.now()
    );
  }
  _adminLastPmtIds = currentPmtIds;
}

// ══════════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════════
let _ordersPageInterval  = null;
let _profilePageInterval = null;

function showPage(id) {
  if (_ordersPageInterval)  { clearInterval(_ordersPageInterval);  _ordersPageInterval  = null; }
  if (_profilePageInterval) { clearInterval(_profilePageInterval); _profilePageInterval = null; }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");

  if (id === "adminPage") { loadAdminStats(); setAdminTab("orders"); }
  if (id === "ordersPage") {
    loadMyOrders();
    // Poll every 3 seconds — fast enough for real-time status without hammering server
    _ordersPageInterval = setInterval(() => { if (!document.hidden) loadMyOrders(); }, 3000);
  }
  if (id === "profilePage") {
    loadProfile();
    _profilePageInterval = setInterval(() => { if (!document.hidden) loadProfile(); }, 5000);
  }
  if (id === "mainPage") { renderMenu(); updateCartBadge(); }
}

// ══════════════════════════════════════════════════
// AUTH — LOGIN TYPE
// ══════════════════════════════════════════════════
window.setLoginType = function(type) {
  localStorage.setItem("loginType", type);
  document.getElementById("studentToggle")?.classList.toggle("active", type === "student");
  document.getElementById("adminToggle")?.classList.toggle("active",   type === "admin");
  const lbl = document.getElementById("loginLabel");
  if (lbl) lbl.innerText = "Email";
};

// ══════════════════════════════════════════════════
// AUTH — LOGIN
// ══════════════════════════════════════════════════
async function handleLogin(event) {
  event.preventDefault();
  const email    = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Login failed", "error"); return; }
    const rememberMe = document.getElementById("rememberMe")?.checked ?? true;
    const store = rememberMe ? localStorage : sessionStorage;
    // If switching from remember to no-remember, clear old storage
    if (!rememberMe) localStorage.removeItem("token"), localStorage.removeItem("user");
    else             sessionStorage.removeItem("token"), sessionStorage.removeItem("user");
    store.setItem("token", data.token);
    store.setItem("user",  JSON.stringify(data.user));
    showToast("Welcome back! ✅", "success");
    updateNavbar();
    // Auto-request notification permission for both students and admin
    _autoRequestNotifPermission();
    showPage(data.user.role === "admin" ? "adminPage" : "mainPage");
  } catch { showToast("Network error", "error"); }
}

// ══════════════════════════════════════════════════
// AUTH — REGISTER
// ══════════════════════════════════════════════════
async function handleRegister(e) {
  e.preventDefault();
  const firstName  = document.getElementById("regFirstName").value.trim();
  const lastName   = document.getElementById("regLastName").value.trim();
  const email      = document.getElementById("regEmail").value.trim();
  const phone      = document.getElementById("regPhone")?.value.trim() || "";
  const rollNumber = document.getElementById("regRollNumber")?.value.trim() || "";
  const branch     = document.getElementById("regBranch")?.value || "";
  const password   = document.getElementById("regPassword").value;
  const confirm    = document.getElementById("regConfirmPassword").value;
  if (!rollNumber) { showToast("Roll number is required", "error"); return; }
  if (password !== confirm) { showToast("Passwords do not match", "error"); return; }
  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: firstName + " " + lastName, email, phone, rollNumber, branch, password }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Registration failed", "error"); return; }
    showToast("Account created! Please login ✅", "success");
    setTimeout(() => { document.getElementById("loginId").value = email; showPage("loginPage"); }, 1200);
  } catch { showToast("Network error", "error"); }
}

// ══════════════════════════════════════════════════
// AUTH — NAVBAR & LOGOUT
// ══════════════════════════════════════════════════
function updateNavbar() {
  const user      = _getStoredUser();
  const loginBtn  = document.getElementById("loginBtnNav");
  const logoutBtn = document.getElementById("logoutBtn");
  const ordersBtn = document.getElementById("myOrdersBtn");
  const adminBtn  = document.getElementById("adminBtn");
  const nameEl    = document.getElementById("userNameDisplay");
  const mobileNav = document.getElementById("mobileBottomNav");

  if (!user) {
    if (loginBtn)  loginBtn.style.display  = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (ordersBtn) ordersBtn.style.display = "none";
    if (adminBtn)  adminBtn.style.display  = "none";
    if (mobileNav) mobileNav.style.display = "none";
    return;
  }
  if (loginBtn)  loginBtn.style.display  = "none";
  if (logoutBtn) logoutBtn.style.display = "inline-block";
  if (ordersBtn) ordersBtn.style.display = "inline-block";
  if (nameEl)    nameEl.innerText        = user.name?.split(" ")[0] || "";
  if (adminBtn)  adminBtn.style.display  = user.role === "admin" ? "inline-block" : "none";

  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) profileBtn.style.display = user.role === "user" ? "inline-block" : "none";
  if (mobileNav)  mobileNav.style.display  = user.role === "user" ? "flex" : "none";

  // Update notification button state
  const notifBtn = document.getElementById("notifBtn");
  if (notifBtn && typeof Notification !== "undefined" && Notification.permission === "granted") {
    notifBtn.textContent = "🔔 Notifications ON";
    notifBtn.style.background = "#2D6A4F";
  }
}

function logout() {
  if (_ordersPageInterval)  { clearInterval(_ordersPageInterval);  _ordersPageInterval  = null; }
  if (_profilePageInterval) { clearInterval(_profilePageInterval); _profilePageInterval = null; }
  _studentOrderStatusCache.clear();
  localStorage.clear();
  sessionStorage.clear();
  cart = [];
  const mobileNav = document.getElementById("mobileBottomNav");
  if (mobileNav) mobileNav.style.display = "none";
  showPage("mainPage"); updateNavbar(); updateCartUI(); loadMenu();
}

// ══════════════════════════════════════════════════
// PROFILE PAGE
// ══════════════════════════════════════════════════
async function loadProfile() {
  const content = document.getElementById("profileContent");
  const user    = _getStoredUser();
  if (!content || !user) return;

  if (!content.querySelector(".profile-card")) {
    content.innerHTML = "<p style='text-align:center;padding:2rem;opacity:0.5;'>Loading profile...</p>";
  }

  try {
    const [meRes, ordRes] = await Promise.all([
      fetch(`${API}/api/auth/me`, { headers: getAuthHeaders() }),
      fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() }),
    ]);
    const u      = (await meRes.json()).user || user;
    const orders = (await ordRes.json()).orders || [];

    const delivered = orders.filter(o => o.status === "delivered");
    const spent     = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const active    = orders.filter(o => ["pending","confirmed","preparing","ready"].includes(o.status));

    if (!content.querySelector(".profile-card")) {
      content.innerHTML = _buildProfileHTML(u, orders, delivered, spent, active);
      return;
    }

    _patchText("prof-name",           u.name);
    _patchText("prof-email",          u.email);
    _patchText("prof-roll",           u.rollNumber ? `🎓 ${u.rollNumber}${u.branch ? " · " + u.branch : ""}` : "");
    _patchText("prof-phone",          u.phone ? `📞 ${u.phone}` : "");
    _patchText("prof-stat-total",     String(orders.length));
    _patchText("prof-stat-spent",     `₹${spent.toLocaleString("en-IN")}`);
    _patchText("prof-stat-completed", String(delivered.length));

    const pill = document.getElementById("prof-active-pill");
    if (pill) pill.textContent = active.length > 0 ? `⏳ ${active.length} order${active.length > 1 ? "s" : ""} active` : "";

    const recentList = document.getElementById("prof-recent-orders");
    if (recentList) recentList.innerHTML = _buildRecentOrders(orders);

  } catch (err) {
    console.error("loadProfile:", err);
    if (!content.querySelector(".profile-card"))
      content.innerHTML = "<p style='padding:2rem;'>Failed to load. <button class='btn-secondary' onclick='loadProfile()'>Retry</button></p>";
  }
}

function _patchText(id, val) {
  const el = document.getElementById(id);
  if (el && el.textContent !== val) el.textContent = val;
}

function _buildRecentOrders(orders) {
  if (!orders.length) return "<p style='opacity:0.5;padding:1rem 0;'>No orders yet 📋</p>";
  return orders.slice(0, 5).map(o => `
    <div class="order-card" style="margin-bottom:0.75rem;" data-oid="${o._id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <b>#${o._id.slice(-6).toUpperCase()}</b>
        <span class="order-status ${o.status}">${STATUS_EMOJI[o.status]||""} ${o.status.toUpperCase()}</span>
      </div>
      <p style="margin:0 0 6px;font-size:0.88rem;opacity:0.8;">${o.items.map(i=>`${i.name} × ${i.quantity}`).join(" • ")}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <span style="font-weight:700;">₹${o.totalAmount}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" style="padding:5px 12px;font-size:0.8rem;" onclick="reorder('${o._id}')">🔁 Reorder</button>
          ${["pending","confirmed"].includes(o.status) ? `<button class="btn-primary" style="padding:5px 12px;font-size:0.8rem;background:#e63946;" onclick="cancelOrder('${o._id}')">❌ Cancel</button>` : ""}
        </div>
      </div>
    </div>`).join("");
}

function _buildProfileHTML(u, orders, delivered, spent, active) {
  return `
    <div class="profile-card">
      <div class="profile-avatar">${(u.name || "U")[0].toUpperCase()}</div>
      <h2 class="profile-name" id="prof-name">${u.name}</h2>
      <p class="profile-email" id="prof-email">${u.email}</p>
      <p id="prof-roll" style="font-size:0.85rem;color:#f97316;font-family:monospace;margin:4px 0;">
        ${u.rollNumber ? `🎓 ${u.rollNumber}${u.branch ? " · " + u.branch : ""}` : ""}
      </p>
      <p id="prof-phone" style="font-size:0.85rem;opacity:0.6;margin:2px 0;">
        ${u.phone ? `📞 ${u.phone}` : ""}
      </p>
      <div id="prof-active-pill" style="display:inline-block;margin-top:8px;background:rgba(249,115,22,0.15);color:#f97316;border:1px solid rgba(249,115,22,0.3);border-radius:99px;padding:4px 14px;font-size:0.82rem;">
        ${active.length > 0 ? `⏳ ${active.length} order${active.length>1?"s":""} active` : ""}
      </div>
      <div class="profile-stats" style="margin-top:1.2rem;">
        <div class="pstat"><h3 id="prof-stat-total">${orders.length}</h3><p>Total Orders</p></div>
        <div class="pstat"><h3 id="prof-stat-spent">₹${spent.toLocaleString("en-IN")}</h3><p>Amount Spent</p></div>
        <div class="pstat"><h3 id="prof-stat-completed">${delivered.length}</h3><p>Completed</p></div>
      </div>
      <button class="btn-primary" style="margin-top:1.5rem;width:100%;" onclick="showPage('ordersPage')">📋 View All Orders</button>
    </div>
    <h3 style="margin:1.8rem 0 0.8rem;">🔁 Recent Orders</h3>
    <div id="prof-recent-orders">${_buildRecentOrders(orders)}</div>`;
}

async function reorder(orderId) {
  try {
    const res  = await fetch(`${API}/api/orders/${orderId}`, { headers: getAuthHeaders() });
    const data = await res.json();
    const o    = data.order;
    if (!o) return;
    o.items.forEach(item => {
      const existing = cart.find(c => c._id === (item.menuItem?._id || item.menuItem));
      if (existing) existing.qty += item.quantity;
      else cart.push({ _id: item.menuItem?._id || item.menuItem, name: item.name, price: item.price, qty: item.quantity });
    });
    saveCart(); updateCartUI();
    showToast("Items added to cart 🛒", "success");
    showPage("mainPage"); openCart();
  } catch { showToast("Failed to reorder", "error"); }
}

// ══════════════════════════════════════════════════
// MENU — LOAD & RENDER
// ══════════════════════════════════════════════════
async function loadMenu() {
  try {
    const res  = await fetch(`${API}/api/menu`);
    const data = await res.json();
    menuItems  = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
    renderCategories(); renderMenu();
  } catch {
    const g = document.getElementById("menuGrid");
    if (g) g.innerHTML = "<p style='text-align:center;padding:2rem;'>Failed to load menu. Please refresh.</p>";
  }
}

function renderCategories() {
  const container = document.getElementById("categories");
  if (!container) return;
  const cats = ["all", ...new Set(menuItems.filter(i => i.category).map(i => i.category.toLowerCase()))];
  container.innerHTML = cats.map(cat => `
    <button class="category-btn ${cat === selectedCategory ? "active" : ""}" onclick="selectCategory('${cat}')">
      ${cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
    </button>`).join("");
}

function selectCategory(cat) { selectedCategory = cat; renderCategories(); renderMenu(); }

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  if (!grid) return;
  const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  let filtered = menuItems.filter(i => i.isAvailable !== false);
  if (selectedCategory !== "all") filtered = filtered.filter(i => i.category?.toLowerCase() === selectedCategory);
  if (search) filtered = filtered.filter(i =>
    i.name.toLowerCase().includes(search) || (i.description || "").toLowerCase().includes(search));

  if (!filtered.length) { grid.innerHTML = `<p style="text-align:center;padding:2rem;">No items found 🍽️</p>`; return; }

  grid.innerHTML = "";
  filtered.forEach(item => {
    const qty  = cart.find(c => c._id === item._id)?.qty || 0;
    const card = document.createElement("div");
    card.className = "menu-card";
    card.innerHTML = `
      <img src="${item.image || "https://via.placeholder.com/300x200?text=🍽️"}"
           alt="${item.name}" loading="lazy"
           onerror="this.src='https://via.placeholder.com/300x200?text=🍽️'"/>
      <div class="menu-card-body">
        <h3>${item.name}</h3>
        <p class="menu-card-desc">${item.description || ""}</p>
        ${item.preparationTime ? `<span class="prep-time">⏱ ${item.preparationTime} min</span>` : ""}
        <div class="menu-footer">
          <span class="price">₹${item.price}</span>
          <div class="qty-controls">
            <button class="qty-btn minus" onclick="decreaseItem('${item._id}',this)" ${qty===0?"disabled":""}>−</button>
            <span class="qty">${qty}</span>
            <button class="qty-btn plus"  onclick="increaseItem('${item._id}',this)">+</button>
          </div>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ══════════════════════════════════════════════════
// CART
// ══════════════════════════════════════════════════
function increaseItem(id, btn) {
  const item = menuItems.find(i => i._id === id);
  if (!item) return;
  const ex = cart.find(c => c._id === id);
  if (ex) ex.qty++; else cart.push({ ...item, qty: 1 });
  if (btn) { btn.classList.add("added"); setTimeout(() => btn.classList.remove("added"), 300); }
  saveCart(); updateCartUI(); renderMenu();
  showToast(`${item.name} added 🛒`, "success");
}

function decreaseItem(id, btn) {
  const ex = cart.find(c => c._id === id);
  if (!ex) return;
  ex.qty--;
  if (ex.qty <= 0) cart = cart.filter(c => c._id !== id);
  if (btn) { btn.classList.add("added"); setTimeout(() => btn.classList.remove("added"), 300); }
  saveCart(); updateCartUI(); renderMenu();
}

function removeFromCart(id) { cart = cart.filter(i => i._id !== id); saveCart(); updateCartUI(); renderMenu(); }
function saveCart()          { localStorage.setItem("cart", JSON.stringify(cart)); }
function getCartTotal()      { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function updateCartBadge() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  const b = document.getElementById("cartBadge");
  const m = document.getElementById("mobCartBadge");
  if (b) b.textContent = n;
  if (m) m.textContent = n;
}

function updateCartUI() {
  const cartBody   = document.getElementById("cartBody");
  const cartBadge  = document.getElementById("cartBadge");
  const subtotalEl = document.getElementById("cartSubtotal");
  const totalEl    = document.getElementById("cartTotal");
  const summary    = document.getElementById("cartSummary");
  if (!cartBadge) return;

  const total = cart.reduce((s, i) => s + i.qty, 0);
  cartBadge.textContent = total;
  const mobBadge = document.getElementById("mobCartBadge");
  if (mobBadge) mobBadge.textContent = total;

  if (!cartBody) return;
  if (!cart.length) {
    cartBody.innerHTML = "<p style='text-align:center;padding:1.5rem;opacity:0.6;'>Your cart is empty 🛒</p>";
    if (summary) summary.style.display = "none";
    return;
  }
  if (summary) summary.style.display = "block";

  let subtotal = 0;
  cartBody.innerHTML = cart.map(item => {
    subtotal += item.price * item.qty;
    return `
      <div class="cart-item">
        <span>${item.name} × ${item.qty}</span>
        <span>₹${item.price * item.qty}</span>
        <button onclick="removeFromCart('${item._id}')" aria-label="Remove">❌</button>
      </div>`;
  }).join("");
  if (subtotalEl) subtotalEl.textContent = "₹" + subtotal;
  if (totalEl)    totalEl.textContent    = "₹" + subtotal;
  updateLunchBanner();
}

function openCart()  { document.getElementById("cartModal")?.classList.add("active"); updateCartUI(); updateLunchBanner(); }
function closeCart() { document.getElementById("cartModal")?.classList.remove("active"); }

// ══════════════════════════════════════════════════
// PLACE ORDER
// ══════════════════════════════════════════════════
async function placeOrder() {
  if (isLunchBreakNow()) { showToast("🚫 Ordering blocked during lunch break.", "error"); return; }
  if (!cart.length) { showToast("Cart is empty", "error"); return; }
  if (!_getToken()) { showToast("Please login first", "error"); showPage("loginPage"); return; }

  const pickupTime    = document.getElementById("pickupTime")?.value;
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || "online";
  if (!pickupTime) { showToast("Please select a pickup time", "error"); return; }

  if (paymentMethod === "online") openUpiModal(pickupTime);
  else                            await placeOrderCash(pickupTime);
}

async function placeOrderCash(pickupTime) {
  const btn = document.getElementById("placeOrderBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Placing..."; }
  try {
    const res  = await fetch(`${API}/api/orders`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({
        items: cart.map(i => ({ menuItem: i._id, quantity: i.qty })),
        pickupTime, paymentMethod: "cash", notes: `Pickup: ${pickupTime}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Order failed", "error"); return; }
    showToast("Order placed! Pay at pickup 💵", "success");
    cart = []; saveCart(); updateCartUI(); closeCart();
  } catch { showToast("Network error", "error"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "🎉 Place Order"; } }
}

// ══════════════════════════════════════════════════
// UPI PAYMENT FLOW
// ══════════════════════════════════════════════════
const UPI_ID = "9440487580@upi";

let _upiPickupTime     = "";
let _upiPendingOrder   = null;
let _upiScreenshotFile = null;

function openUpiModal(pickupTime) {
  _upiPickupTime = pickupTime; _upiPendingOrder = null; _upiScreenshotFile = null;
  document.getElementById("upiStep1").style.display = "block";
  document.getElementById("upiStep2").style.display = "none";
  document.getElementById("upiAmountDisplay").textContent = "₹" + getCartTotal();
  document.getElementById("upiIdDisplay").textContent     = UPI_ID;
  document.getElementById("upiUtrInput").value            = "";
  document.getElementById("upiScreenshotPreview").style.display = "none";
  document.getElementById("upiDropLabel").style.display   = "block";
  document.getElementById("upiScreenshotInput").value     = "";
  const btn = document.getElementById("upiConfirmBtn");
  if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }
  document.getElementById("upiModal").classList.add("active");
}

function closeUpiModal() { document.getElementById("upiModal").classList.remove("active"); }

function previewUpiScreenshot(input) {
  const file = input.files[0]; if (!file) return;
  _upiScreenshotFile = file;
  const prev = document.getElementById("upiScreenshotPreview");
  const lbl  = document.getElementById("upiDropLabel");
  prev.src = URL.createObjectURL(file); prev.style.display = "block"; lbl.style.display = "none";
}

function handleUpiDrop(event) {
  event.preventDefault();
  document.getElementById("upiDropZone").style.borderColor = "rgba(249,115,22,0.4)";
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    _upiScreenshotFile = file;
    const prev = document.getElementById("upiScreenshotPreview");
    const lbl  = document.getElementById("upiDropLabel");
    prev.src = URL.createObjectURL(file); prev.style.display = "block"; lbl.style.display = "none";
  }
}

async function submitUpiPayment() {
  if (!_upiScreenshotFile) { showToast("Please upload your payment screenshot 📷", "error"); return; }
  const btn = document.getElementById("upiConfirmBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Placing order..."; }
  try {
    const orderRes = await fetch(`${API}/api/orders`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({
        items: cart.map(i => ({ menuItem: i._id, quantity: i.qty })),
        pickupTime: _upiPickupTime, paymentMethod: "online",
        notes: `UPI Payment${document.getElementById("upiUtrInput").value ? " · UTR: " + document.getElementById("upiUtrInput").value : ""} · Pickup: ${_upiPickupTime}`,
      }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      showToast(orderData.error || "Order failed", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }
      return;
    }
    _upiPendingOrder = orderData.order;
    if (btn) btn.textContent = "Uploading screenshot...";
    const formData = new FormData();
    formData.append("screenshot", _upiScreenshotFile);
    formData.append("utrNumber",  document.getElementById("upiUtrInput").value || "");
    const uploadRes  = await fetch(`${API}/api/orders/${_upiPendingOrder._id}/upload-payment`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + _getToken() },
      body: formData,
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      showToast(uploadData.error || "Upload failed", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }
      return;
    }
    cart = []; saveCart(); updateCartUI(); closeCart();
    document.getElementById("upiStep1").style.display = "none";
    document.getElementById("upiStep2").style.display = "block";
  } catch (err) {
    showToast("Network error: " + err.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }
  }
}

// ══════════════════════════════════════════════════
// MY ORDERS — diff-patch, no flicker, with notifications
// ══════════════════════════════════════════════════
const STATUS_EMOJI = { pending:"⏳", confirmed:"✅", preparing:"🍳", ready:"🔔", delivered:"🎉", cancelled:"❌" };
const _myOrdersCache = new Map();

// Prevent concurrent fetches on the orders page
let _myOrdersFetching = false;

async function loadMyOrders() {
  if (_myOrdersFetching) return;
  _myOrdersFetching = true;

  const list = document.getElementById("ordersList");
  if (!list) { _myOrdersFetching = false; return; }

  // Only show skeleton on very first load
  if (!list.querySelector(".order-card") && !list.querySelector(".orders-empty")) {
    list.innerHTML = "<p id='orders-loading' style='text-align:center;opacity:0.5;'>Loading...</p>";
  }

  try {
    const res    = await fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const orders = data.orders || [];

    // Fire student notifications for any status changes
    _checkStudentOrderNotifs(orders);

    if (!orders.length) {
      if (!list.querySelector(".orders-empty")) {
        list.innerHTML = "<p class='orders-empty' style='text-align:center;padding:2rem;'>No orders yet 📋</p>";
        _myOrdersCache.clear();
      }
      _myOrdersFetching = false;
      return;
    }

    document.getElementById("orders-loading")?.remove();

    const incomingIds = new Set(orders.map(o => o._id));

    // Remove cards for cancelled/deleted orders
    list.querySelectorAll(".order-card[data-oid]").forEach(card => {
      if (!incomingIds.has(card.dataset.oid)) card.remove();
    });

    orders.forEach((o, idx) => {
      const existing  = list.querySelector(`.order-card[data-oid="${o._id}"]`);
      const active    = ["pending","confirmed","preparing","ready"].includes(o.status);
      const isOnline  = o.paymentMethod === "online";
      const isPending = o.paymentStatus === "awaiting_verification";

      let payLabel = isOnline ? "💳 UPI" : "💵 Cash";
      if (isOnline && isPending)                       payLabel = "⏳ Payment verifying...";
      else if (isOnline && o.paymentStatus === "paid") payLabel = "✅ UPI Paid";
      else if (o.paymentStatus === "rejected")         payLabel = "❌ Payment rejected";

      const cacheKey = o.status + "|" + (o.paymentStatus || "");

      if (!existing) {
        // New card — build and insert in correct position
        const div  = document.createElement("div");
        div.innerHTML = _buildMyOrderCard(o, active, payLabel);
        const card = div.firstElementChild;
        list.insertBefore(card, list.children[idx] || null);
        _myOrdersCache.set(o._id, cacheKey);
      } else {
        // Existing card — only patch what changed, never rebuild
        if (_myOrdersCache.get(o._id) !== cacheKey) {
          const badge = existing.querySelector(".order-status");
          if (badge) { badge.className = `order-status ${o.status}`; badge.textContent = `${STATUS_EMOJI[o.status]||""} ${o.status.toUpperCase()}`; }
          const payEl = existing.querySelector(".pay-label-inline");
          if (payEl) payEl.textContent = payLabel;
          const btnRow = existing.querySelector(".order-btn-row");
          if (btnRow) btnRow.innerHTML = _buildMyOrderButtons(o, active);
          _myOrdersCache.set(o._id, cacheKey);
        }
        // unchanged → zero DOM work — no flicker
      }
    });

  } catch { /* silent — don't wipe UI on network blip */ }
  finally { _myOrdersFetching = false; }
}

function _buildMyOrderCard(o, active, payLabel) {
  const user = (_getStoredUser() || {});
  return `
    <div class="order-card ${active ? "order-card-active" : ""}" data-oid="${o._id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div>
          <b style="font-size:1rem;">#${o._id.slice(-6).toUpperCase()}</b>
          <span style="font-size:0.78rem;opacity:0.5;margin-left:8px;">${new Date(o.createdAt).toLocaleString()}</span>
        </div>
        <span class="order-status ${o.status}">${STATUS_EMOJI[o.status]||""} ${o.status.toUpperCase()}</span>
      </div>
      <p style="font-size:0.82rem;opacity:0.6;margin-bottom:6px;">👤 ${user.name || "You"}</p>
      <p style="font-size:0.9rem;margin-bottom:6px;">${o.items.map(i=>`${i.name} × ${i.quantity}`).join(" • ")}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
        <span style="font-weight:700;">₹${o.totalAmount}</span>
        <span class="pay-label-inline" style="font-size:0.78rem;opacity:0.65;">${payLabel}</span>
      </div>
      ${o.notes ? `<p style="font-size:0.8rem;opacity:0.5;margin-top:2px;">📝 ${o.notes}</p>` : ""}
      <div class="order-btn-row" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        ${_buildMyOrderButtons(o, active)}
      </div>
    </div>`;
}

function _buildMyOrderButtons(o, active) {
  return `
    ${active ? `<button class="btn-primary" style="flex:1;padding:8px;" onclick="trackOrder('${o._id}')">📍 Track</button>` : ""}
    ${["pending","confirmed"].includes(o.status) ? `<button class="btn-secondary" style="padding:8px 14px;" onclick="cancelOrder('${o._id}')">❌ Cancel</button>` : ""}
    <button class="btn-secondary" style="padding:8px 14px;" onclick="reorder('${o._id}')">🔁 Reorder</button>`;
}

async function cancelOrder(id) {
  try {
    const res  = await fetch(`${API}/api/orders/${id}/cancel`, { method: "PATCH", headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Cannot cancel", "error"); return; }
    showToast("Order cancelled", "info");
    loadMyOrders();
  } catch { showToast("Network error", "error"); }
}

// ══════════════════════════════════════════════════
// ADMIN — STATS DASHBOARD
// ══════════════════════════════════════════════════
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(val)) el.textContent = val;
}

function _buildStatsSkeleton() {
  const defs = [
    { container: "adminStats",   cards: [
      { id: "stat-pending",   icon: "⏳", label: "Pending" },
      { id: "stat-preparing", icon: "🍳", label: "Preparing" },
      { id: "stat-ready",     icon: "🔔", label: "Ready" },
      { id: "stat-users",     icon: "👥", label: "Students" },
    ]},
    { container: "dailyStats",   cards: [
      { id: "stat-todayOrders", icon: "📋", label: "Today Orders",  cls: "stat-today" },
      { id: "stat-todayRev",    icon: "💰", label: "Today Revenue", cls: "stat-today" },
    ]},
    { container: "monthlyStats", cards: [
      { id: "stat-monthOrders", icon: "📅", label: "This Month Orders",  cls: "stat-month" },
      { id: "stat-monthRev",    icon: "💵", label: "This Month Revenue", cls: "stat-month" },
    ]},
    { container: "allTimeStats", cards: [
      { id: "stat-totalOrders", icon: "📦", label: "All Orders",    cls: "stat-total" },
      { id: "stat-totalRev",    icon: "🏆", label: "Total Revenue", cls: "stat-total" },
      { id: "stat-menuItems",   icon: "🍽️", label: "Menu Items",   cls: "stat-total" },
    ]},
  ];
  defs.forEach(({ container, cards }) => {
    const el = document.getElementById(container);
    if (!el || el.dataset.built) return;
    el.innerHTML = cards.map(c =>
      `<div class="stat-card ${c.cls||''}">
        <div class="stat-icon">${c.icon}</div>
        <h2 id="${c.id}">—</h2>
        <p>${c.label}</p>
      </div>`).join("");
    el.dataset.built = "1";
  });
}

async function loadAdminStats() {
  _buildStatsSkeleton();
  try {
    const res  = await fetch(`${API}/api/admin/dashboard`, { headers: getAuthHeaders() });
    const data = await res.json();
    const s    = data.stats || {};
    _setText("stat-pending",     s.pendingOrders   || 0);
    _setText("stat-preparing",   s.preparingOrders || 0);
    _setText("stat-ready",       s.readyOrders     || 0);
    _setText("stat-users",       s.totalUsers      || 0);
    _setText("stat-todayOrders", s.todayOrders     || 0);
    _setText("stat-todayRev",   "₹" + (s.todayRevenue  || 0));
    _setText("stat-monthOrders", s.monthOrders     || 0);
    _setText("stat-monthRev",   "₹" + (s.monthRevenue  || 0));
    _setText("stat-totalOrders", s.totalOrders     || 0);
    _setText("stat-totalRev",   "₹" + (s.totalRevenue  || 0));
    _setText("stat-menuItems",   s.totalMenuItems  || 0);
    renderRevenueChart(s.monthlyBreakdown || []);
    renderMonthlyTable(s.monthlyBreakdown || []);
  } catch(err) { console.error("Stats error", err); }
}

const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function renderRevenueChart(breakdown) {
  const canvas = document.getElementById("revenueChart");
  if (!canvas) return;
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  revenueChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels:   breakdown.map(d => `${MONTH_NAMES[d._id.month]} ${d._id.year}`),
      datasets: [
        { label: "Revenue ₹", data: breakdown.map(d => d.totalRevenue), backgroundColor: "rgba(249,115,22,0.75)", borderColor: "#f97316", borderWidth: 2, borderRadius: 6, yAxisID: "y" },
        { label: "Orders", data: breakdown.map(d => d.totalOrders), type: "line", borderColor: "#048A81", backgroundColor: "rgba(4,138,129,0.1)", borderWidth: 3, tension: 0.4, fill: true, pointRadius: 5, yAxisID: "y1" },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "top" }, tooltip: { callbacks: { label: ctx => ctx.dataset.label === "Revenue ₹" ? ` ₹${ctx.parsed.y}` : ` ${ctx.parsed.y} orders` } } },
      scales: {
        y:  { beginAtZero: true, position: "left",  title: { display: true, text: "Revenue (₹)" } },
        y1: { beginAtZero: true, position: "right", title: { display: true, text: "Orders" }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

function renderMonthlyTable(breakdown) {
  const body = document.getElementById("monthlyBody");
  if (!body) return;
  body.innerHTML = breakdown.length
    ? breakdown.map(d => `<tr><td>${MONTH_NAMES[d._id.month]} ${d._id.year}</td><td>${d.totalOrders}</td><td>₹${d.totalRevenue.toLocaleString()}</td></tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center;opacity:0.5;">No completed orders yet</td></tr>`;
}

// ══════════════════════════════════════════════════
// ADMIN — ORDERS PIPELINE
// Only shows orders with paymentStatus = "paid" OR paymentMethod = "cash"
// Fully flicker-free: diffs by ID, never wipes the container
// ══════════════════════════════════════════════════
const _ordersCache           = new Map();
let   _adminOrdersRendering  = false;

function _buildOrderCard(o, next, btnLabel, color) {
  const displayName = _userName(o);
  const email       = _userEmail(o);
  const walkinBadge = o.createdByAdmin ? '<span class="badge-walkin">Walk-in</span>' : "";
  const payLabel    = o.paymentMethod === "online" ? "💳 UPI (Paid)" : "💵 Cash";
  // UTR number if available
  const utrLine = o.paymentUtrNote
    ? `<p style="font-size:0.75rem;color:#f97316;margin:2px 0;">🔖 UTR: ${o.paymentUtrNote}</p>`
    : "";

  return `
    <div class="order-card" id="order-${o._id}" data-status="${o.status}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:8px;">
        <div>
          <span style="font-size:0.68rem;opacity:0.4;display:block;letter-spacing:0.5px;">ORDER ID</span>
          <b style="font-size:1.05rem;letter-spacing:0.5px;">#${o._id.slice(-6).toUpperCase()}</b>
        </div>
        <span class="order-status ${o.status}">${o.status.toUpperCase()}</span>
      </div>
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
        <p style="font-size:0.95rem;font-weight:700;margin:0;color:#fff;">👤 ${displayName} ${walkinBadge}</p>
        ${o.user?.rollNumber ? `<p style="font-size:0.78rem;font-family:monospace;color:#f97316;margin:3px 0 0;">🎓 ${o.user.rollNumber}${o.user.branch ? " · " + o.user.branch : ""}</p>` : ""}
        ${email ? `<p style="font-size:0.72rem;opacity:0.45;margin:2px 0 0;">${email}</p>` : ""}
      </div>
      <p style="font-size:0.72rem;opacity:0.45;margin:0 0 4px;">${new Date(o.createdAt).toLocaleTimeString()} · ${payLabel}</p>
      ${utrLine}
      <hr style="opacity:0.12;margin:4px 0 8px;"/>
      ${o.items.map(i => `
        <div style="display:flex;justify-content:space-between;font-size:0.88rem;padding:3px 0;">
          <span>• ${i.name} × ${i.quantity}</span>
          <span style="opacity:0.75;">₹${i.price * i.quantity}</span>
        </div>`).join("")}
      <p style="font-weight:700;font-size:1rem;margin:8px 0 0;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
        Total: ₹${o.totalAmount}
      </p>
      ${o.notes ? `<p style="font-size:0.78rem;opacity:0.5;margin-top:4px;">📝 ${o.notes}</p>` : ""}
      <button class="order-action-btn" style="background:${color};margin-top:12px;width:100%;"
        onclick="updateOrderStatus('${o._id}','${next}',this)">
        ${btnLabel}
      </button>
    </div>`;
}

function _ensureSection(container, id, title, icon, color) {
  let section = document.getElementById(`section-${id}`);
  if (!section) {
    section = document.createElement("div");
    section.className = "order-section";
    section.id        = `section-${id}`;
    section.innerHTML = `
      <h3 class="order-section-title" style="color:${color};">${icon} ${title} <span class="section-count" id="count-${id}">0</span></h3>
      <div class="orders-grid" id="grid-${id}"></div>`;
    container.appendChild(section);
  }
  return section;
}

function _animateCardIn(card, grid) {
  card.style.opacity = "0"; card.style.transform = "scale(0.95)";
  grid.appendChild(card);
  requestAnimationFrame(() => {
    card.style.transition = "opacity 0.25s, transform 0.25s";
    card.style.opacity    = "1";
    card.style.transform  = "scale(1)";
  });
}

function _animateCardOut(card, cb) {
  card.style.transition = "opacity 0.25s, transform 0.25s";
  card.style.opacity    = "0";
  card.style.transform  = "scale(0.88)";
  setTimeout(() => { card.remove(); if (cb) cb(); }, 260);
}

const _laneOf = status => {
  if (["pending","confirmed"].includes(status)) return "new";
  if (status === "preparing")                   return "preparing";
  if (status === "ready")                       return "ready";
  return null;
};

async function loadAdminOrders() {
  if (_adminOrdersRendering) return;
  _adminOrdersRendering = true;

  const container = document.getElementById("adminContent");
  if (!container) { _adminOrdersRendering = false; return; }
  if (container.dataset.tab && container.dataset.tab !== "orders") { _adminOrdersRendering = false; return; }
  container.dataset.tab = "orders";

  try {
    const res  = await fetch(`${API}/api/admin/orders?limit=100`, { headers: getAuthHeaders() });
    const data = await res.json();

    // ── KEY FILTER: only show orders where payment is confirmed ──
    // Cash orders (including admin walk-ins) always shown.
    // Online/UPI orders only shown after admin approves (paymentStatus === "paid").
    const allOrders = (data.orders || []).filter(o => _laneOf(o.status));
    const active    = allOrders.filter(o =>
      o.paymentMethod === "cash" ||
      o.createdByAdmin === true  ||
      o.paymentStatus  === "paid"
    );

    // Fire admin new-order notifications
    _checkAdminNewOrderNotifs(active);

    const laneConfig = {
      new:       { title: "New Orders",   icon: "⏳", color: "#f97316", next: "preparing", label: "🍳 Start Preparing" },
      preparing: { title: "Preparing",    icon: "🍳", color: "#0d6efd", next: "ready",     label: "🔔 Mark Ready"      },
      ready:     { title: "Ready Pickup", icon: "🔔", color: "#048A81", next: "delivered", label: "🎉 Delivered"        },
    };

    if (!active.length) {
      if (!container.querySelector(".orders-empty")) {
        container.innerHTML = '<div class="orders-empty" style="text-align:center;padding:3rem;opacity:0.4;font-size:1.3rem;">🎉 No active orders right now</div>';
        _ordersCache.clear();
      }
      _adminOrdersRendering = false;
      return;
    }

    // If switching from empty state, reset
    if (container.querySelector(".orders-empty") || !container.querySelector(".order-section")) {
      container.innerHTML = "";
      _ordersCache.clear();
    }

    const activeIds = new Set(active.map(o => o._id));

    // Remove gone orders
    _ordersCache.forEach((cached, oid) => {
      if (!activeIds.has(oid)) {
        const card = document.getElementById(`order-${oid}`);
        if (card) _animateCardOut(card);
        _ordersCache.delete(oid);
      }
    });

    // Ensure all lane sections exist (idempotent)
    Object.entries(laneConfig).forEach(([id, cfg]) => _ensureSection(container, id, cfg.title, cfg.icon, cfg.color));

    // Process each order
    active.forEach(o => {
      const newLane      = _laneOf(o.status);
      const cfg          = laneConfig[newLane];
      const grid         = document.getElementById(`grid-${newLane}`);
      if (!grid) return;
      const cached       = _ordersCache.get(o._id);
      const existingCard = document.getElementById(`order-${o._id}`);

      if (!existingCard && !cached) {
        // Brand new
        const div = document.createElement("div");
        div.innerHTML = _buildOrderCard(o, cfg.next, cfg.label, cfg.color);
        _animateCardIn(div.firstElementChild, grid);
        _ordersCache.set(o._id, { status: o.status, lane: newLane });

      } else if (existingCard && cached) {
        if (cached.status !== o.status || cached.lane !== newLane) {
          if (cached.lane !== newLane) {
            // Move to new lane
            _animateCardOut(existingCard, () => {
              const div = document.createElement("div");
              div.innerHTML = _buildOrderCard(o, cfg.next, cfg.label, cfg.color);
              _animateCardIn(div.firstElementChild, grid);
            });
          } else {
            // Same lane — patch badge only, no rebuild
            const badge = existingCard.querySelector(".order-status");
            if (badge) { badge.className = `order-status ${o.status}`; badge.textContent = o.status.toUpperCase(); }
            existingCard.dataset.status = o.status;
          }
          _ordersCache.set(o._id, { status: o.status, lane: newLane });
        }
        // unchanged → zero DOM work
      } else if (!existingCard && cached) {
        // Cache stale, DOM gone — rebuild
        const div = document.createElement("div");
        div.innerHTML = _buildOrderCard(o, cfg.next, cfg.label, cfg.color);
        _animateCardIn(div.firstElementChild, grid);
        _ordersCache.set(o._id, { status: o.status, lane: newLane });
      }
    });

    // Update section counts & visibility
    Object.keys(laneConfig).forEach(id => {
      const section = document.getElementById(`section-${id}`);
      const grid    = document.getElementById(`grid-${id}`);
      const countEl = document.getElementById(`count-${id}`);
      if (!section) return;
      const count = grid ? grid.querySelectorAll(".order-card").length : 0;
      if (countEl) countEl.textContent = count;
      section.style.display = count > 0 ? "block" : "none";
    });

  } catch(err) { console.error("loadAdminOrders:", err); }
  finally { _adminOrdersRendering = false; }
}

async function updateOrderStatus(id, status, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Updating..."; }

  // ── Optimistic instant UI update ──
  // Move / remove the card immediately so admin sees instant feedback
  const laneConfig = {
    new:       { title: "New Orders",   icon: "⏳", color: "#f97316", next: "preparing", label: "🍳 Start Preparing" },
    preparing: { title: "Preparing",    icon: "🍳", color: "#0d6efd", next: "ready",     label: "🔔 Mark Ready"      },
    ready:     { title: "Ready Pickup", icon: "🔔", color: "#048A81", next: "delivered", label: "🎉 Delivered"        },
  };
  const newLane = _laneOf(status);
  const card    = document.getElementById(`order-${id}`);

  if (status === "delivered" || status === "cancelled") {
    // Animate card out immediately, then reset render lock
    if (card) _animateCardOut(card, () => { _adminOrdersRendering = false; });
    else      _adminOrdersRendering = false;
    _ordersCache.delete(id);
  } else if (card && newLane) {
    const cfg = laneConfig[newLane];
    const oldLane = _ordersCache.get(id)?.lane;
    if (oldLane && oldLane !== newLane) {
      // Move card to new lane visually right away
      _animateCardOut(card, () => {
        const newGrid = document.getElementById(`grid-${newLane}`);
        if (newGrid) {
          // Build placeholder card with new status
          const div = document.createElement("div");
          div.innerHTML = card.outerHTML
            .replace(`id="order-${id}"`, `id="order-${id}"`)
            .replace(/data-status="[^"]*"/, `data-status="${status}"`);
          const newCard = div.firstElementChild;
          // Update action button
          const actionBtn = newCard.querySelector(".order-action-btn");
          if (actionBtn && cfg) {
            actionBtn.style.background = cfg.color;
            actionBtn.textContent      = cfg.label;
            actionBtn.onclick = () => updateOrderStatus(id, cfg.next, actionBtn);
          }
          // Update status badge
          const badge = newCard.querySelector(".order-status");
          if (badge) { badge.className = `order-status ${status}`; badge.textContent = status.toUpperCase(); }
          _animateCardIn(newCard, newGrid);
        }
      });
    } else {
      // Same lane — just patch badge + button
      const badge = card.querySelector(".order-status");
      if (badge) { badge.className = `order-status ${status}`; badge.textContent = status.toUpperCase(); }
      if (btn) { btn.textContent = cfg?.label || status; btn.disabled = false; }
    }
    _ordersCache.set(id, { status, lane: newLane });
  }

  // Update section counts immediately
  Object.keys(laneConfig).forEach(laneId => {
    const grid    = document.getElementById(`grid-${laneId}`);
    const countEl = document.getElementById(`count-${laneId}`);
    const section = document.getElementById(`section-${laneId}`);
    if (!grid || !countEl || !section) return;
    const count = grid.querySelectorAll(".order-card").length;
    countEl.textContent   = count;
    section.style.display = count > 0 ? "block" : "none";
  });

  // ── Background server update — fire and forget, never block UI ──
  // Use no-await so the optimistic UI update is already done.
  // If the PATCH fails we show a toast and let the next poll (2s) resync.
  fetch(`${API}/api/admin/orders/${id}/status`, {
    method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ status }),
  }).then(res => {
    if (!res.ok) {
      showToast("Update failed — will resync", "error");
      _ordersCache.delete(id);
      // Don't call loadAdminOrders() — let the background poll handle it
    } else {
      showToast(`Order → ${status} ✅`, "success");
      loadAdminStats();
    }
  }).catch(() => {
    showToast("Network error — will resync", "error");
    _ordersCache.delete(id);
  });
}

// ══════════════════════════════════════════════════
// ADMIN — TABS
// ══════════════════════════════════════════════════
function setAdminTab(tab) {
  currentAdminTab = tab;
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
  const tabMap = { orders: 0, payments: 1, menu: 2, users: 3 };
  if (tabMap[tab] !== undefined)
    document.querySelectorAll(".admin-tab")[tabMap[tab]]?.classList.add("active");

  const content = document.getElementById("adminContent");
  if (content) { content.innerHTML = ""; content.dataset.tab = tab; }
  _ordersCache.clear();
  _adminOrdersRendering = false;

  if (tab === "orders")   loadAdminOrders();
  if (tab === "payments") loadAdminPayments();
  if (tab === "menu")     loadAdminMenu();
  if (tab === "users")    loadAdminUsers();
}

// ══════════════════════════════════════════════════
// ADMIN — PAYMENTS
// Shows UTR + screenshot prominently. No flickering (only rebuilt on data change).
// ══════════════════════════════════════════════════
let _paymentsRenderKey = "";  // prevents unnecessary re-renders

async function loadAdminPayments() {
  const content = document.getElementById("adminContent");
  if (!content) return;
  if (content.dataset.tab && content.dataset.tab !== "payments") return;
  content.dataset.tab = "payments";

  try {
    const res    = await fetch(`${API}/api/admin/pending-payments`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const orders = data.orders || [];

    // Admin notification for new payment uploads
    _checkAdminNewPaymentUploads(orders);

    // Badge update
    const badge = document.getElementById("pendingPaymentsBadge");
    if (badge) {
      badge.textContent   = orders.length;
      badge.style.display = orders.length ? "inline" : "none";
    }

    // Only rebuild if data changed — prevents flicker on background poll
    const newKey = orders.map(o => o._id + (o.paymentUtrNote||"") + (o.paymentScreenshot||"")).join(",");
    if (newKey === _paymentsRenderKey && content.querySelector(".pmt-card")) return;
    _paymentsRenderKey = newKey;

    if (!orders.length) {
      content.innerHTML = `
        <div style="text-align:center;padding:4rem 2rem;opacity:0.5;">
          <div style="font-size:3rem;margin-bottom:12px;">✅</div>
          <p style="font-size:1.1rem;font-weight:600;">No pending verifications</p>
          <p style="font-size:0.85rem;margin-top:4px;">All payments are verified</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <style>
        .pmt-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 0;
          overflow: hidden;
          margin-bottom: 16px;
          max-width: 520px;
          width: 100%;
          box-sizing: border-box;
        }
        .pmt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .pmt-section { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .pmt-section:last-child { border-bottom: none; }
        .pmt-utr-box {
          background: rgba(249,115,22,0.12);
          border: 1.5px solid rgba(249,115,22,0.4);
          border-radius: 10px;
          padding: 10px 14px;
          margin: 0;
        }
        .pmt-utr-label { font-size: 0.7rem; opacity: 0.6; margin: 0 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
        .pmt-utr-value { font-size: 1.15rem; font-weight: 800; color: #f97316; font-family: monospace; margin: 0; letter-spacing: 1px; word-break: break-all; }
        .pmt-screenshot-wrap { display: block; width: 100%; }
        .pmt-screenshot-img {
          width: 100%;
          max-height: 340px;
          object-fit: contain;
          display: block;
          background: rgba(255,255,255,0.06);
          cursor: pointer;
        }
        .pmt-screenshot-hint { font-size: 0.72rem; opacity: 0.4; text-align: center; padding: 6px 0 10px; }
        .pmt-no-screenshot {
          border: 2px dashed rgba(249,115,22,0.2);
          border-radius: 10px;
          padding: 20px;
          text-align: center;
          opacity: 0.45;
          font-size: 0.88rem;
        }
        .pmt-actions { display: flex; gap: 10px; padding: 14px 16px; }
        .pmt-btn { flex: 1; padding: 13px 8px; border: none; border-radius: 10px; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: opacity 0.15s, transform 0.1s; font-family: inherit; }
        .pmt-btn:active { opacity: 0.8; transform: scale(0.98); }
        .pmt-btn-approve { background: #2D6A4F; color: #fff; }
        .pmt-btn-reject  { background: #e63946; color: #fff; }
        @media (max-width: 480px) {
          .pmt-card { border-radius: 12px; }
          .pmt-utr-value { font-size: 1rem; }
          .pmt-screenshot-img { max-height: 260px; }
        }
      </style>
      <h3 style="margin:0 0 16px;font-size:1.1rem;">
        💳 Pending UPI Verifications
        <span style="background:#e63946;color:#fff;border-radius:99px;padding:2px 10px;font-size:0.78rem;margin-left:8px;vertical-align:middle;">${orders.length}</span>
      </h3>
      <div style="display:flex;flex-direction:column;align-items:stretch;gap:0;">
        ${orders.map(o => {
          // Use helpers to safely resolve all fields
          const name       = _userName(o);
          const email      = _userEmail(o);
          const roll       = _userRoll(o);
          const branch     = _userBranch(o);
          const utr        = _extractUtr(o);
          const screenshotUrl = _resolveScreenshotUrl(o.paymentScreenshot);
          return `
          <div class="pmt-card" id="pmt-${o._id}">

            <!-- ── Header ── -->
            <div class="pmt-header">
              <div>
                <div style="font-size:0.65rem;opacity:0.4;letter-spacing:0.5px;">ORDER ID</div>
                <b style="font-size:1.1rem;letter-spacing:0.5px;">#${o._id.slice(-6).toUpperCase()}</b>
              </div>
              <span class="order-status pending" style="font-size:0.72rem;">⏳ AWAITING</span>
            </div>

            <!-- ── Customer info ── -->
            <div class="pmt-section">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">
                <div>
                  <p style="font-weight:700;font-size:0.95rem;margin:0;">👤 ${name}</p>
                  ${roll ? `<p style="font-size:0.75rem;color:#f97316;font-family:monospace;margin:2px 0 0;">🎓 ${roll}${branch ? " · " + branch : ""}</p>` : ""}
                  ${email ? `<p style="font-size:0.72rem;opacity:0.45;margin:2px 0 0;">${email}</p>` : ""}
                </div>
                <p style="font-size:0.72rem;opacity:0.4;margin:0;white-space:nowrap;">🕐 ${new Date(o.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <!-- ── Items + Total ── -->
            <div class="pmt-section">
              ${o.items.map(i => `
                <div style="display:flex;justify-content:space-between;font-size:0.88rem;padding:2px 0;">
                  <span>• ${i.name} × ${i.quantity}</span>
                  <span style="opacity:0.75;">₹${i.price * i.quantity}</span>
                </div>`).join("")}
              <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1rem;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
                <span>Total</span><span>₹${o.totalAmount}</span>
              </div>
            </div>

            <!-- ── UTR / Transaction ID ── -->
            <div class="pmt-section">
              ${utr ? `
                <div class="pmt-utr-box">
                  <p class="pmt-utr-label">🔖 UTR / Transaction ID</p>
                  <p class="pmt-utr-value">${utr}</p>
                </div>` : `
                <div style="display:flex;align-items:center;gap:8px;opacity:0.4;">
                  <span style="font-size:1.2rem;">🔖</span>
                  <span style="font-size:0.85rem;">No UTR number provided</span>
                </div>`}
            </div>

            <!-- ── Payment Screenshot ── -->
            <div style="padding:0;">
              ${screenshotUrl ? `
                <a href="${screenshotUrl}" target="_blank" rel="noopener" class="pmt-screenshot-wrap">
                  <img
                    src="${screenshotUrl}"
                    alt="Payment screenshot"
                    class="pmt-screenshot-img"
                    onerror="this.closest('.pmt-screenshot-wrap').outerHTML='<div style=\'padding:14px;text-align:center;opacity:0.5;font-size:0.85rem;\'>⚠️ Image failed — <a href=\'${screenshotUrl}\' target=\'_blank\' style=\'color:#f97316;\'>Open directly</a></div>'"
                  />
                </a>
                <p class="pmt-screenshot-hint">📷 Tap screenshot to open full size</p>` : `
                <div class="pmt-section">
                  <div class="pmt-no-screenshot">
                    <div style="font-size:2rem;margin-bottom:6px;">📷</div>
                    <p style="margin:0;">No screenshot uploaded yet</p>
                  </div>
                </div>`}
            </div>

            <!-- ── Action Buttons ── -->
            <div class="pmt-actions">
              <button class="pmt-btn pmt-btn-approve" onclick="verifyUpiPayment('${o._id}', true)">
                ✅ Approve & Confirm
              </button>
              <button class="pmt-btn pmt-btn-reject" onclick="verifyUpiPayment('${o._id}', false)">
                ❌ Reject
              </button>
            </div>

          </div>`;
        }).join("")}
      </div>`;
  } catch (err) {
    console.error("loadAdminPayments:", err);
    if (!content.querySelector(".pmt-card"))
      content.innerHTML = "<p style='padding:2rem;text-align:center;'>Failed to load payments. <button class='btn-secondary' onclick='loadAdminPayments()'>Retry</button></p>";
  }
}

async function verifyUpiPayment(orderId, approved) {
  const card = document.getElementById(`pmt-${orderId}`);
  if (card) { card.style.opacity = "0.5"; card.style.pointerEvents = "none"; }
  try {
    const res  = await fetch(`${API}/api/orders/${orderId}/verify-payment`, {
      method: "PATCH", headers: getAuthHeaders(),
      body: JSON.stringify({ approved }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed", "error");
      if (card) { card.style.opacity = "1"; card.style.pointerEvents = "auto"; }
      return;
    }
    showToast(approved ? "✅ Payment approved!" : "❌ Payment rejected", approved ? "success" : "info");
    _paymentsRenderKey = "";   // force re-render on next poll
    if (card) {
      card.style.transition = "opacity 0.4s, transform 0.4s";
      card.style.transform  = "scale(0.9)";
      card.style.opacity    = "0";
      setTimeout(() => {
        card.remove();
        loadAdminPayments();
        if (approved) { _ordersCache.clear(); loadAdminOrders(); }
      }, 400);
    } else {
      loadAdminPayments();
      if (approved) { _ordersCache.clear(); loadAdminOrders(); }
    }
    loadAdminStats();
  } catch (err) {
    showToast("Network error", "error");
    if (card) { card.style.opacity = "1"; card.style.pointerEvents = "auto"; }
  }
}

// ══════════════════════════════════════════════════
// ADMIN — MENU MANAGEMENT
// ══════════════════════════════════════════════════
async function loadAdminMenu() {
  const content = document.getElementById("adminContent");
  if (!content) return;
  try {
    const res   = await fetch(`${API}/api/menu`, { headers: getAuthHeaders() });
    const data  = await res.json();
    const items = data.items || [];
    content.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:1rem;">
        <button class="btn-primary" onclick="openMenuModal()">➕ Add New Item</button>
      </div>
      <div class="admin-menu-grid">
        ${items.map(item => `
          <div class="admin-menu-card ${item.isAvailable ? "" : "disabled"}">
            <div class="image-wrapper">
              <img src="${item.image || "https://via.placeholder.com/300x200?text=🍽️"}" alt="${item.name}" loading="lazy"
                   onerror="this.src='https://via.placeholder.com/300x200?text=🍽️'"/>
              <span class="item-category-badge">${item.category}</span>
            </div>
            <div class="card-body">
              <h3>${item.name}</h3>
              <p class="price">₹${item.price}</p>
              <p style="font-size:0.8rem;opacity:0.6;">${item.description || ""}</p>
              ${item.preparationTime ? `<p style="font-size:0.78rem;opacity:0.5;">⏱ ${item.preparationTime} min</p>` : ""}
            </div>
            <div class="card-actions">
              <label class="switch">
                <input type="checkbox" ${item.isAvailable ? "checked" : ""}
                  onchange="toggleMenuAvailability('${item._id}',this.checked)">
                <span class="slider"></span>
              </label>
              <span class="status">${item.isAvailable ? "Available" : "Hidden"}</span>
              <div style="display:flex;gap:6px;margin-left:auto;">
                <button onclick="openMenuModal('${item._id}')"
                  style="background:#0d6efd;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">✏️ Edit</button>
                <button onclick="deleteMenuItem('${item._id}')"
                  style="background:#e63946;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🗑️</button>
              </div>
            </div>
          </div>`).join("")}
      </div>`;
  } catch(err) { console.error("loadAdminMenu:", err); }
}

let editingItemId = null;

async function openMenuModal(itemId = null) {
  editingItemId = itemId;
  const modal = document.getElementById("menuItemModal");
  const title = document.getElementById("menuModalTitle");
  if (!modal) return;
  ["miName","miDesc","miPrice","miImage","miPrepTime"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("miCategory").value    = "snacks";
  document.getElementById("miAvailable").checked = true;
  const uploadPrev = document.getElementById("miImagePreview");
  if (uploadPrev) uploadPrev.style.display = "none";
  const uploadFile = document.getElementById("miImageFile");
  if (uploadFile) uploadFile.value = "";
  if (itemId) {
    title.textContent = "✏️ Edit Menu Item";
    try {
      const res  = await fetch(`${API}/api/menu/${itemId}`);
      const data = await res.json();
      const item = data.item;
      if (item) {
        document.getElementById("miName").value     = item.name || "";
        document.getElementById("miDesc").value     = item.description || "";
        document.getElementById("miPrice").value    = item.price || "";
        document.getElementById("miCategory").value = item.category || "snacks";
        document.getElementById("miImage").value    = item.image || "";
        document.getElementById("miPrepTime").value = item.preparationTime || 10;
        document.getElementById("miAvailable").checked = item.isAvailable !== false;
        if (item.image && uploadPrev) { uploadPrev.src = item.image; uploadPrev.style.display = "block"; }
      }
    } catch {}
  } else { title.textContent = "➕ Add Menu Item"; }
  modal.classList.add("active");
}

function closeMenuModal() { document.getElementById("menuItemModal")?.classList.remove("active"); editingItemId = null; }

async function saveMenuItem() {
  const name     = document.getElementById("miName").value.trim();
  const price    = parseFloat(document.getElementById("miPrice").value);
  const category = document.getElementById("miCategory").value;
  if (!name || isNaN(price)) { showToast("Name and price are required", "error"); return; }
  let imageUrl = document.getElementById("miImage").value.trim();
  const fileInput = document.getElementById("miImageFile");
  if (fileInput?.files?.[0]) {
    const uploaded = await uploadMenuImage(fileInput.files[0]);
    if (uploaded) imageUrl = uploaded;
  }
  const payload = {
    name, price, category, image: imageUrl,
    description: document.getElementById("miDesc").value.trim(),
    preparationTime: parseInt(document.getElementById("miPrepTime").value) || 10,
    isAvailable: document.getElementById("miAvailable").checked,
  };
  const btn = document.getElementById("saveMenuBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
  try {
    const url    = editingItemId ? `${API}/api/admin/menu/${editingItemId}` : `${API}/api/admin/menu`;
    const method = editingItemId ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
    const data   = await res.json();
    if (!res.ok) { showToast(data.error || "Failed", "error"); return; }
    showToast(editingItemId ? "Updated ✅" : "Added ✅", "success");
    closeMenuModal(); loadAdminMenu(); loadMenu();
  } catch { showToast("Network error", "error"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "Save Item"; } }
}

async function toggleMenuAvailability(id, isAvailable) {
  try {
    await fetch(`${API}/api/admin/menu/${id}`, { method: "PUT", headers: getAuthHeaders(), body: JSON.stringify({ isAvailable }) });
    loadAdminMenu(); loadMenu();
  } catch { showToast("Failed", "error"); }
}

async function deleteMenuItem(id) {
  if (!confirm("Delete this item? This cannot be undone.")) return;
  try {
    await fetch(`${API}/api/admin/menu/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    showToast("Deleted", "info"); loadAdminMenu(); loadMenu();
  } catch { showToast("Failed", "error"); }
}

// ══════════════════════════════════════════════════
// ADMIN — USER MANAGEMENT
// ══════════════════════════════════════════════════
async function loadAdminUsers() {
  const content = document.getElementById("adminContent");
  if (!content) return;
  content.innerHTML = "<p style='text-align:center;padding:2rem;opacity:0.5;'>Loading students...</p>";
  try {
    const res   = await fetch(`${API}/api/admin/users`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data  = await res.json();
    const users = data.users || [];
    if (!users.length) { content.innerHTML = "<p style='text-align:center;padding:3rem;opacity:0.4;'>No students registered yet</p>"; return; }
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">👥 Registered Students <span style="font-size:0.85rem;font-weight:400;opacity:0.5;margin-left:8px;">${users.length} total</span></h3>
        <input type="text" class="form-input" placeholder="🔍 Name / roll / email..."
               style="max-width:260px;padding:8px 12px;font-size:0.88rem;"
               oninput="filterStudentsTable(this.value)"/>
      </div>
      <div class="users-table-wrap">
        <table class="stats-table" id="studentsTable">
          <thead><tr><th>Name</th><th>Roll No.</th><th>Branch</th><th>Phone</th><th>Orders</th><th>Spent</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr data-search="${[u.name,u.email,u.rollNumber||"",u.branch||"",u.phone||""].join(" ").toLowerCase()}">
                <td><div style="font-weight:700;">${u.name}</div><div style="font-size:0.73rem;opacity:0.45;">${u.email}</div></td>
                <td><span style="font-family:monospace;font-weight:700;font-size:0.88rem;color:#f97316;">${u.rollNumber || "—"}</span></td>
                <td>${u.branch || "—"}</td>
                <td>${u.phone || "—"}</td>
                <td style="text-align:center;font-weight:700;">${u.totalOrders || 0}</td>
                <td style="font-weight:600;">₹${(u.totalSpent || 0).toLocaleString("en-IN")}</td>
                <td style="font-size:0.8rem;opacity:0.55;">${new Date(u.createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</td>
                <td><span class="${u.isBanned ? "badge-banned" : "badge-active"}">${u.isBanned ? "🚫 Banned" : "✅ Active"}</span></td>
                <td>${u.isBanned
                  ? `<button class="btn-primary" style="padding:5px 12px;font-size:0.78rem;background:#2D6A4F;" onclick="banUser('${u._id}',false,'')">Unban</button>`
                  : `<button class="btn-primary" style="padding:5px 12px;font-size:0.78rem;background:#e63946;" onclick="promptBan('${u._id}')">Ban</button>`}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  } catch(err) {
    console.error("loadAdminUsers:", err);
    content.innerHTML = `<p style='padding:2rem;color:#e63946;'>❌ Failed. <button class="btn-secondary" onclick="loadAdminUsers()">Retry</button></p>`;
  }
}

function filterStudentsTable(q) {
  q = q.toLowerCase();
  document.querySelectorAll("#studentsTable tbody tr").forEach(row => {
    row.style.display = (row.dataset.search || "").includes(q) ? "" : "none";
  });
}

function promptBan(userId) {
  const reason = prompt("Reason for ban (shown to student):");
  if (reason === null) return;
  banUser(userId, true, reason);
}

async function banUser(userId, isBanned, banReason) {
  try {
    const res  = await fetch(`${API}/api/admin/users/${userId}/ban`, {
      method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ isBanned, banReason }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed", "error"); return; }
    showToast(isBanned ? "User banned" : "User unbanned", "info");
    loadAdminUsers();
  } catch { showToast("Network error", "error"); }
}

// ══════════════════════════════════════════════════
// ADMIN — ADD WALK-IN ORDER MODAL
// ══════════════════════════════════════════════════
function openAddOrderModal() {
  aoCart = [];
  ["aoCustomerName","aoNotes","aoItemSearch"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.querySelector('input[name="aoPayment"][value="paid"]').checked = true;
  renderAoMenu(menuItems.filter(i => i.isAvailable !== false));
  renderAoSummary(); renderAoSuggestions();
  document.getElementById("addOrderModal")?.classList.add("active");
}

function closeAddOrderModal() { document.getElementById("addOrderModal")?.classList.remove("active"); }

function filterAoItems(query) {
  const q = query.toLowerCase().trim();
  const f = q ? menuItems.filter(i => i.isAvailable !== false && (i.name.toLowerCase().includes(q) || (i.category||"").toLowerCase().includes(q))) : menuItems.filter(i => i.isAvailable !== false);
  renderAoMenu(f);
}

function renderAoMenu(items) {
  const list = document.getElementById("aoMenuList");
  if (!list) return;
  if (!items.length) { list.innerHTML = `<p style="text-align:center;opacity:0.5;padding:1rem;">No items</p>`; return; }
  const groups = {};
  items.forEach(i => { const c = i.category||"Other"; if (!groups[c]) groups[c]=[]; groups[c].push(i); });
  list.innerHTML = Object.entries(groups).map(([cat, catItems]) => `
    <div class="ao-category-group">
      <div class="ao-category-label">${cat.toUpperCase()}</div>
      ${catItems.map(item => {
        const qty = aoCart.find(c => c._id === item._id)?.qty || 0;
        return `
          <div class="ao-menu-item ${qty>0?"ao-item-selected":""}" id="ao-item-${item._id}">
            <div class="ao-item-info">
              <span class="ao-item-name">${item.name}</span>
              <span class="ao-item-price">₹${item.price}</span>
              ${item.description ? `<span class="ao-item-desc">${item.description}</span>` : ""}
            </div>
            <div class="ao-qty-controls">
              <button class="qty-btn minus" onclick="aoDecrease('${item._id}')" ${qty===0?"disabled":""}>−</button>
              <span class="qty ao-qty-display">${qty}</span>
              <button class="qty-btn plus" onclick="aoIncrease('${item._id}')">+</button>
            </div>
          </div>`;
      }).join("")}
    </div>`).join("");
}

function aoIncrease(id) {
  const item = menuItems.find(i => i._id === id); if (!item) return;
  const ex = aoCart.find(c => c._id === id);
  if (ex) ex.qty++; else aoCart.push({ ...item, qty: 1 });
  refreshAoRow(id); renderAoSummary(); renderAoSuggestions();
}
function aoDecrease(id) {
  const ex = aoCart.find(c => c._id === id); if (!ex) return;
  ex.qty--; if (ex.qty <= 0) aoCart = aoCart.filter(c => c._id !== id);
  refreshAoRow(id); renderAoSummary(); renderAoSuggestions();
}
function aoRemoveItem(id) { aoCart = aoCart.filter(c => c._id !== id); refreshAoRow(id); renderAoSummary(); renderAoSuggestions(); }

function refreshAoRow(id) {
  const row = document.getElementById(`ao-item-${id}`); if (!row) return;
  const qty = aoCart.find(c => c._id === id)?.qty || 0;
  row.classList.toggle("ao-item-selected", qty > 0);
  const qEl = row.querySelector(".ao-qty-display"); const mBtn = row.querySelector(".qty-btn.minus");
  if (qEl) qEl.textContent = qty;
  if (mBtn) mBtn.disabled  = qty === 0;
}

function renderAoSummary() {
  const sec = document.getElementById("aoSummarySection");
  const div = document.getElementById("aoSelectedItems");
  const tot = document.getElementById("aoTotal");
  if (!sec || !div || !tot) return;
  if (!aoCart.length) { sec.style.display = "none"; return; }
  sec.style.display = "block";
  let total = 0;
  div.innerHTML = aoCart.map(item => {
    const sub = item.price * item.qty; total += sub;
    return `
      <div class="ao-summary-row">
        <div><span class="ao-sum-name">${item.name}</span><span class="ao-sum-qty"> × ${item.qty}</span></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="ao-sum-price">₹${sub}</span>
          <button class="ao-remove-btn" onclick="aoRemoveItem('${item._id}')">×</button>
        </div>
      </div>`;
  }).join("");
  tot.textContent = "₹" + total;
}

function renderAoSuggestions() {
  const box = document.getElementById("aoSuggestions"); if (!box) return;
  if (!aoCart.length) { box.innerHTML = ""; return; }
  const cartIds  = aoCart.map(c => c._id);
  const cartCats = [...new Set(aoCart.map(c => (c.category||"").toLowerCase()))];
  const avail    = menuItems.filter(i => i.isAvailable !== false && !cartIds.includes(i._id));
  const sugs     = [];
  const has  = cats => cartCats.some(c => cats.includes(c));
  const find = cats => avail.find(i => cats.includes((i.category||"").toLowerCase()));
  if (!has(["beverages","drinks","juice","tea","coffee"])) { const d = find(["beverages","drinks","juice","tea","coffee"]); if (d) sugs.push({ item: d, reason: "🥤 Add a drink?" }); }
  if (!has(["lunch","dinner","breakfast","meals"]) && has(["snacks"])) { const m = find(["lunch","dinner","breakfast","meals"]); if (m) sugs.push({ item: m, reason: "🍱 Add a main meal?" }); }
  if (!has(["dessert","desserts","sweets"]) && has(["lunch","dinner"])) { const des = find(["dessert","desserts","sweets"]); if (des) sugs.push({ item: des, reason: "🍮 Add a dessert?" }); }
  cartCats.forEach(cat => { if (sugs.length >= 4) return; const extra = avail.find(i => (i.category||"").toLowerCase() === cat && !sugs.find(s => s.item._id === i._id)); if (extra) sugs.push({ item: extra, reason: `✨ Also from ${cat}` }); });
  if (!sugs.length) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <div class="ao-suggestions-title">💡 Suggested Add-ons</div>
    <div class="ao-suggestions-grid">
      ${sugs.map(({ item, reason }) => `
        <div class="ao-suggestion-chip" onclick="aoIncrease('${item._id}');this.classList.add('added')">
          <span class="ao-sug-reason">${reason}</span>
          <span class="ao-sug-name">${item.name}</span>
          <span class="ao-sug-price">₹${item.price}</span>
          <span class="ao-sug-add">+ Add</span>
        </div>`).join("")}
    </div>`;
}

async function submitAdminOrder() {
  const customerName = document.getElementById("aoCustomerName").value.trim();
  const notes        = document.getElementById("aoNotes").value.trim();
  const payStatus    = document.querySelector('input[name="aoPayment"]:checked')?.value || "paid";
  const btn          = document.getElementById("aoSubmitBtn");
  if (!customerName) { showToast("Customer name required", "error"); return; }
  if (!aoCart.length) { showToast("Add at least one item", "error"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Placing..."; }
  try {
    const res  = await fetch(`${API}/api/admin/orders`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({ customerName, customerNote: notes, paymentStatus: payStatus, items: aoCart.map(i => ({ menuItem: i._id, quantity: i.qty })) }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed", "error"); return; }
    showToast(`Order placed for ${customerName} ✅`, "success");
    closeAddOrderModal(); loadAdminOrders(); loadAdminStats();
  } catch { showToast("Network error", "error"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "🎉 Place Order"; } }
}

// ══════════════════════════════════════════════════
// AUTO-REFRESH — background polling, no flicker
// All functions guard against concurrent calls internally.
// Intervals are staggered so they don't all fire at once.
// ══════════════════════════════════════════════════
let _adminTick = 0;

setInterval(async () => {
  if (document.hidden) return;
  _adminTick++;
  const adminPage   = document.getElementById("adminPage");
  const isAdminPage = adminPage?.classList.contains("active");

  if (isAdminPage) {
    // Orders tab: refresh every 2 seconds
    if (currentAdminTab === "orders" && _adminTick % 2 === 0) loadAdminOrders();
    // Payments tab: refresh every 8 seconds
    if (currentAdminTab === "payments" && _adminTick % 8 === 0) loadAdminPayments();
    // Stats: every 10 seconds
    if (_adminTick % 10 === 0) { loadAdminStats(); refreshPaymentsBadge(); }
  }

  // ── Background notification polling (runs regardless of which tab/page is active) ──
  // Checks for new orders every 5 seconds so admin gets notified even on other tabs
  if (_adminTick % 5 === 0 && Notification.permission === "granted") {
    const user = _getStoredUser();
    if (user?.role === "admin") {
      try {
        const r  = await fetch(`${API}/api/admin/orders?limit=200`, { headers: getAuthHeaders() });
        const d  = await r.json();
        if (d.orders) _checkAdminNewOrderNotifs(d.orders);
      } catch(e) {}
      // Also check pending payments
      try {
        const r2 = await fetch(`${API}/api/admin/pending-payments`, { headers: getAuthHeaders() });
        const d2 = await r2.json();
        if (d2.orders) _checkAdminNewPaymentUploads(d2.orders);
        // Update badge
        const badge = document.getElementById("pendingPaymentsBadge");
        if (badge) {
          badge.textContent   = d2.orders?.length || 0;
          badge.style.display = (d2.orders?.length > 0) ? "inline" : "none";
        }
      } catch(e) {}
    }
  }

  // Lunch banner: every 60 seconds
  if (_adminTick % 60 === 0) updateLunchBanner();
}, 1000);

// ── Student background notification poll ──────────────────
// Runs every 5 seconds for logged-in students on ANY page
// so they get order status notifications even on the main menu
let _studentNotifTick = 0;
setInterval(async () => {
  if (document.hidden) return;
  _studentNotifTick++;
  if (_studentNotifTick % 5 !== 0) return;
  if (Notification.permission !== "granted") return;
  const user = _getStoredUser();
  if (!user || user.role !== "user") return;
  try {
    const r = await fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() });
    const d = await r.json();
    if (d.orders) _checkStudentOrderNotifs(d.orders);
  } catch(e) {}
}, 1000);

async function refreshPaymentsBadge() {
  try {
    const res   = await fetch(`${API}/api/admin/pending-payments`, { headers: getAuthHeaders() });
    const data  = await res.json();
    const badge = document.getElementById("pendingPaymentsBadge");
    if (!badge) return;
    const count = (data.orders || []).length;
    badge.textContent   = count;
    badge.style.display = count > 0 ? "inline" : "none";
  } catch {}
}

// ══════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  if ((e.ctrlKey||e.metaKey) && e.key === "k") { e.preventDefault(); document.getElementById("searchInput")?.focus(); }
  if ((e.ctrlKey||e.metaKey) && e.key === "b") { e.preventDefault(); openCart(); }
  if (e.key === "Escape") { closeCart(); closeMenuModal(); closeAddOrderModal(); closeUpiModal(); }
});

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("searchInput")?.addEventListener("input", renderMenu);
  updateNavbar();
  loadMenu();
  updateCartUI();
  updateLunchBanner();
  setInterval(updateLunchBanner, 60000);

  // ── Restore correct page on reload ──────────────────────────────
  // If user is already logged in, send them to the right page instead
  // of always landing on the student menu (mainPage).
  const _existingUser = _getStoredUser();
  if (_existingUser) {
    if (_existingUser.role === "admin") {
      // Admin reload → go straight to admin dashboard
      showPage("adminPage");
    }
    // Students stay on mainPage (already active by default in HTML)
    // Auto-request notification permission
    setTimeout(_autoRequestNotifPermission, 1500);
  }

  document.getElementById("miImageFile")?.addEventListener("change", function() {
    const file = this.files[0]; if (!file) return;
    const preview = document.getElementById("miImagePreview");
    if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = "block"; }
    document.getElementById("miImage").value = "";
  });
});

// Expose to inline onclick handlers
window.showPage  = showPage;
window.openCart  = openCart;
window.closeCart = closeCart;

// ══════════════════════════════════════════════════
// ORDER TRACKING
// ══════════════════════════════════════════════════
let trackingInterval = null;

function trackOrder(orderId) {
  showPage("trackPage");
  clearInterval(trackingInterval);
  renderTrackSkeleton(orderId);
  fetchAndRenderTrack(orderId);
  trackingInterval = setInterval(() => fetchAndRenderTrack(orderId), 8000);
}

async function fetchAndRenderTrack(orderId) {
  try {
    const res  = await fetch(`${API}/api/orders/${orderId}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok || !data.order) return;
    renderTrackUI(data.order);
    if (["delivered","cancelled"].includes(data.order.status)) clearInterval(trackingInterval);
  } catch {}
}

function renderTrackSkeleton(id) {
  const el = document.getElementById("trackContent");
  if (!el) return;
  el.innerHTML = `<div class="track-card"><p style="text-align:center;opacity:0.5;">Loading order #${id.slice(-6).toUpperCase()}...</p></div>`;
}

function renderTrackUI(order) {
  const el = document.getElementById("trackContent");
  if (!el) return;

  const STEPS = [
    { key: "pending",   label: "Order\nPlaced",  icon: "🛒", desc: "Received" },
    { key: "confirmed", label: "Confirmed",       icon: "✅", desc: "Accepted" },
    { key: "preparing", label: "Preparing",       icon: "🍳", desc: "Cooking…"  },
    { key: "ready",     label: "Ready!",          icon: "🔔", desc: "Pick up"   },
    { key: "delivered", label: "Picked Up",       icon: "🎉", desc: "Enjoy!"    },
  ];

  const cancelled  = order.status === "cancelled";
  const currentIdx = cancelled ? -1 : STEPS.findIndex(s => s.key === order.status);
  const n = STEPS.length;
  const fillPct = cancelled ? 0 : currentIdx <= 0 ? 0 : Math.round((currentIdx / (n - 1)) * 100);

  const stepsHTML = STEPS.map((step, idx) => {
    const done   = !cancelled && idx < currentIdx;
    const active = !cancelled && idx === currentIdx;
    const cls    = done ? "done" : active ? "active" : "";
    const dotContent = done ? "✓" : step.icon;
    return `
      <div class="track-step-col ${cls}">
        <div class="track-dot">${dotContent}</div>
        <div class="ts-label">${step.label.replace("\n", "<br>")}</div>
        <div class="ts-desc">${(done || active) ? step.desc : ""}</div>
      </div>`;
  }).join("");

  const activeStep = currentIdx >= 0 ? STEPS[currentIdx] : null;

  el.innerHTML = `
    <div class="track-card">
      <div class="track-header">
        <div>
          <h3>Order #${order._id.slice(-6).toUpperCase()}</h3>
          <p style="opacity:0.55;font-size:0.82rem;margin:2px 0 0;">${new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span class="order-status ${order.status}">${order.status.toUpperCase()}</span>
      </div>

      ${cancelled
        ? `<div class="track-cancelled">❌ This order was cancelled</div>`
        : `
        <div class="track-timeline">
          <div class="track-timeline-fill" style="width:${fillPct}%"></div>
          ${stepsHTML}
        </div>
        ${activeStep ? `
          <p class="track-status-label">
            ${activeStep.icon} <strong>${activeStep.label}</strong> — ${
              order.status === "pending"   ? "Your order has been received by the canteen." :
              order.status === "confirmed" ? "The canteen has confirmed your order." :
              order.status === "preparing" ? "Your food is being freshly prepared!" :
              order.status === "ready"     ? "Your order is ready — come pick it up!" :
              "Order complete. Enjoy your meal!"
            }
          </p>` : ""}
      `}

      <div class="track-items">
        <h4>🛒 Items</h4>
        ${order.items.map(i => `
          <div class="track-item-row">
            <span>${i.name} × ${i.quantity}</span>
            <span>₹${i.price * i.quantity}</span>
          </div>`).join("")}
        <div class="track-item-row total-row">
          <span>Total</span><span>₹${order.totalAmount}</span>
        </div>
      </div>

      ${order.status === "ready" ? `<div class="track-ready-banner">🔔 Your order is ready! Head to the canteen counter now.</div>` : ""}

      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="showPage('ordersPage')">← Back to Orders</button>
        ${["pending","confirmed"].includes(order.status) ? `<button class="btn-primary" style="flex:1;" onclick="cancelOrder('${order._id}')">Cancel Order</button>` : ""}
      </div>
    </div>`;
}
// ══════════════════════════════════════════════════
// EXPORT ORDERS
// ══════════════════════════════════════════════════
function openExportModal() {
  const today = new Date().toISOString().split("T")[0];
  const el = document.getElementById("exportTo");
  if (el && !el.value) el.value = today;
  document.getElementById("exportModal")?.classList.add("active");
}
function closeExportModal() { document.getElementById("exportModal")?.classList.remove("active"); }

async function exportOrders(format) {
  const from   = document.getElementById("exportFrom")?.value;
  const to     = document.getElementById("exportTo")?.value;
  const status = document.getElementById("exportStatus")?.value;
  const params = new URLSearchParams();
  if (from)   params.set("from", from);
  if (to)     params.set("to", to);
  if (status) params.set("status", status);
  showToast("Preparing export...", "info");
  try {
    const res  = await fetch(`${API}/api/admin/orders/export?${params}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok || !data.rows) { showToast("Export failed", "error"); return; }
    if (format === "excel") exportToExcel(data.rows, from, to);
    else                    exportToPDF(data.rows, from, to);
    closeExportModal();
  } catch (err) { showToast("Export error: " + err.message, "error"); }
}

function exportToExcel(rows, from, to) {
  const XLSX = window.XLSX;
  if (!XLSX) { showToast("Excel library not loaded", "error"); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  XLSX.writeFile(wb, `CampusBites_Orders_${from||"all"}_to_${to||"now"}.xlsx`);
  showToast(`Excel downloaded (${rows.length} orders) ✅`, "success");
}

function exportToPDF(rows, from, to) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast("PDF library not loaded", "error"); return; }
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFillColor(249, 115, 22); doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("CampusBites — Orders Report", 14, 14);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Period: ${from && to ? `${from} → ${to}` : "All dates"}  |  Total: ${rows.length} orders`, 200, 14);
  doc.setTextColor(0, 0, 0);
  doc.autoTable({
    startY: 26,
    head: [["Order ID", "Customer", "Items", "Total", "Payment", "Status", "Date"]],
    body: rows.map(r => [r["Order ID"], r["Customer"], r["Items"].length > 50 ? r["Items"].slice(0, 50) + "..." : r["Items"], "₹" + r["Total (₹)"], r["Payment"], r["Status"], r["Date"]]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [249, 115, 22], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    columnStyles: { 2: { cellWidth: 70 } },
  });
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount} — Generated ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.height - 6);
  }
  doc.save(`CampusBites_Orders_${from||"all"}_to_${to||"now"}.pdf`);
  showToast(`PDF downloaded (${rows.length} orders) ✅`, "success");
}

// ══════════════════════════════════════════════════
// MENU IMAGE UPLOAD — Cloudinary
// ══════════════════════════════════════════════════
const CLOUDINARY_CLOUD  = "your_cloud_name";
const CLOUDINARY_PRESET = "campusbites_menu";

async function uploadMenuImage(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) { showToast("Image must be under 5MB", "error"); return null; }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  formData.append("folder", "campusbites-menu");
  showToast("Uploading image...", "info");
  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (data.secure_url) { showToast("Image uploaded ✅", "success"); return data.secure_url; }
    showToast("Cloudinary upload failed", "error"); return null;
  } catch { showToast("Image upload failed", "error"); return null; }
}
