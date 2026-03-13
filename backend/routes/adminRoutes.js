// routes/adminRoutes.js
const express = require("express");
const router  = express.Router();
const Order   = require("../models/Order");
const User    = require("../models/User");
const Menu    = require("../models/Menu");
const { protect, adminOnly } = require("../middleware/auth");

router.use(protect, adminOnly);

// ── GET /api/admin/orders ─────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = status ? { status } : {};
    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate("user", "name email phone rollNumber branch")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(Number(limit));
    res.json({ success: true, total, page: Number(page), orders });
  } catch (err) { res.status(500).json({ error: "Failed to fetch orders" }); }
});

// ── PATCH /api/admin/orders/:id/status ───────────
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ["pending","confirmed","preparing","ready","delivered","cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate("user", "name email");
    if (!order) return res.status(404).json({ error: "Not found" });

    // If delivered → mark paid (cash), update student's totalSpent
    if (status === "delivered") {
      if (order.paymentMethod === "cash") {
        await Order.findByIdAndUpdate(req.params.id, { paymentStatus: "paid" });
      }
      // Only update totalSpent for real student orders (not admin walk-in orders)
      if (!order.createdByAdmin) {
        const userId = order.user?._id || order.user;
        if (userId) {
          const orderUser = await User.findById(userId);
          if (orderUser && orderUser.role === "user") {
            await User.findByIdAndUpdate(userId, { $inc: { totalSpent: order.totalAmount } });
          }
        }
      }
    }
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ error: "Failed to update status" }); }
});

// ── POST /api/admin/orders — Walk-in / admin order ─
router.post("/orders", async (req, res) => {
  try {
    const { items, customerName, customerNote, paymentStatus = "paid", paymentMethod = "cash" } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: "No items" });
    if (!customerName)           return res.status(400).json({ error: "Customer name required" });

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const m = await Menu.findById(item.menuItem);
      if (!m) return res.status(404).json({ error: `Item not found` });
      if (!m.isAvailable) return res.status(400).json({ error: `${m.name} unavailable` });
      orderItems.push({ menuItem: m._id, name: m.name, quantity: item.quantity, price: m.price });
      totalAmount += m.price * item.quantity;
    }
    const order = await Order.create({
      user: req.user.id,
      items: orderItems, totalAmount,
      status: "confirmed",
      paymentMethod, paymentStatus,
      notes: customerNote || "",
      customerName,
      createdByAdmin: true,
    });
    res.status(201).json({ success: true, order });
  } catch (err) { res.status(500).json({ error: "Failed to create order" }); }
});

// ── GET /api/admin/users ─────────────────────────
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({ role: "user" }).select("-password").sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, users });
  } catch (err) { res.status(500).json({ error: "Failed to fetch users" }); }
});

// ── PATCH /api/admin/users/:id/ban ───────────────
router.patch("/users/:id/ban", async (req, res) => {
  try {
    const { isBanned, banReason = "" } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id, { isBanned, banReason }, { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ error: "Failed to update user" }); }
});

// ── GET /api/admin/menu ───────────────────────────
router.get("/menu", async (req, res) => {
  try {
    const items = await Menu.find().sort({ category: 1, name: 1 });
    res.json({ success: true, items });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ── POST /api/admin/menu — Add menu item ─────────
router.post("/menu", async (req, res) => {
  try {
    const item = await Menu.create(req.body);
    res.status(201).json({ success: true, item });
  } catch (err) {
    if (err.name === "ValidationError") {
      const msgs = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: msgs.join(", ") });
    }
    res.status(500).json({ error: "Failed to create item" });
  }
});

// ── PUT /api/admin/menu/:id — Edit menu item ─────
router.put("/menu/:id", async (req, res) => {
  try {
    const item = await Menu.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ error: "Failed to update" }); }
});

// ── DELETE /api/admin/menu/:id ───────────────────
router.delete("/menu/:id", async (req, res) => {
  try {
    const item = await Menu.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ error: "Failed to delete" }); }
});

