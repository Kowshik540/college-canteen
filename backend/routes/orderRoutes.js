// routes/orderRoutes.js
const express = require("express");
const router  = express.Router();
const Order   = require("../models/Order");
const Menu    = require("../models/Menu");
const User    = require("../models/User");
const { protect } = require("../middleware/auth");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

// ── Multer setup for payment screenshots ─────────
const screenshotDir = path.join(__dirname, "../uploads/payments");
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, screenshotDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `payment_${Date.now()}_${req.user.id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) &&
        allowed.test(file.mimetype.split("/")[1])) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG/PNG/WEBP images allowed"));
    }
  },
});

// ── Lunch-break block helper ──────────────────────
function isLunchBreak() {
  const now = new Date();
  const IST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = IST.getHours(), m = IST.getMinutes();
  const mins = h * 60 + m;
  return mins >= 13 * 60 + 10 && mins < 14 * 60;
}

// ── GET /api/orders/canteen-status ────────────────
router.get("/canteen-status", (req, res) => {
  const blocked = isLunchBreak();
  res.json({
    blocked,
    message: blocked
      ? "🍽️ Online ordering paused 1:10–2:00 PM. Visit canteen or order after 2 PM."
      : "Online ordering is open",
    adminCanOrder: true,
  });
});

// ── POST /api/orders — Place order ───────────────
router.post("/", protect, async (req, res) => {
  try {
    if (isLunchBreak()) {
      return res.status(423).json({
        error: "🍽️ Online ordering is paused during lunch break (1:10 PM – 2:00 PM).",
        lunchBreak: true,
      });
    }

    const { items, notes, pickupTime, paymentMethod = "cash" } = req.body;
    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items in order" });

    const user = await User.findById(req.user.id);
    if (user?.isBanned)
      return res.status(403).json({ error: "Your account has been suspended." });

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const menuItem = await Menu.findById(item.menuItem);
      if (!menuItem) return res.status(404).json({ error: "Item not found" });
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
      paymentStatus: "unpaid",
      status: "pending",
    });

    await User.findByIdAndUpdate(req.user.id, { $inc: { totalOrders: 1 } });
    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Failed to place order" });
  }
});

// ── POST /api/orders/:id/upload-payment ──────────
// Student uploads PhonePe/UPI screenshot after paying
router.post("/:id/upload-payment", protect, upload.single("screenshot"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order)  return res.status(404).json({ error: "Order not found" });
    if (order.user.toString() !== req.user.id)
      return res.status(403).json({ error: "Not authorized" });
    if (!req.file)
      return res.status(400).json({ error: "No screenshot uploaded" });

    order.paymentScreenshot = `/uploads/payments/${req.file.filename}`;
    order.paymentStatus     = "awaiting_verification";
    order.paymentUtrNote    = req.body.utrNumber || "";
    await order.save();

    res.json({
      success: true,
      message: "Screenshot uploaded. Admin will verify your payment shortly.",
      screenshotUrl: order.paymentScreenshot,
    });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── PATCH /api/orders/:id/verify-payment ─────────
// Admin approves or rejects a UPI payment screenshot
router.patch("/:id/verify-payment", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Admins only" });

    const { approved } = req.body;
    const update = approved
      ? { paymentStatus: "paid",     status: "confirmed" }
      : { paymentStatus: "rejected", status: "cancelled" };

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ error: "Not found" });

    if (approved) {
      // order.user is an ObjectId here — only update if it's a real student (not admin)
      const userId = order.user;
      if (userId) {
        const orderUser = await User.findById(userId);
        if (orderUser && orderUser.role === "user") {
          await User.findByIdAndUpdate(userId, { $inc: { totalSpent: order.totalAmount } });
        }
      }
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
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