// routes/authRoutes.js
const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const User    = require("../models/User");
const { protect } = require("../middleware/auth");

const generateToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone = "", rollNumber = "", branch = "" } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Name, email and password are required" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const user  = await User.create({ name, email, password, phone, rollNumber, branch });
    const token = generateToken(user);

    res.status(201).json({
      success: true, token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, rollNumber: user.rollNumber },
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(", ") });
    }
    res.status(500).json({ error: "Server error during registration" });
  }
});

// POST /api/auth/login  (accepts email OR rollNumber)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { rollNumber: email.trim() }]
    }).select("+password");

    if (!user || user.isActive === false)
      return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    if (user.isBanned)
      return res.status(403).json({ error: `Account suspended. Reason: ${user.banReason || "Contact canteen."}` });

    const token = generateToken(user);
    res.json({
      success: true, token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, rollNumber: user.rollNumber, branch: user.branch },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;