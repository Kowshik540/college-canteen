// routes/orderRoutes.js
const express = require("express");
const router  = express.Router();
const Order   = require("../models/Order");
const Menu    = require("../models/Menu");
const User    = require("../models/User");
const { protect } = require("../middleware/auth");

// ── Lunch-break block helper ──────────────────────
function isLunchBreak() {
  const now = new Date();
  const IST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = IST.getHours(), m = IST.getMinutes();
  const mins = h * 60 + m;
  return mins >= 13 * 60 + 10 && mins < 14 * 60;  // 1:10 PM – 2:00 PM
}

// ── GET /api/orders/canteen-status ────────────────
// Frontend polls this to know if ordering is allowed
router.get("/canteen-status", (req, res) => {
  const blocked = isLunchBreak();
  res.json({
    blocked,
    message: blocked
      ? "🍽️ Online ordering paused 1:10–2:00 PM. Visit canteen or order after 2 PM."
      : "Online ordering is open",
    adminCanOrder: true,   // admin walk-in orders always allowed
  });
});

// ── POST /api/orders — Place order ───────────────
router.post("/", protect, async (req, res) => {
  try {
    // Block ONLINE student orders during lunch break only
    // Admin-created orders (via /api/admin/orders) are never blocked
    if (isLunchBreak()) {
      return res.status(423).json({
        error: "🍽️ Online ordering is paused during lunch break (1:10 PM – 2:00 PM). Visit the canteen directly or order after 2 PM.",
        lunchBreak: true,
      });
    }

    const { items, notes, pickupTime, paymentMethod = "cash" } = req.body;
    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items in order" });

    // Check if user is banned
    const user = await User.findById(req.user.id);
    if (user?.isBanned)
      return res.status(403).json({ error: "Your account has been suspended. Please contact the canteen." });

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const menuItem = await Menu.findById(item.menuItem);
      if (!menuItem) return res.status(404).json({ error: `Item not found` });
      if (!menuItem.isAvailable) return res.status(400).json({ error: `${menuItem.name} is unavailable` });
      orderItems.push({ menuItem: menuItem._id, name: menuItem.name, quantity: item.quantity, price: menuItem.price });
      totalAmount += menuItem.price * item.quantity;
    }

    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      totalAmount,
      notes,
      pickupTime,
      paymentMethod,
      paymentStatus: paymentMethod === "cash" ? "unpaid" : "unpaid",
      status: "pending",
    });

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, { $inc: { totalOrders: 1 } });

    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Failed to place order" });
  }
});

// ── POST /api/orders/:id/verify-payment ──────────
// Called after Razorpay payment succeeds on frontend
router.post("/:id/verify-payment", protect, async (req, res) => {
  try {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    const crypto = require("crypto");

    const body      = razorpayOrderId + "|" + razorpayPaymentId;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest("hex");

    if (expected !== razorpaySignature)
      return res.status(400).json({ error: "Payment verification failed" });

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: "paid", razorpayPaymentId, razorpayOrderId, status: "confirmed" },
      { new: true }
    );
    // Update user total spent
    if (order) await User.findByIdAndUpdate(order.user, { $inc: { totalSpent: order.totalAmount } });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Payment verification error" });
  }
});

// ── POST /api/orders/create-razorpay ─────────────
router.post("/create-razorpay", protect, async (req, res) => {
  try {
    const Razorpay = require("razorpay");
    const rzp = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const { amount } = req.body;  // amount in paise (₹1 = 100 paise)
    const rzpOrder = await rzp.orders.create({
      amount:   Math.round(amount * 100),
      currency: "INR",
      receipt:  "order_" + Date.now(),
    });
    res.json({ success: true, razorpayOrder: rzpOrder });
  } catch (err) {
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

// ── GET /api/orders/my ────────────────────────────
router.get("/my", protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .populate("items.menuItem", "name price image");
    res.json({ success: true, orders });
  } catch (err) { res.status(500).json({ error: "Failed to fetch orders" }); }
});

// ── GET /api/orders/:id ───────────────────────────
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("items.menuItem");
    if (!order) return res.status(404).json({ error: "Not found" });
    if (order.user.toString() !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not authorized" });
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ error: "Failed to fetch order" }); }
});

// ── PATCH /api/orders/:id/cancel ─────────────────
router.patch("/:id/cancel", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    if (order.user.toString() !== req.user.id) return res.status(403).json({ error: "Not authorized" });
    if (!["pending","confirmed"].includes(order.status))
      return res.status(400).json({ error: "Cannot cancel at this stage" });
    order.status = "cancelled";
    await order.save();
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ error: "Failed to cancel" }); }
});

module.exports = router;