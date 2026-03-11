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
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  if (id === "adminPage")   { loadAdminStats(); setAdminTab("orders"); }
  if (id === "ordersPage")  { loadMyOrders(); }
  if (id === "profilePage") { loadProfile(); }
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
  const firstName = document.getElementById("regFirstName").value.trim();
  const lastName  = document.getElementById("regLastName").value.trim();
  const email     = document.getElementById("regEmail").value.trim();
  const phone     = document.getElementById("regPhone")?.value.trim() || "";
  const password  = document.getElementById("regPassword").value;
  const confirm   = document.getElementById("regConfirmPassword").value;
  if (password !== confirm) { showToast("Passwords do not match", "error"); return; }
  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: firstName + " " + lastName, email, phone, password }),
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
async function loadProfile() {
  const content = document.getElementById("profileContent");
  const user    = JSON.parse(localStorage.getItem("user") || "null");
  if (!content || !user) return;

  try {
    const res  = await fetch(`${API}/api/auth/me`, { headers: getAuthHeaders() });
    const data = await res.json();
    const u    = data.user || user;

    // Fetch order stats
    const ordRes  = await fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() });
    const ordData = await ordRes.json();
    const orders  = ordData.orders || [];
    const spent   = orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.totalAmount, 0);

    content.innerHTML = `
      <div class="profile-card">
        <div class="profile-avatar">${(u.name || "U")[0].toUpperCase()}</div>
        <h2 class="profile-name">${u.name}</h2>
        <p class="profile-email">${u.email}</p>
        ${u.phone ? `<p class="profile-phone">📞 ${u.phone}</p>` : ""}
        <div class="profile-stats">
          <div class="pstat"><h3>${orders.length}</h3><p>Total Orders</p></div>
          <div class="pstat"><h3>₹${spent}</h3><p>Amount Spent</p></div>
          <div class="pstat"><h3>${orders.filter(o=>o.status==="delivered").length}</h3><p>Completed</p></div>
        </div>
        <button class="btn-primary" style="margin-top:1.5rem;" onclick="showPage('ordersPage')">View My Orders</button>
      </div>

      <h3 style="margin:2rem 0 1rem;">🔁 Recent Orders</h3>
      ${orders.slice(0,5).map(o => `
        <div class="order-card" style="margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;">
            <b>#${o._id.slice(-6).toUpperCase()}</b>
            <span class="order-status ${o.status}">${o.status.toUpperCase()}</span>
          </div>
          <p style="margin:6px 0;font-size:0.9rem;">${o.items.map(i=>`${i.name}×${i.quantity}`).join(", ")}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;">₹${o.totalAmount}</span>
            ${["pending","confirmed"].includes(o.status) ? `<button class="btn-primary" style="padding:6px 14px;font-size:0.8rem;" onclick="reorder('${o._id}')">🔁 Reorder</button>` : `<button class="btn-primary" style="padding:6px 14px;font-size:0.8rem;" onclick="reorder('${o._id}')">🔁 Reorder</button>`}
          </div>
        </div>`).join("") || "<p>No orders yet</p>"}
    `;
  } catch (err) {
    content.innerHTML = "<p>Failed to load profile</p>";
  }
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

  const pickupTime     = document.getElementById("pickupTime")?.value;
  const paymentMethod  = document.querySelector('input[name="paymentMethod"]:checked')?.value || "cash";

  if (!pickupTime) { showToast("Please select a pickup time", "error"); return; }

  if (paymentMethod === "online") {
    await placeOrderWithRazorpay(pickupTime);
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

async function loadMyOrders() {
  const list = document.getElementById("ordersList");
  if (!list) return;
  list.innerHTML = "<p style='text-align:center;opacity:0.5;'>Loading...</p>";
  try {
    const res    = await fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const orders = data.orders || [];
    if (!orders.length) { list.innerHTML = "<p style='text-align:center;padding:2rem;'>No orders yet 📋</p>"; return; }

    list.innerHTML = orders.map(o => `
      <div class="order-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <b>#${o._id.slice(-6).toUpperCase()}</b>
          <span class="order-status ${o.status}">${STATUS_EMOJI[o.status]||""} ${o.status.toUpperCase()}</span>
        </div>
        <p style="font-size:0.9rem;">${o.items.map(i=>`${i.name} × ${i.quantity}`).join(" • ")}</p>
        <div style="display:flex;justify-content:space-between;margin-top:8px;align-items:center;flex-wrap:wrap;gap:8px;">
          <span style="font-weight:700;">₹${o.totalAmount}</span>
          <span style="font-size:0.8rem;opacity:0.6;">${o.paymentMethod === "online" ? "💳 Paid online" : "💵 Cash"} · ${new Date(o.createdAt).toLocaleString()}</span>
        </div>
        ${o.notes ? `<p style="font-size:0.82rem;opacity:0.6;margin-top:4px;">📝 ${o.notes}</p>` : ""}
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          ${["pending","confirmed"].includes(o.status) ? `<button class="btn-primary" style="padding:6px 14px;font-size:0.82rem;" onclick="cancelOrder('${o._id}')">❌ Cancel</button>` : ""}
          <button class="btn-secondary" style="padding:6px 14px;font-size:0.82rem;" onclick="reorder('${o._id}')">🔁 Reorder</button>
        </div>
      </div>`).join("");
  } catch { list.innerHTML = "<p>Failed to load orders</p>"; }
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
async function loadAdminStats() {
  try {
    const res  = await fetch(`${API}/api/admin/dashboard`, { headers: getAuthHeaders() });
    const data = await res.json();
    const s    = data.stats || {};

    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    set("adminStats", `
      <div class="stat-card"><div class="stat-icon">⏳</div><h2>${s.pendingOrders||0}</h2><p>Pending</p></div>
      <div class="stat-card"><div class="stat-icon">🍳</div><h2>${s.preparingOrders||0}</h2><p>Preparing</p></div>
      <div class="stat-card"><div class="stat-icon">🔔</div><h2>${s.readyOrders||0}</h2><p>Ready</p></div>
      <div class="stat-card"><div class="stat-icon">👥</div><h2>${s.totalUsers||0}</h2><p>Students</p></div>`);

    set("dailyStats", `
      <div class="stat-card stat-today"><div class="stat-icon">📋</div><h2>${s.todayOrders||0}</h2><p>Today Orders</p></div>
      <div class="stat-card stat-today"><div class="stat-icon">💰</div><h2>₹${s.todayRevenue||0}</h2><p>Today Revenue</p></div>`);

    set("monthlyStats", `
      <div class="stat-card stat-month"><div class="stat-icon">📅</div><h2>${s.monthOrders||0}</h2><p>This Month Orders</p></div>
      <div class="stat-card stat-month"><div class="stat-icon">💵</div><h2>₹${s.monthRevenue||0}</h2><p>This Month Revenue</p></div>`);

    set("allTimeStats", `
      <div class="stat-card stat-total"><div class="stat-icon">📦</div><h2>${s.totalOrders||0}</h2><p>All Orders</p></div>
      <div class="stat-card stat-total"><div class="stat-icon">🏆</div><h2>₹${s.totalRevenue||0}</h2><p>Total Revenue</p></div>
      <div class="stat-card stat-total"><div class="stat-icon">🍽️</div><h2>${s.totalMenuItems||0}</h2><p>Menu Items</p></div>`);

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
async function loadAdminOrders() {
  const content = document.getElementById("adminContent");
  if (!content) return;
  try {
    const res    = await fetch(`${API}/api/admin/orders?limit=100`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const active = (data.orders || []).filter(o => ["pending","confirmed","preparing","ready"].includes(o.status));

    if (!active.length) {
      content.innerHTML = `<div style="text-align:center;padding:3rem;opacity:0.4;font-size:1.3rem;">🎉 No active orders right now</div>`;
      return;
    }

    const section = (title, icon, color, list, next, btnLabel) => {
      if (!list.length) return "";
      return `
        <div class="order-section">
          <h3 class="order-section-title" style="color:${color};">${icon} ${title} <span class="section-count">${list.length}</span></h3>
          <div class="orders-grid">
            ${list.map(o => `
              <div class="order-card" id="order-${o._id}">
                <div class="order-header">
                  <b>#${o._id.slice(-6).toUpperCase()}</b>
                  <span class="order-status ${o.status}">${o.status.toUpperCase()}</span>
                </div>
                <p><b>👤</b> ${o.customerName || o.user?.name || "N/A"} ${o.createdByAdmin ? '<span class="badge-walkin">Walk-in</span>' : ""}</p>
                <p style="font-size:0.78rem;opacity:0.55;">${new Date(o.createdAt).toLocaleTimeString()} · ${o.paymentMethod==="online"?"💳 Paid":"💵 Cash"}</p>
                <hr style="opacity:0.15;margin:8px 0;"/>
                ${o.items.map(i=>`<div style="display:flex;justify-content:space-between;font-size:0.9rem;padding:2px 0;"><span>• ${i.name} × ${i.quantity}</span><span>₹${i.price*i.quantity}</span></div>`).join("")}
                <p style="font-weight:700;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">Total: ₹${o.totalAmount}</p>
                ${o.notes ? `<p style="font-size:0.8rem;opacity:0.55;">📝 ${o.notes}</p>` : ""}
                <button class="order-action-btn" style="background:${color};"
                  onclick="updateOrderStatus('${o._id}','${next}',this)">
                  ${btnLabel}
                </button>
              </div>`).join("")}
          </div>
        </div>`;
    };

    const pending   = active.filter(o => ["pending","confirmed"].includes(o.status));
    const preparing = active.filter(o => o.status === "preparing");
    const ready     = active.filter(o => o.status === "ready");

    content.innerHTML =
      section("New Orders",   "⏳", "#f97316", pending,   "preparing", "🍳 Start Preparing") +
      section("Preparing",    "🍳", "#0d6efd", preparing, "ready",     "🔔 Mark Ready") +
      section("Ready Pickup", "🔔", "#048A81", ready,     "delivered", "🎉 Delivered / Taken");
  } catch(err) { console.error("loadAdminOrders:", err); }
}

async function updateOrderStatus(id, status, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Updating..."; }
  try {
    const res = await fetch(`${API}/api/admin/orders/${id}/status`, {
      method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ status }),
    });
    if (!res.ok) { showToast("Update failed", "error"); if (btn) btn.disabled = false; return; }
    showToast(`Order → ${status} ✅`, "success");
    const card = document.getElementById(`order-${id}`);
    if (card) { card.style.opacity = "0"; card.style.transform = "scale(0.9)"; card.style.transition = "all 0.3s"; setTimeout(() => { card.remove(); loadAdminStats(); }, 300); }
  } catch { showToast("Network error", "error"); if (btn) btn.disabled = false; }
}

// ══════════════════════════════════════════════════
// ADMIN — TABS
// ══════════════════════════════════════════════════
function setAdminTab(tab) {
  currentAdminTab = tab;
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
  const tabMap = { orders: 0, menu: 1, users: 2 };
  if (tabMap[tab] !== undefined)
    document.querySelectorAll(".admin-tab")[tabMap[tab]]?.classList.add("active");
  if (tab === "orders") loadAdminOrders();
  if (tab === "menu")   loadAdminMenu();
  if (tab === "users")  loadAdminUsers();
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
  try {
    const res   = await fetch(`${API}/api/admin/users`, { headers: getAuthHeaders() });
    const data  = await res.json();
    const users = data.users || [];

    content.innerHTML = `
      <h3 style="margin-bottom:1rem;">👥 Registered Students (${users.length})</h3>
      <div class="users-table-wrap">
        <table class="stats-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><b>${u.name}</b></td>
                <td>${u.email}</td>
                <td>${u.phone || "—"}</td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td><span class="${u.isBanned ? "badge-banned" : "badge-active"}">${u.isBanned ? "🚫 Banned" : "✅ Active"}</span></td>
                <td>
                  ${u.isBanned
                    ? `<button class="btn-primary" style="padding:5px 12px;font-size:0.8rem;background:#2D6A4F;" onclick="banUser('${u._id}',false,'')">Unban</button>`
                    : `<button class="btn-primary" style="padding:5px 12px;font-size:0.8rem;background:#e63946;" onclick="promptBan('${u._id}')">Ban</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  } catch(err) { console.error("loadAdminUsers:", err); }
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
setInterval(() => {
  const adminPage = document.getElementById("adminPage");
  if (adminPage?.classList.contains("active")) {
    if (currentAdminTab === "orders") loadAdminOrders();
    loadAdminStats();
  }
  updateLunchBanner();
}, 10000);

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
// PUSH NOTIFICATIONS (Web Push API)
// ══════════════════════════════════════════════════
let pushRegistered = false;

async function requestPushPermission() {
  const btn = document.getElementById("notifBtn");
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    showToast("Push notifications not supported in this browser", "error");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Notification permission denied", "error");
    return;
  }

  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Use a placeholder VAPID key — replace with your real key from web-push
    const VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLxi6KfWATHpQiV5pE";

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Send subscription to backend
    await fetch(`${API}/api/admin/push-subscribe`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({ subscription }),
    });

    pushRegistered = true;
    if (btn) { btn.textContent = "🔔 Notifications ON"; btn.style.background = "#2D6A4F"; }
    showToast("Push notifications enabled ✅", "success");

  } catch (err) {
    showToast("Failed to enable notifications: " + err.message, "error");
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
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

// ══════════════════════════════════════════════════
// PATCH loadMyOrders — add Track button to each order
// ══════════════════════════════════════════════════
// Override the original loadMyOrders to include tracking
const _origLoadMyOrders = loadMyOrders;
async function loadMyOrders() {
  const list = document.getElementById("ordersList");
  if (!list) return;
  list.innerHTML = "<p style='text-align:center;opacity:0.5;'>Loading...</p>";
  try {
    const res    = await fetch(`${API}/api/orders/my`, { headers: getAuthHeaders() });
    const data   = await res.json();
    const orders = data.orders || [];
    if (!orders.length) { list.innerHTML = "<p style='text-align:center;padding:2rem;'>No orders yet 📋</p>"; return; }

    list.innerHTML = orders.map(o => {
      const active = ["pending","confirmed","preparing","ready"].includes(o.status);
      return `
        <div class="order-card ${active ? "order-card-active" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <b>#${o._id.slice(-6).toUpperCase()}</b>
            <span class="order-status ${o.status}">${STATUS_EMOJI[o.status]||""} ${o.status.toUpperCase()}</span>
          </div>
          <p style="font-size:0.9rem;">${o.items.map(i=>`${i.name} × ${i.quantity}`).join(" • ")}</p>
          <div style="display:flex;justify-content:space-between;margin-top:6px;align-items:center;flex-wrap:wrap;gap:4px;">
            <span style="font-weight:700;">₹${o.totalAmount}</span>
            <span style="font-size:0.78rem;opacity:0.55;">${o.paymentMethod==="online"?"💳 Paid":"💵 Cash"} · ${new Date(o.createdAt).toLocaleString()}</span>
          </div>
          ${o.notes ? `<p style="font-size:0.8rem;opacity:0.55;margin-top:4px;">📝 ${o.notes}</p>` : ""}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            ${active ? `<button class="btn-primary" style="flex:1;padding:8px;" onclick="trackOrder('${o._id}')">📍 Track Order</button>` : ""}
            ${["pending","confirmed"].includes(o.status) ? `<button class="btn-secondary" style="padding:8px 14px;" onclick="cancelOrder('${o._id}')">❌ Cancel</button>` : ""}
            <button class="btn-secondary" style="padding:8px 14px;" onclick="reorder('${o._id}')">🔁 Reorder</button>
          </div>
        </div>`;
    }).join("");
  } catch { list.innerHTML = "<p>Failed to load orders</p>"; }
}

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