// ── GET /api/admin/dashboard — Full stats ─────────
router.get("/dashboard", async (req, res) => {
  try {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, pending, preparing, ready, users, menuItems,
           allRev, todayCount, todayRev, monthCount, monthRev, monthly] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: "preparing" }),
      Order.countDocuments({ status: "ready" }),
      User.countDocuments({ role: "user" }),
      Menu.countDocuments({ isAvailable: true }),
      Order.aggregate([{ $match: { status: "delivered" } }, { $group: { _id: null, t: { $sum: "$totalAmount" } } }]),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      Order.aggregate([{ $match: { status: "delivered", createdAt: { $gte: todayStart } } }, { $group: { _id: null, t: { $sum: "$totalAmount" } } }]),
      Order.countDocuments({ createdAt: { $gte: monthStart } }),
      Order.aggregate([{ $match: { status: "delivered", createdAt: { $gte: monthStart } } }, { $group: { _id: null, t: { $sum: "$totalAmount" } } }]),
      Order.aggregate([
        { $match: { status: "delivered", createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, totalOrders: { $sum: 1 }, totalRevenue: { $sum: "$totalAmount" } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders: total, pendingOrders: pending, preparingOrders: preparing, readyOrders: ready,
        totalUsers: users, totalMenuItems: menuItems,
        totalRevenue: allRev[0]?.t || 0,
        todayOrders: todayCount, todayRevenue: todayRev[0]?.t || 0,
        monthOrders: monthCount, monthRevenue: monthRev[0]?.t || 0,
        monthlyBreakdown: monthly,
      },
    });
  } catch (err) { res.status(500).json({ error: "Dashboard error" }); }
});

// ── GET /api/admin/lunch-block-status ────────────
router.get("/lunch-block-status", (req, res) => {
  res.json({
    blocked:   { start: "13:10", end: "14:00" },
    message:   "Lunch break 1:10 PM – 2:00 PM",
    canOverride: true,   // admin can always create orders
  });
});


// ── GET /api/admin/orders/export-json ────────────
// Returns all orders as JSON — frontend converts to Excel/PDF
router.get("/orders/export", async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(new Date(to).setHours(23,59,59,999));
    }
    const orders = await Order.find(filter)
      .populate("user", "name email phone rollNumber branch")
      .sort({ createdAt: -1 })
      .limit(5000);

    const rows = orders.map(o => ({
      "Order ID":      o._id.toString().slice(-6).toUpperCase(),
      "Customer":      o.customerName || o.user?.name || "N/A",
      "Email":         o.user?.email || "N/A",
      "Items":         o.items.map(i => `${i.name}×${i.quantity}`).join(", "),
      "Total (₹)":    o.totalAmount,
      "Payment":       o.paymentMethod,
      "Payment Status":o.paymentStatus,
      "Status":        o.status,
      "Date":          new Date(o.createdAt).toLocaleString("en-IN"),
      "Notes":         o.notes || "",
    }));

    res.json({ success: true, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

// ── POST /api/admin/push-subscribe ───────────────
// Save admin's push subscription for Web Push notifications
const pushSubscriptions = new Map();  // In-memory (use DB in production)

router.post("/push-subscribe", (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: "No subscription" });
  pushSubscriptions.set(req.user.id, subscription);
  res.json({ success: true, message: "Push subscription saved" });
});

// Export map so orderRoutes can trigger notifications

// Export router + push subscriptions map
router.pushSubscriptions = new Map();
module.exports = router;
// ── GET /api/admin/pending-payments ──────────────
// Returns orders where student uploaded a screenshot but admin hasn't verified yet
router.get("/pending-payments", async (req, res) => {
  try {
    const orders = await Order.find({ paymentStatus: "awaiting_verification" })
      .populate("user", "name email phone rollNumber branch")
      .sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, orders });
  } catch (err) { res.status(500).json({ error: "Failed to fetch" }); }
});