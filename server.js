// server.js — CampusBites v4.0
const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const path      = require("path");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const Razorpay = require("razorpay");
const crypto = require("crypto");


require("dotenv").config();

const app  = express();
const PORT = process.env.PORT || 5000;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET
});

// ── Security ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      imgSrc:        ["'self'", "data:", "https:", "http:"],
      connectSrc:    ["'self'", "https://cdn.jsdelivr.net", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      frameSrc:      ["https://api.razorpay.com", "https://checkout.razorpay.com"],
    },
  },
}));

// ── CORS ────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5000"];
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error("CORS blocked"))),
  credentials: true,
}));

// ── Rate limiting ───────────────────────────────────
app.use("/api/",      rateLimit({ windowMs: 15*60*1000, max: 200, message: { error: "Too many requests" } }));
app.use("/api/auth/", rateLimit({ windowMs: 15*60*1000, max: 10,  message: { error: "Too many login attempts" } }));

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ──────────────────────────────────────────
app.use("/api/auth",   require("./routes/authRoutes"));
app.use("/api/menu",   require("./routes/menuRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/admin",  require("./routes/adminRoutes"));



app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ── Error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// ── DB + Start ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 })
  .then(() => {
    console.log("✅ MongoDB Connected —", mongoose.connection.name);
    app.listen(PORT, () => console.log(`🚀 Server → http://localhost:${PORT}`));
  })
  .catch(err => { console.error("❌ MongoDB error:", err.message); process.exit(1); });

mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));



module.exports = app;