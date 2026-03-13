// ══════════════════════════════════════════════════
// CAMPUSBITES  script.js  v4.0 — Full Featured
// ══════════════════════════════════════════════════

// ── Global state ──────────────────────────────────
let menuItems        = [];
let cart             = JSON.parse(localStorage.getItem("cart")) || [];
let selectedCategory = "all";
let currentAdminTab  = "orders";
let revenueChart     = null;
let aoCart           = [];
let lunchCheckInterval;

const API = "";   // relative URLs — works locally + on Render

function getAuthHeaders() {
  return {
    "Authorization": "Bearer " + localStorage.getItem("token"),
    "Content-Type":  "application/json",
  };
}

// ══════════════════════════════════════════════════
// LUNCH BREAK ENFORCEMENT
// ══════════════════════════════════════════════════
function isLunchBreakNow() {
  const now  = new Date();
  const h    = now.getHours();
  const m    = now.getMinutes();
  const mins = h * 60 + m;
  return mins >= 13 * 60 + 10 && mins < 14 * 60;   // 1:10 PM – 2:00 PM
}

function updateLunchBanner() {
  const banner = document.getElementById("lunchBanner");
  const placeBtn = document.getElementById("placeOrderBtn");
  if (!banner) return;

  if (isLunchBreakNow()) {
    banner.style.display = "flex";
    if (placeBtn) {
      placeBtn.disabled   = true;
      placeBtn.textContent = "🚫 Ordering closed (Lunch Break)";
    }
  } else {
    banner.style.display = "none";
    if (placeBtn) {
      placeBtn.disabled   = false;
      placeBtn.textContent = "🎉 Place Order";
    }
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
  t.textContent  = msg;
  t.className    = `toast show toast-${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3500);
}

// ══════════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════════
// Per-page fast-refresh intervals (cleared when navigating away)
let _ordersPageInterval  = null;
let _profilePageInterval = null;

function showPage(id) {
  // Stop any active per-page intervals from the previous page
  if (_ordersPageInterval)  { clearInterval(_ordersPageInterval);  _ordersPageInterval  = null; }
  if (_profilePageInterval) { clearInterval(_profilePageInterval); _profilePageInterval = null; }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");

  if (id === "adminPage") {
    loadAdminStats();
    setAdminTab("orders");
  }
  if (id === "ordersPage") {
    loadMyOrders();
    // Refresh every 1 second — student sees food status update in real time
    _ordersPageInterval = setInterval(() => {
      if (!document.hidden) loadMyOrders();
    }, 1000);
  }
  if (id === "profilePage") {
    loadProfile();
    // Refresh every 2 seconds — fast enough to see live stats
    _profilePageInterval = setInterval(() => {
      if (!document.hidden) loadProfile();
    }, 2000);
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
    localStorage.setItem("token", data.token);
    localStorage.setItem("user",  JSON.stringify(data.user));
    showToast("Welcome back! ✅", "success");
    updateNavbar();
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
  const user      = JSON.parse(localStorage.getItem("user") || "null");
  const loginBtn  = document.getElementById("loginBtnNav");
  const logoutBtn = document.getElementById("logoutBtn");
  const ordersBtn = document.getElementById("myOrdersBtn");
  const adminBtn  = document.getElementById("adminBtn");
  const nameEl    = document.getElementById("userNameDisplay");

  if (!user) {
    if (loginBtn)  loginBtn.style.display  = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (ordersBtn) ordersBtn.style.display = "none";
    if (adminBtn)  adminBtn.style.display  = "none";
    return;
  }
  if (loginBtn)  loginBtn.style.display  = "none";
  if (logoutBtn) logoutBtn.style.display = "inline-block";
  if (ordersBtn) ordersBtn.style.display = "inline-block";
  if (nameEl)    nameEl.innerText        = user.name?.split(" ")[0] || "";
  if (adminBtn)  adminBtn.style.display  = user.role === "admin" ? "inline-block" : "none";
  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) profileBtn.style.display = user.role === "user" ? "inline-block" : "none";
}

function logout() {
  localStorage.clear(); cart = [];
  showPage("mainPage"); updateNavbar(); updateCartUI(); loadMenu();
}

// ══════════════════════════════════════════════════
// PROFILE PAGE
// ══════════════════════════════════════════════════
// ── Profile auto-refresh state ──
let _profileInterval = null;

function _stopProfileRefresh() {
  if (_profileInterval) { clearInterval(_profileInterval); _profileInterval = null; }
}

async function loadProfile() {
  const content = document.getElementById("profileContent");
  const user    = JSON.parse(localStorage.getItem("user") || "null");
  if (!content || !user) return;

  // Show skeleton only on first load
  if (!content.querySelector(".profile-card")) {
    content.innerHTML = "<p style='text-align:center;padding:2rem;opacity:0.5;'>Loading profile...</p>";
  }

  try {
    // Fetch fresh user data + orders in parallel
    const [meRes, ordRes] = await Promise.all([
      fetch(`${API}/api/auth/me`, { headers: getAuthHeaders() }),
      fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() }),
    ]);
    const u      = (await meRes.json()).user || user;
    const orders = (await ordRes.json()).orders || [];

    // Compute spent from actual delivered orders belonging to this student only
    const delivered = orders.filter(o => o.status === "delivered");
    const spent     = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const active    = orders.filter(o => ["pending","confirmed","preparing","ready"].includes(o.status));

    // ── Build full profile HTML (first time or full refresh) ──
    if (!content.querySelector(".profile-card")) {
      content.innerHTML = _buildProfileHTML(u, orders, delivered, spent, active);
      return;
    }

    // ── Diff-patch subsequent refreshes (no flicker) ──
    _patchText("prof-name",     u.name);
    _patchText("prof-email",    u.email);
    _patchText("prof-roll",     u.rollNumber ? `🎓 ${u.rollNumber}${u.branch ? " · " + u.branch : ""}` : "");
    _patchText("prof-phone",    u.phone ? `📞 ${u.phone}` : "");
    _patchText("prof-stat-total",     String(orders.length));
    _patchText("prof-stat-spent",     `₹${spent.toLocaleString("en-IN")}`);
    _patchText("prof-stat-completed", String(delivered.length));

    // Active order status pill — update in place
    if (active.length > 0) {
      const pill = document.getElementById("prof-active-pill");
      if (pill) {
        pill.textContent = `⏳ ${active.length} order${active.length > 1 ? "s" : ""} active`;
      } else {
        // Pill didn't exist yet — do a full rebuild to add it
        content.innerHTML = _buildProfileHTML(u, orders, delivered, spent, active);
        return;
      }
    } else {
      const pill = document.getElementById("prof-active-pill");
      if (pill) pill.textContent = "";
    }

    // Re-render recent orders list (they change status)
    const recentList = document.getElementById("prof-recent-orders");
    if (recentList) recentList.innerHTML = _buildRecentOrders(orders);

  } catch (err) {
    console.error("loadProfile:", err);
    if (!content.querySelector(".profile-card"))
      content.innerHTML = "<p style='padding:2rem;'>Failed to load profile. <button class='btn-secondary' onclick='loadProfile()'>Retry</button></p>";
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
      ${active.length > 0 ? `<div id="prof-active-pill" style="display:inline-block;margin-top:8px;background:rgba(249,115,22,0.15);color:#f97316;border:1px solid rgba(249,115,22,0.3);border-radius:99px;padding:4px 14px;font-size:0.82rem;">⏳ ${active.length} order${active.length>1?"s":""} active</div>` : `<div id="prof-active-pill" style="display:inline-block;margin-top:8px;font-size:0.82rem;"></div>`}
      <div class="profile-stats" style="margin-top:1.2rem;">
        <div class="pstat"><h3 id="prof-stat-total">${orders.length}</h3><p>Total Orders</p></div>
        <div class="pstat"><h3 id="prof-stat-spent">₹${spent.toLocaleString("en-IN")}</h3><p>Amount Spent</p></div>
        <div class="pstat"><h3 id="prof-stat-completed">${delivered.length}</h3><p>Completed</p></div>
      </div>
      <button class="btn-primary" style="margin-top:1.5rem;width:100%;" onclick="showPage('ordersPage')">📋 View All Orders</button>
    </div>
    <h3 style="margin:1.8rem 0 0.8rem;">🔁 Recent Orders</h3>
    <div id="prof-recent-orders">
      ${_buildRecentOrders(orders)}
    </div>`;
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
    showPage("mainPage");
    openCart();
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

function selectCategory(cat) {
  selectedCategory = cat; renderCategories(); renderMenu();
}

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

function removeFromCart(id) {
  cart = cart.filter(i => i._id !== id);
  saveCart(); updateCartUI(); renderMenu();
}

function saveCart()     { localStorage.setItem("cart", JSON.stringify(cart)); }
function getCartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function updateCartUI() {
  const cartBody   = document.getElementById("cartBody");
  const cartBadge  = document.getElementById("cartBadge");
  const subtotalEl = document.getElementById("cartSubtotal");
  const totalEl    = document.getElementById("cartTotal");
  const summary    = document.getElementById("cartSummary");
  if (!cartBadge) return;

  const total = cart.reduce((s, i) => s + i.qty, 0);
  cartBadge.textContent = total;

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

function openCart() {
  document.getElementById("cartModal")?.classList.add("active");
  updateCartUI();
  updateLunchBanner();
}
function closeCart() { document.getElementById("cartModal")?.classList.remove("active"); }

// ══════════════════════════════════════════════════
// PLACE ORDER — with payment routing
// ══════════════════════════════════════════════════
async function placeOrder() {
  if (isLunchBreakNow()) {
    showToast("🚫 Ordering blocked during lunch break (1:10–2:00 PM). Visit canteen directly.", "error");
    return;
  }
  if (!cart.length) { showToast("Cart is empty", "error"); return; }
  if (!localStorage.getItem("token")) { showToast("Please login first", "error"); showPage("loginPage"); return; }

  const pickupTime    = document.getElementById("pickupTime")?.value;
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || "cash";

  if (!pickupTime) { showToast("Please select a pickup time", "error"); return; }

  if (paymentMethod === "online") {
    openUpiModal(pickupTime);   // show QR → upload screenshot flow
  } else {
    await placeOrderCash(pickupTime);
  }
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
// UPI / PHONEPE QR PAYMENT FLOW
// ══════════════════════════════════════════════════

// ★ Set your actual UPI ID here
const UPI_ID = "yourcollege@upi";

let _upiPickupTime   = "";
let _upiPendingOrder = null;  // order created before screenshot upload
let _upiScreenshotFile = null;

function openUpiModal(pickupTime) {
  _upiPickupTime    = pickupTime;
  _upiPendingOrder  = null;
  _upiScreenshotFile = null;

  // Reset UI
  document.getElementById("upiStep1").style.display = "block";
  document.getElementById("upiStep2").style.display = "none";
  document.getElementById("upiAmountDisplay").textContent = "₹" + getCartTotal();
  document.getElementById("upiIdDisplay").textContent     = UPI_ID;
  document.getElementById("upiUtrInput").value            = "";
  document.getElementById("upiScreenshotPreview").style.display = "none";
  document.getElementById("upiDropLabel").style.display  = "block";
  document.getElementById("upiScreenshotInput").value    = "";

  const btn = document.getElementById("upiConfirmBtn");
  if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }

  document.getElementById("upiModal").classList.add("active");
}

function closeUpiModal() {
  document.getElementById("upiModal").classList.remove("active");
}

function previewUpiScreenshot(input) {
  const file = input.files[0];
  if (!file) return;
  _upiScreenshotFile = file;
  const prev = document.getElementById("upiScreenshotPreview");
  const lbl  = document.getElementById("upiDropLabel");
  prev.src = URL.createObjectURL(file);
  prev.style.display = "block";
  lbl.style.display  = "none";
}

function handleUpiDrop(event) {
  event.preventDefault();
  document.getElementById("upiDropZone").style.borderColor = "rgba(249,115,22,0.4)";
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    _upiScreenshotFile = file;
    const prev = document.getElementById("upiScreenshotPreview");
    const lbl  = document.getElementById("upiDropLabel");
    prev.src = URL.createObjectURL(file);
    prev.style.display = "block";
    lbl.style.display  = "none";
  }
}

async function submitUpiPayment() {
  if (!_upiScreenshotFile) {
    showToast("Please upload your payment screenshot 📷", "error");
    return;
  }

  const btn = document.getElementById("upiConfirmBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Placing order..."; }

  try {
    // Step 1 — create the order (paymentMethod=online, status=pending, paymentStatus=unpaid)
    const orderRes  = await fetch(`${API}/api/orders`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({
        items: cart.map(i => ({ menuItem: i._id, quantity: i.qty })),
        pickupTime: _upiPickupTime,
        paymentMethod: "online",
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

    // Step 2 — upload the screenshot
    if (btn) btn.textContent = "Uploading screenshot...";
    const formData = new FormData();
    formData.append("screenshot", _upiScreenshotFile);
    formData.append("utrNumber",  document.getElementById("upiUtrInput").value || "");

    const uploadRes = await fetch(`${API}/api/orders/${_upiPendingOrder._id}/upload-payment`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + localStorage.getItem("token") },
      body: formData,
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      showToast(uploadData.error || "Screenshot upload failed", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }
      return;
    }

    // Success — clear cart and show confirmation screen
    cart = []; saveCart(); updateCartUI(); closeCart();
    document.getElementById("upiStep1").style.display = "none";
    document.getElementById("upiStep2").style.display = "block";

  } catch (err) {
    showToast("Network error: " + err.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "✅ I've Paid — Place Order"; }
  }
}

// ══════════════════════════════════════════════════
// LEGACY (unused — kept for reference)
// ══════════════════════════════════════════════════
async function placeOrderWithRazorpay(pickupTime) {
  const btn = document.getElementById("placeOrderBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Initialising payment..."; }

  try {
    const total = getCartTotal();

    // 1. Create Razorpay order on backend
    const rzpRes  = await fetch(`${API}/api/orders/create-razorpay`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({ amount: total }),
    });
    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) { showToast(rzpData.error || "Payment init failed", "error"); return; }

    // 2. Create the canteen order first (unpaid)
    const orderRes  = await fetch(`${API}/api/orders`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({
        items: cart.map(i => ({ menuItem: i._id, quantity: i.qty })),
        pickupTime, paymentMethod: "online", notes: `Pickup: ${pickupTime}`,
      }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) { showToast(orderData.error || "Order failed", "error"); return; }

    const canteenOrderId = orderData.order._id;
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    // 3. Open Razorpay checkout
    const options = {
      key:      rzpData.razorpayOrder.key_id || "",   // filled by Razorpay
      amount:   rzpData.razorpayOrder.amount,
      currency: "INR",
      name:     "CampusBites",
      description: "Canteen Order",
      order_id: rzpData.razorpayOrder.id,
      prefill:  { name: user.name, email: user.email },
      theme:    { color: "#f97316" },
      handler: async function(response) {
        // 4. Verify payment on backend
        const verRes  = await fetch(`${API}/api/orders/${canteenOrderId}/verify-payment`, {
          method: "POST", headers: getAuthHeaders(),
          body: JSON.stringify({
            razorpayPaymentId: response.razorpay_payment_id,
            razorpayOrderId:   response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          }),
        });
        const verData = await verRes.json();
        if (verData.success) {
          showToast("Payment successful! Order confirmed 🎉", "success");
          cart = []; saveCart(); updateCartUI(); closeCart();
        } else {
          showToast("Payment verification failed. Contact canteen.", "error");
        }
      },
      modal: { ondismiss: () => { showToast("Payment cancelled", "info"); } },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();

  } catch (err) {
    showToast("Payment error: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🎉 Place Order"; }
  }
}

// ══════════════════════════════════════════════════
// MY ORDERS
// ══════════════════════════════════════════════════
const STATUS_EMOJI = { pending:"⏳", confirmed:"✅", preparing:"🍳", ready:"🔔", delivered:"🎉", cancelled:"❌" };

// ── Per-order status cache for diff-based updates ──
const _myOrdersCache = new Map();

async function loadMyOrders() {
  const list = document.getElementById("ordersList");
  if (!list) return;

  // Only show skeleton on very first load (empty container)
  if (!list.querySelector(".order-card")) {
    list.innerHTML = "<p id='orders-loading' style='text-align:center;opacity:0.5;'>Loading...</p>";
  }

  try {
    const res    = await fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const orders = data.orders || [];

    if (!orders.length) {
      list.innerHTML = "<p style='text-align:center;padding:2rem;'>No orders yet 📋</p>";
      _myOrdersCache.clear();
      return;
    }

    // Remove loading placeholder if present
    document.getElementById("orders-loading")?.remove();

    const incomingIds = new Set(orders.map(o => o._id));

    // Remove cards that no longer exist
    list.querySelectorAll(".order-card[data-oid]").forEach(card => {
      if (!incomingIds.has(card.dataset.oid)) card.remove();
    });

    orders.forEach((o, idx) => {
      const existing  = list.querySelector(`.order-card[data-oid="${o._id}"]`);
      const active    = ["pending","confirmed","preparing","ready"].includes(o.status);
      const isOnline  = o.paymentMethod === "online";
      const isPending = o.paymentStatus === "awaiting_verification";

      // Payment label — show verification status for UPI orders
      let payLabel = isOnline ? "💳 UPI" : "💵 Cash";
      if (isOnline && isPending)             payLabel = "⏳ Payment verifying...";
      else if (isOnline && o.paymentStatus === "paid") payLabel = "✅ UPI Paid";
      else if (o.paymentStatus === "rejected")          payLabel = "❌ Payment rejected";

      if (!existing) {
        // Brand new card — build and insert
        const div   = document.createElement("div");
        div.innerHTML = _buildMyOrderCard(o, active, payLabel);
        const card  = div.firstElementChild;
        // Insert at correct position
        const refNode = list.children[idx] || null;
        list.insertBefore(card, refNode);
        _myOrdersCache.set(o._id, o.status + "|" + o.paymentStatus);
      } else {
        const cacheKey = o.status + "|" + o.paymentStatus;
        if (_myOrdersCache.get(o._id) !== cacheKey) {
          // Only patch the parts that changed — NO full rebuild
          const badge = existing.querySelector(".order-status");
          if (badge) {
            badge.className   = `order-status ${o.status}`;
            badge.textContent = `${STATUS_EMOJI[o.status]||""} ${o.status.toUpperCase()}`;
          }
          const payEl = existing.querySelector(".pay-label-inline");
          if (payEl) payEl.textContent = payLabel;
          const btnRow = existing.querySelector(".order-btn-row");
          if (btnRow) btnRow.innerHTML = _buildMyOrderButtons(o, active);
          _myOrdersCache.set(o._id, cacheKey);
        }
        // else nothing changed — skip entirely, zero DOM work
      }
    });

  } catch { list.innerHTML = "<p>Failed to load orders</p>"; }
}

function _buildMyOrderCard(o, active, payLabel) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
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
// Helper: set text of element by id without rebuilding DOM
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(val)) el.textContent = val;
}

// First-time stats skeleton — only built once
function _buildStatsSkeleton() {
  const defs = [
    { container: "adminStats", cards: [
      { id: "stat-pending",   icon: "⏳", label: "Pending" },
      { id: "stat-preparing", icon: "🍳", label: "Preparing" },
      { id: "stat-ready",     icon: "🔔", label: "Ready" },
      { id: "stat-users",     icon: "👥", label: "Students" },
    ]},
    { container: "dailyStats", cards: [
      { id: "stat-todayOrders",  icon: "📋", label: "Today Orders",  cls: "stat-today" },
      { id: "stat-todayRev",     icon: "💰", label: "Today Revenue", cls: "stat-today" },
    ]},
    { container: "monthlyStats", cards: [
      { id: "stat-monthOrders",  icon: "📅", label: "This Month Orders",  cls: "stat-month" },
      { id: "stat-monthRev",     icon: "💵", label: "This Month Revenue", cls: "stat-month" },
    ]},
    { container: "allTimeStats", cards: [
      { id: "stat-totalOrders",  icon: "📦", label: "All Orders",     cls: "stat-total" },
      { id: "stat-totalRev",     icon: "🏆", label: "Total Revenue",  cls: "stat-total" },
      { id: "stat-menuItems",    icon: "🍽️", label: "Menu Items",    cls: "stat-total" },
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

    // Update only the number values — no DOM wipe, no flicker
    _setText("stat-pending",      s.pendingOrders  || 0);
    _setText("stat-preparing",    s.preparingOrders|| 0);
    _setText("stat-ready",        s.readyOrders    || 0);
    _setText("stat-users",        s.totalUsers     || 0);
    _setText("stat-todayOrders",  s.todayOrders    || 0);
    _setText("stat-todayRev",    "₹" + (s.todayRevenue  || 0));
    _setText("stat-monthOrders",  s.monthOrders    || 0);
    _setText("stat-monthRev",    "₹" + (s.monthRevenue  || 0));
    _setText("stat-totalOrders",  s.totalOrders    || 0);
    _setText("stat-totalRev",    "₹" + (s.totalRevenue  || 0));
    _setText("stat-menuItems",    s.totalMenuItems || 0);

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
// ADMIN — ORDERS (3-phase pipeline)
// ══════════════════════════════════════════════════

// lane each order belongs to, keyed by order._id
const _ordersCache = new Map();   // orderId → { status, lane }

// ── Build the HTML for one order card ────────────
function _buildOrderCard(o, next, btnLabel, color) {
  const displayName = o.customerName
    || (o.user && typeof o.user === "object" && o.user.name)
    || "Student";
  const email = o.user && typeof o.user === "object" ? o.user.email : "";
  const walkinBadge = o.createdByAdmin ? '<span class="badge-walkin">Walk-in</span>' : "";
  const payLabel    = o.paymentMethod === "online" ? "💳 UPI" : "💵 Cash";

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
        ${o.user && o.user.rollNumber ? `<p style="font-size:0.78rem;font-family:monospace;color:#f97316;margin:3px 0 0;letter-spacing:0.5px;">🎓 ${o.user.rollNumber}${o.user.branch ? " · " + o.user.branch : ""}</p>` : ""}
        ${email ? `<p style="font-size:0.72rem;opacity:0.45;margin:2px 0 0;">${email}</p>` : ""}
      </div>
      <p style="font-size:0.72rem;opacity:0.45;margin:0 0 8px;">${new Date(o.createdAt).toLocaleTimeString()} · ${payLabel}</p>
      <hr style="opacity:0.12;margin:0 0 8px;"/>
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

// ── Ensure a lane section exists in the container ─
function _ensureSection(container, id, title, icon, color) {
  let section = document.getElementById(`section-${id}`);
  if (!section) {
    section = document.createElement("div");
    section.className = "order-section";
    section.id        = `section-${id}`;
    section.innerHTML = `
      <h3 class="order-section-title" style="color:${color};">
        ${icon} ${title} <span class="section-count" id="count-${id}">0</span>
      </h3>
      <div class="orders-grid" id="grid-${id}"></div>`;
    container.appendChild(section);
  }
  return section;
}

// ── Helper: animate a card into a grid ───────────
function _animateCardIn(card, grid) {
  card.style.opacity   = "0";
  card.style.transform = "scale(0.95)";
  grid.appendChild(card);
  requestAnimationFrame(() => {
    card.style.transition = "opacity 0.25s, transform 0.25s";
    card.style.opacity    = "1";
    card.style.transform  = "scale(1)";
  });
}

// ── Helper: animate a card out and remove it ─────
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
  const container = document.getElementById("adminContent");
  if (!container) return;

  try {
    const res    = await fetch(`${API}/api/admin/orders?limit=100`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const active = (data.orders || []).filter(o => _laneOf(o.status));

    // ── EMPTY STATE ───────────────────────────────
    if (!active.length) {
      container.innerHTML = '<div style="text-align:center;padding:3rem;opacity:0.4;font-size:1.3rem;">🎉 No active orders right now</div>';
      _ordersCache.clear();
      return;
    }

    // If container only has the empty message, clear it to start fresh
    if (!container.querySelector(".order-section")) {
      container.innerHTML = "";
      _ordersCache.clear();
    }

    // ── LANE CONFIG ───────────────────────────────
    const laneConfig = {
      new:       { title: "New Orders",   icon: "⏳", color: "#f97316", next: "preparing", label: "🍳 Start Preparing" },
      preparing: { title: "Preparing",    icon: "🍳", color: "#0d6efd", next: "ready",     label: "🔔 Mark Ready"      },
      ready:     { title: "Ready Pickup", icon: "🔔", color: "#048A81", next: "delivered", label: "🎉 Delivered"        },
    };

    const activeIds = new Set(active.map(o => o._id));

    // ── REMOVE gone orders ─────────────────────────
    _ordersCache.forEach((cached, oid) => {
      if (!activeIds.has(oid)) {
        const card = document.getElementById(`order-${oid}`);
        if (card) _animateCardOut(card);
        _ordersCache.delete(oid);
      }
    });

    // ── PROCESS each order ────────────────────────
    active.forEach(o => {
      const newLane  = _laneOf(o.status);
      const cfg      = laneConfig[newLane];
      const section  = _ensureSection(container, newLane, cfg.title, cfg.icon, cfg.color);
      const grid     = document.getElementById(`grid-${newLane}`);
      const cached   = _ordersCache.get(o._id);
      const existingCard = document.getElementById(`order-${o._id}`);

      if (!cached) {
        // Brand-new order — build and insert
        const div   = document.createElement("div");
        div.innerHTML = _buildOrderCard(o, cfg.next, cfg.label, cfg.color);
        _animateCardIn(div.firstElementChild, grid);
        _ordersCache.set(o._id, { status: o.status, lane: newLane });

      } else if (cached.status !== o.status) {
        // Status changed — check if lane also changed
        if (cached.lane !== newLane) {
          // ── Move card to new lane: remove from old, add to new ──
          if (existingCard) {
            _animateCardOut(existingCard, () => {
              // Rebuild card with new button/color for new lane
              const div = document.createElement("div");
              div.innerHTML = _buildOrderCard(o, cfg.next, cfg.label, cfg.color);
              _animateCardIn(div.firstElementChild, grid);
            });
          }
        } else {
          // Same lane, just update the status badge in-place
          if (existingCard) {
            const badge = existingCard.querySelector(".order-status");
            if (badge) { badge.className = `order-status ${o.status}`; badge.textContent = o.status.toUpperCase(); }
            existingCard.dataset.status = o.status;
          }
        }
        _ordersCache.set(o._id, { status: o.status, lane: newLane });
      }
      // cached.status === o.status → nothing changed, zero DOM work
    });

    // ── UPDATE section counts + visibility ────────
    Object.entries(laneConfig).forEach(([id, cfg]) => {
      const section = document.getElementById(`section-${id}`);
      const grid    = document.getElementById(`grid-${id}`);
      const countEl = document.getElementById(`count-${id}`);
      if (!section) return;
      const count = grid ? grid.querySelectorAll(".order-card").length : 0;
      if (countEl) countEl.textContent = count;
      section.style.display = count > 0 ? "block" : "none";
    });

  } catch(err) { console.error("loadAdminOrders:", err); }
}

// ── Admin clicks a phase button ───────────────────
async function updateOrderStatus(id, status, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Updating..."; }
  try {
    const res = await fetch(`${API}/api/admin/orders/${id}/status`, {
      method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      showToast("Update failed", "error");
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || "Update"; }
      return;
    }
    showToast(`Order moved to ${status} ✅`, "success");

    // If delivered/cancelled — card will be removed on next poll
    // Force an immediate poll so it happens right away
    _ordersCache.delete(id);   // clear cache so next loadAdminOrders sees it fresh
    await loadAdminOrders();
    loadAdminStats();
  } catch {
    showToast("Network error", "error");
    if (btn) { btn.disabled = false; }
  }
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

  // Always wipe the shared content area and reset order cache when switching tabs
  // This ensures no stale DOM from a previous tab bleeds through
  const content = document.getElementById("adminContent");
  if (content) content.innerHTML = "";
  _ordersCache.clear();

  if (tab === "orders")   loadAdminOrders();
  if (tab === "payments") loadAdminPayments();
  if (tab === "menu")     loadAdminMenu();
  if (tab === "users")    loadAdminUsers();
}

// ══════════════════════════════════════════════════
// ADMIN — UPI PAYMENT VERIFICATION
// ══════════════════════════════════════════════════
async function loadAdminPayments() {
  const content = document.getElementById("adminContent");
  if (!content) return;
  content.innerHTML = "<p style='text-align:center;padding:2rem;opacity:0.5;'>Loading...</p>";

  try {
    const res  = await fetch(`${API}/api/admin/pending-payments`, { headers: getAuthHeaders() });
    const data = await res.json();
    const orders = data.orders || [];

    // Update badge count
    const badge = document.getElementById("pendingPaymentsBadge");
    if (badge) {
      if (orders.length) {
        badge.textContent     = orders.length;
        badge.style.display   = "inline";
      } else {
        badge.style.display   = "none";
      }
    }

    if (!orders.length) {
      content.innerHTML = `
        <div style="text-align:center;padding:3rem;opacity:0.4;font-size:1.1rem;">
          ✅ No pending payment verifications
        </div>`;
      return;
    }

    content.innerHTML = `
      <h3 style="margin-bottom:1rem;">💳 Pending UPI Verifications
        <span style="background:#e63946;color:#fff;border-radius:99px;padding:2px 10px;font-size:0.8rem;margin-left:8px;">${orders.length}</span>
      </h3>
      <div class="orders-grid">
        ${orders.map(o => `
          <div class="order-card" id="pmt-${o._id}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <b>#${o._id.slice(-6).toUpperCase()}</b>
              <span class="order-status pending">⏳ AWAITING VERIFICATION</span>
            </div>
            <p><b>👤</b> ${o.user?.name || "N/A"}</p>
            <p style="font-size:0.78rem;opacity:0.55;">${o.user?.email || ""} · ${new Date(o.createdAt).toLocaleString()}</p>
            <hr style="opacity:0.15;margin:8px 0;"/>
            ${o.items.map(i => `<div style="display:flex;justify-content:space-between;font-size:0.9rem;padding:2px 0;"><span>• ${i.name} × ${i.quantity}</span><span>₹${i.price * i.quantity}</span></div>`).join("")}
            <p style="font-weight:700;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">Total: ₹${o.totalAmount}</p>
            ${o.paymentUtrNote ? `<p style="font-size:0.8rem;opacity:0.6;margin-top:4px;">🔖 UTR: ${o.paymentUtrNote}</p>` : ""}
            ${o.notes ? `<p style="font-size:0.8rem;opacity:0.55;">📝 ${o.notes}</p>` : ""}

            ${o.paymentScreenshot ? `
              <a href="${o.paymentScreenshot}" target="_blank" rel="noopener">
                <img src="${o.paymentScreenshot}" alt="Payment screenshot"
                     style="width:100%;max-height:200px;object-fit:contain;border-radius:10px;
                            margin:10px 0;cursor:pointer;border:1px solid rgba(249,115,22,0.4);"
                     onerror="this.style.display='none'"/>
              </a>
              <p style="font-size:0.75rem;opacity:0.4;margin-bottom:10px;">Tap image to open full size</p>
            ` : `<p style="opacity:0.4;font-size:0.85rem;margin:10px 0;">⚠️ No screenshot uploaded</p>`}

            <div style="display:flex;gap:8px;margin-top:4px;">
              <button class="btn-primary" style="flex:1;background:#2D6A4F;"
                onclick="verifyUpiPayment('${o._id}', true)">
                ✅ Approve & Confirm
              </button>
              <button class="btn-primary" style="flex:1;background:#e63946;"
                onclick="verifyUpiPayment('${o._id}', false)">
                ❌ Reject
              </button>
            </div>
          </div>`).join("")}
      </div>`;
  } catch (err) {
    console.error("loadAdminPayments:", err);
    content.innerHTML = "<p style='padding:2rem;'>Failed to load</p>";
  }
}

async function verifyUpiPayment(orderId, approved) {
  const card = document.getElementById(`pmt-${orderId}`);
  if (card) {
    card.style.opacity       = "0.5";
    card.style.pointerEvents = "none";
  }
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

    showToast(
      approved ? "✅ Payment approved — order confirmed!" : "❌ Payment rejected — order cancelled",
      approved ? "success" : "info"
    );

    // After approval, the order status becomes "confirmed" so it shows in Admin Orders tab
    // Animate card out and refresh both payments + orders pipeline
    if (card) {
      card.style.transition = "opacity 0.4s, transform 0.4s";
      card.style.transform  = "scale(0.9)";
      card.style.opacity    = "0";
      setTimeout(() => {
        card.remove();
        loadAdminPayments();
        // Also refresh orders pipeline — approved order should now appear there
        if (approved) {
          _ordersCache.clear();   // force orders to re-render the new confirmed order
          loadAdminOrders();
        }
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

// ── Menu Item Modal ───────────────────────────────
let editingItemId = null;

async function openMenuModal(itemId = null) {
  editingItemId = itemId;
  const modal = document.getElementById("menuItemModal");
  const title = document.getElementById("menuModalTitle");
  if (!modal) return;

  // Reset form
  ["miName","miDesc","miPrice","miImage","miPrepTime"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("miCategory").value  = "snacks";
  document.getElementById("miAvailable").checked = true;

  if (itemId) {
    title.textContent = "✏️ Edit Menu Item";
    try {
      const res  = await fetch(`${API}/api/menu/${itemId}`);
      const data = await res.json();
      const item = data.item;
      if (item) {
        document.getElementById("miName").value      = item.name || "";
        document.getElementById("miDesc").value      = item.description || "";
        document.getElementById("miPrice").value     = item.price || "";
        document.getElementById("miCategory").value  = item.category || "snacks";
        document.getElementById("miImage").value     = item.image || "";
        document.getElementById("miPrepTime").value  = item.preparationTime || 10;
        document.getElementById("miAvailable").checked = item.isAvailable !== false;
      }
    } catch {}
  } else {
    title.textContent = "➕ Add Menu Item";
  }
  modal.classList.add("active");
}

function closeMenuModal() {
  document.getElementById("menuItemModal")?.classList.remove("active");
  editingItemId = null;
}

async function saveMenuItem() {
  const name     = document.getElementById("miName").value.trim();
  const price    = parseFloat(document.getElementById("miPrice").value);
  const category = document.getElementById("miCategory").value;
  if (!name || isNaN(price)) { showToast("Name and price are required", "error"); return; }

  const payload = {
    name,
    description:     document.getElementById("miDesc").value.trim(),
    price,
    category,
    image:           document.getElementById("miImage").value.trim(),
    preparationTime: parseInt(document.getElementById("miPrepTime").value) || 10,
    isAvailable:     document.getElementById("miAvailable").checked,
  };

  const saveBtn = document.getElementById("saveMenuBtn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

  try {
    const url    = editingItemId ? `${API}/api/admin/menu/${editingItemId}` : `${API}/api/admin/menu`;
    const method = editingItemId ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
    const data   = await res.json();
    if (!res.ok) { showToast(data.error || "Failed to save", "error"); return; }
    showToast(editingItemId ? "Item updated ✅" : "Item added ✅", "success");
    closeMenuModal();
    loadAdminMenu();
    loadMenu();
  } catch { showToast("Network error", "error"); }
  finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Item"; } }
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
    showToast("Deleted", "info");
    loadAdminMenu(); loadMenu();
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
    const res  = await fetch(`${API}/api/admin/users`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data  = await res.json();
    const users = data.users || [];

    if (!users.length) {
      content.innerHTML = "<p style='text-align:center;padding:3rem;opacity:0.4;'>No students registered yet</p>";
      return;
    }

    // Use totalOrders + totalSpent already tracked on the User doc — no extra fetch needed
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">
          👥 Registered Students
          <span style="font-size:0.85rem;font-weight:400;opacity:0.5;margin-left:8px;">${users.length} total</span>
        </h3>
        <input type="text" class="form-input" placeholder="🔍 Name / roll number / email..."
               style="max-width:260px;padding:8px 12px;font-size:0.88rem;"
               oninput="filterStudentsTable(this.value)"/>
      </div>
      <div class="users-table-wrap">
        <table class="stats-table" id="studentsTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Roll No.</th>
              <th>Branch</th>
              <th>Phone</th>
              <th>Orders</th>
              <th>Spent</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr data-search="${[u.name, u.email, u.rollNumber||"", u.branch||"", u.phone||""].join(" ").toLowerCase()}">
                <td>
                  <div style="font-weight:700;font-size:0.95rem;">${u.name}</div>
                  <div style="font-size:0.73rem;opacity:0.45;margin-top:2px;">${u.email}</div>
                </td>
                <td>
                  <span style="font-family:monospace;font-weight:700;font-size:0.88rem;color:#f97316;letter-spacing:0.5px;">
                    ${u.rollNumber || '<span style="color:rgba(255,255,255,0.25);font-weight:400;">—</span>'}
                  </span>
                </td>
                <td style="font-size:0.88rem;">${u.branch || '<span style="opacity:0.3;">—</span>'}</td>
                <td style="font-size:0.85rem;">${u.phone || '<span style="opacity:0.3;">—</span>'}</td>
                <td style="text-align:center;font-weight:700;">${u.totalOrders || 0}</td>
                <td style="font-weight:600;">₹${(u.totalSpent || 0).toLocaleString("en-IN")}</td>
                <td style="font-size:0.8rem;opacity:0.55;">${new Date(u.createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</td>
                <td>
                  <span class="${u.isBanned ? "badge-banned" : "badge-active"}">
                    ${u.isBanned ? "🚫 Banned" : "✅ Active"}
                  </span>
                </td>
                <td>
                  ${u.isBanned
                    ? `<button class="btn-primary" style="padding:5px 12px;font-size:0.78rem;background:#2D6A4F;white-space:nowrap;" onclick="banUser('${u._id}',false,'')">Unban</button>`
                    : `<button class="btn-primary" style="padding:5px 12px;font-size:0.78rem;background:#e63946;white-space:nowrap;" onclick="promptBan('${u._id}')">Ban</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

  } catch(err) {
    console.error("loadAdminUsers:", err);
    content.innerHTML = `<p style='padding:2rem;color:#e63946;'>❌ Failed to load students. <button class="btn-secondary" onclick="loadAdminUsers()">Retry</button></p>`;
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
// ADMIN — ADD ORDER MODAL
// ══════════════════════════════════════════════════
function openAddOrderModal() {
  aoCart = [];
  ["aoCustomerName","aoNotes","aoItemSearch"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.querySelector('input[name="aoPayment"][value="paid"]').checked = true;
  renderAoMenu(menuItems.filter(i => i.isAvailable !== false));
  renderAoSummary(); renderAoSuggestions();
  document.getElementById("addOrderModal")?.classList.add("active");
}

function closeAddOrderModal() {
  document.getElementById("addOrderModal")?.classList.remove("active");
}

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
              <button class="qty-btn plus"  onclick="aoIncrease('${item._id}')">+</button>
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
function aoRemoveItem(id) {
  aoCart = aoCart.filter(c => c._id !== id);
  refreshAoRow(id); renderAoSummary(); renderAoSuggestions();
}

function refreshAoRow(id) {
  const row = document.getElementById(`ao-item-${id}`); if (!row) return;
  const qty  = aoCart.find(c => c._id === id)?.qty || 0;
  row.classList.toggle("ao-item-selected", qty > 0);
  const qEl  = row.querySelector(".ao-qty-display");
  const mBtn = row.querySelector(".qty-btn.minus");
  if (qEl)  qEl.textContent = qty;
  if (mBtn) mBtn.disabled   = qty === 0;
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

  const has = cats => cartCats.some(c => cats.includes(c));
  const find = cats => avail.find(i => cats.includes((i.category||"").toLowerCase()));

  if (!has(["beverages","drinks","juice","tea","coffee"])) {
    const d = find(["beverages","drinks","juice","tea","coffee"]);
    if (d) sugs.push({ item: d, reason: "🥤 Add a drink?" });
  }
  if (!has(["lunch","dinner","breakfast","meals"]) && has(["snacks"])) {
    const m = find(["lunch","dinner","breakfast","meals"]);
    if (m) sugs.push({ item: m, reason: "🍱 Add a main meal?" });
  }
  if (!has(["dessert","desserts","sweets"]) && has(["lunch","dinner"])) {
    const des = find(["dessert","desserts","sweets"]);
    if (des) sugs.push({ item: des, reason: "🍮 Add a dessert?" });
  }
  cartCats.forEach(cat => {
    if (sugs.length >= 4) return;
    const extra = avail.find(i => (i.category||"").toLowerCase() === cat && !sugs.find(s => s.item._id === i._id));
    if (extra) sugs.push({ item: extra, reason: `✨ Also from ${cat}` });
  });

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
// AUTO-REFRESH
// ══════════════════════════════════════════════════
// ── Admin orders: refresh every 1 second when on orders tab ──
// ── Payments/stats: refresh every 5 seconds ──
// ── Lunch banner: every 60 seconds ──

let _adminFastTick = 0;
setInterval(async () => {
  if (document.hidden) return;
  const adminPage = document.getElementById("adminPage");
  _adminFastTick++;

  if (adminPage?.classList.contains("active")) {
    // Orders: every tick (1s) — so admin sees new orders and phase changes instantly
    if (currentAdminTab === "orders")   loadAdminOrders();
    // Payments: every 3 ticks (3s)
    if (currentAdminTab === "payments" && _adminFastTick % 3 === 0) loadAdminPayments();
    // Stats + badge: every 5 ticks (5s)
    if (_adminFastTick % 5 === 0) { loadAdminStats(); refreshPaymentsBadge(); }
    // Notifications check: every 5 ticks
    if (_adminFastTick % 5 === 0 && _notifEnabled) {
      try {
        const r = await fetch(`${API}/api/admin/orders?limit=100`, { headers: getAuthHeaders() });
        const d = await r.json();
        _checkAndNotifyNewOrders(d.orders || []);
      } catch {}
    }
  }
  // Lunch banner: every 60 ticks (60s)
  if (_adminFastTick % 60 === 0) updateLunchBanner();
}, 1000);

// Silently refresh just the payments badge count
async function refreshPaymentsBadge() {
  try {
    const res  = await fetch(`${API}/api/admin/pending-payments`, { headers: getAuthHeaders() });
    const data = await res.json();
    const badge = document.getElementById("pendingPaymentsBadge");
    if (!badge) return;
    const count = (data.orders || []).length;
    if (count > 0) {
      badge.textContent   = count;
      badge.style.display = "inline";
    } else {
      badge.style.display = "none";
    }
  } catch {}
}

// ══════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  if ((e.ctrlKey||e.metaKey) && e.key === "k") { e.preventDefault(); document.getElementById("searchInput")?.focus(); }
  if ((e.ctrlKey||e.metaKey) && e.key === "b") { e.preventDefault(); openCart(); }
  if (e.key === "Escape") { closeCart(); closeMenuModal(); closeAddOrderModal(); }
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
  // Check lunch break every minute
  setInterval(updateLunchBanner, 60000);
});

// ══════════════════════════════════════════════════
// ORDER TRACKING — Live status with progress steps
// ══════════════════════════════════════════════════
let trackingInterval = null;

function trackOrder(orderId) {
  showPage("trackPage");
  clearInterval(trackingInterval);
  renderTrackSkeleton(orderId);
  fetchAndRenderTrack(orderId);
  // Poll every 8 seconds for live updates
  trackingInterval = setInterval(() => fetchAndRenderTrack(orderId), 8000);
}

async function fetchAndRenderTrack(orderId) {
  try {
    const res  = await fetch(`${API}/api/orders/${orderId}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok || !data.order) return;
    renderTrackUI(data.order);
    // Stop polling once delivered or cancelled
    if (["delivered","cancelled"].includes(data.order.status)) {
      clearInterval(trackingInterval);
    }
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
    { key: "pending",   label: "Order Placed",  icon: "🛒", desc: "Your order has been received" },
    { key: "confirmed", label: "Confirmed",      icon: "✅", desc: "Canteen confirmed your order" },
    { key: "preparing", label: "Preparing",      icon: "🍳", desc: "Your food is being prepared" },
    { key: "ready",     label: "Ready!",         icon: "🔔", desc: "Come pick up your order!" },
    { key: "delivered", label: "Picked Up",      icon: "🎉", desc: "Enjoy your meal!" },
  ];

  const cancelled = order.status === "cancelled";
  const currentIdx = cancelled ? -1 : STEPS.findIndex(s => s.key === order.status);

  const stepHTML = STEPS.map((step, idx) => {
    const done    = !cancelled && idx <= currentIdx;
    const active  = !cancelled && idx === currentIdx;
    return `
      <div class="track-step ${done ? "done" : ""} ${active ? "active" : ""}">
        <div class="track-step-icon">${done ? step.icon : (active ? step.icon : "○")}</div>
        <div class="track-step-info">
          <div class="track-step-label">${step.label}</div>
          <div class="track-step-desc">${active ? step.desc : ""}</div>
        </div>
        ${idx < STEPS.length - 1 ? '<div class="track-connector"></div>' : ""}
      </div>`;
  }).join("");

  const progressPct = cancelled ? 0 : Math.round(((currentIdx + 1) / STEPS.length) * 100);

  el.innerHTML = `
    <div class="track-card">
      <div class="track-header">
        <div>
          <h3>#${order._id.slice(-6).toUpperCase()}</h3>
          <p style="opacity:0.55;font-size:0.85rem;">${new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span class="order-status ${order.status}">${order.status.toUpperCase()}</span>
      </div>

      ${cancelled ? `<div class="track-cancelled">❌ This order was cancelled</div>` : `
        <div class="track-progress-bar-wrap">
          <div class="track-progress-bar" style="width:${progressPct}%"></div>
        </div>
        <div class="track-steps">${stepHTML}</div>
      `}

      <div class="track-items">
        <h4 style="margin-bottom:10px;">🛒 Items</h4>
        ${order.items.map(i => `
          <div class="track-item-row">
            <span>${i.name} × ${i.quantity}</span>
            <span>₹${i.price * i.quantity}</span>
          </div>`).join("")}
        <div class="track-item-row" style="font-weight:700;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;margin-top:6px;">
          <span>Total</span><span>₹${order.totalAmount}</span>
        </div>
      </div>

      ${order.status === "ready" ? `
        <div class="track-ready-banner">
          🔔 Your order is ready! Head to the canteen counter now.
        </div>` : ""}

      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="showPage('ordersPage')">← Back to Orders</button>
        ${["pending","confirmed"].includes(order.status) ? `<button class="btn-primary" style="flex:1;" onclick="cancelOrder('${order._id}')">Cancel Order</button>` : ""}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════
// BROWSER NOTIFICATIONS (no VAPID / server push needed)
// Uses the standard Notification API — works instantly,
// no external service required.
// ══════════════════════════════════════════════════
let _notifEnabled = false;

async function requestPushPermission() {
  const btn = document.getElementById("notifBtn");
  if (!("Notification" in window)) {
    showToast("Notifications not supported in this browser", "error");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Notification permission denied", "error");
    return;
  }

  _notifEnabled = true;
  if (btn) { btn.textContent = "🔔 Notifications ON"; btn.style.background = "#2D6A4F"; }
  showToast("Notifications enabled ✅ You'll be alerted on new orders.", "success");

  // Test notification
  _sendNotification("🎉 CampusBites Notifications ON", "You'll get alerts when new orders arrive.");
}

function _sendNotification(title, body, icon) {
  if (!_notifEnabled || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: icon || "/images/upi-qr.png",
      badge: "/images/upi-qr.png",
      tag: "campusbites",
    });
  } catch(e) {}
}

// ── Call this when a new order arrives (used in polling) ──
let _lastOrderCount = null;
function _checkAndNotifyNewOrders(orders) {
  const count = orders.filter(o => ["pending","confirmed"].includes(o.status)).length;
  if (_lastOrderCount !== null && count > _lastOrderCount) {
    const diff = count - _lastOrderCount;
    _sendNotification(
      `🛎️ ${diff} New Order${diff > 1 ? "s" : ""}!`,
      `You have ${count} order${count > 1 ? "s" : ""} waiting to be prepared.`
    );
  }
  _lastOrderCount = count;
}

// ══════════════════════════════════════════════════
// EXPORT ORDERS — Excel & PDF (client-side)
// ══════════════════════════════════════════════════
function openExportModal() {
  // Pre-fill today's date
  const today = new Date().toISOString().split("T")[0];
  const el    = document.getElementById("exportTo");
  if (el && !el.value) el.value = today;
  document.getElementById("exportModal")?.classList.add("active");
}
function closeExportModal() {
  document.getElementById("exportModal")?.classList.remove("active");
}

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
  } catch (err) {
    showToast("Export error: " + err.message, "error");
  }
}

function exportToExcel(rows, from, to) {
  const XLSX = window.XLSX;
  if (!XLSX) { showToast("Excel library not loaded", "error"); return; }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 40 },
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 24 },
  ];

  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orders");

  const filename = `CampusBites_Orders_${from || "all"}_to_${to || "now"}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast(`Excel downloaded (${rows.length} orders) ✅`, "success");
}

function exportToPDF(rows, from, to) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast("PDF library not loaded", "error"); return; }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Header
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("CampusBites — Orders Report", 14, 14);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const dateRange = from && to ? `${from} → ${to}` : "All dates";
  doc.text(`Period: ${dateRange}  |  Total: ${rows.length} orders`, 200, 14);
  doc.setTextColor(0, 0, 0);

  // Table
  doc.autoTable({
    startY: 26,
    head: [["Order ID", "Customer", "Items", "Total", "Payment", "Status", "Date"]],
    body: rows.map(r => [
      r["Order ID"], r["Customer"],
      r["Items"].length > 50 ? r["Items"].slice(0, 50) + "..." : r["Items"],
      "₹" + r["Total (₹)"], r["Payment"], r["Status"], r["Date"],
    ]),
    styles:       { fontSize: 8, cellPadding: 3 },
    headStyles:   { fillColor: [249, 115, 22], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    columnStyles: { 2: { cellWidth: 70 } },
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount} — Generated ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.height - 6);
  }

  const filename = `CampusBites_Orders_${from||"all"}_to_${to||"now"}.pdf`;
  doc.save(filename);
  showToast(`PDF downloaded (${rows.length} orders) ✅`, "success");
}

// ══════════════════════════════════════════════════
// MENU ITEM IMAGE UPLOAD — Cloudinary direct upload
// ══════════════════════════════════════════════════
// Uses Cloudinary's unsigned upload preset (free tier, no backend needed)
// Setup: cloudinary.com → Settings → Upload → Add unsigned preset

const CLOUDINARY_CLOUD = "your_cloud_name";      // ← replace with your Cloudinary cloud name
const CLOUDINARY_PRESET = "campusbites_menu";    // ← replace with your unsigned upload preset

async function uploadMenuImage(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) { showToast("Image must be under 5MB", "error"); return null; }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  formData.append("folder", "campusbites-menu");

  showToast("Uploading image...", "info");
  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: "POST", body: formData,
    });
    const data = await res.json();
    if (data.secure_url) {
      showToast("Image uploaded ✅", "success");
      return data.secure_url;
    }
    showToast("Cloudinary upload failed — using URL field instead", "error");
    return null;
  } catch {
    showToast("Image upload failed — using URL field instead", "error");
    return null;
  }
}

// loadMyOrders is defined above — no duplicate needed

// ══════════════════════════════════════════════════
// PATCH openMenuModal — add image upload input
// ══════════════════════════════════════════════════
const _origOpenMenuModal = openMenuModal;
async function openMenuModal(itemId = null) {
  editingItemId = itemId;
  const modal = document.getElementById("menuItemModal");
  const title = document.getElementById("menuModalTitle");
  if (!modal) return;

  ["miName","miDesc","miPrice","miImage","miPrepTime"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("miCategory").value    = "snacks";
  document.getElementById("miAvailable").checked = true;

  // Reset upload UI
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
        if (item.image && uploadPrev) {
          uploadPrev.src = item.image;
          uploadPrev.style.display = "block";
        }
      }
    } catch {}
  } else {
    title.textContent = "➕ Add Menu Item";
  }
  modal.classList.add("active");
}

// Patch saveMenuItem to handle image file upload
const _origSaveMenuItem = saveMenuItem;
async function saveMenuItem() {
  const name     = document.getElementById("miName").value.trim();
  const price    = parseFloat(document.getElementById("miPrice").value);
  const category = document.getElementById("miCategory").value;
  if (!name || isNaN(price)) { showToast("Name and price are required", "error"); return; }

  // Try Cloudinary upload if file selected
  let imageUrl = document.getElementById("miImage").value.trim();
  const fileInput = document.getElementById("miImageFile");
  if (fileInput?.files?.[0]) {
    const uploaded = await uploadMenuImage(fileInput.files[0]);
    if (uploaded) imageUrl = uploaded;
  }

  const payload = {
    name, price, category, image: imageUrl,
    description:     document.getElementById("miDesc").value.trim(),
    preparationTime: parseInt(document.getElementById("miPrepTime").value) || 10,
    isAvailable:     document.getElementById("miAvailable").checked,
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

// Image file preview handler — attach after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("miImageFile")?.addEventListener("change", function() {
    const file = this.files[0];
    if (!file) return;
    const preview = document.getElementById("miImagePreview");
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }
    // Clear manual URL when file chosen
    document.getElementById("miImage").value = "";
  });
});

// ══════════════════════════════════════════════════
// LUNCH BREAK — only blocks student online orders
// Admin walk-in orders always go through (POST /api/admin/orders)
// ══════════════════════════════════════════════════
// Patch updateLunchBanner to show softer messaging
const _origUpdateLunchBanner = updateLunchBanner;
function updateLunchBanner() {
  const banner   = document.getElementById("lunchBanner");
  const placeBtn = document.getElementById("placeOrderBtn");
  const msgEl    = document.getElementById("lunchBannerMsg");
  if (!banner) return;

  if (isLunchBreakNow()) {
    banner.style.display = "flex";
    if (msgEl) msgEl.textContent = "🍽️ Online ordering paused (1:10–2:00 PM) — Visit the canteen counter directly for lunch!";
    if (placeBtn) {
      placeBtn.disabled    = true;
      placeBtn.textContent = "🚫 Visit Canteen (Lunch Break)";
    }
  } else {
    banner.style.display = "none";
    if (placeBtn) {
      placeBtn.disabled    = false;
      placeBtn.textContent = "🎉 Place Order";
    }
  }
}