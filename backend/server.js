// server.js – Campus Bites Canteen Ordering System
require("dotenv").config();
const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const http      = require("http");
const { Server } = require("socket.io");
const path      = require("path");
const fs        = require("fs");

const authRoutes  = require("./routes/authRoutes");
const menuRoutes  = require("./routes/menuRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

// ── Socket.io for real-time updates ───────────────────────────────
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });
app.set("io", io);

io.on("connection", (socket) => {
  socket.on("join-user",  (userId) => socket.join(`user:${userId}`));
  socket.on("join-admin", ()       => socket.join("admin"));
});

// ── Upload dirs ────────────────────────────────────────────────────
["uploads/payments","uploads/qr","uploads/menu"].forEach(d => {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/auth", rateLimit({ windowMs: 15*60*1000, max: 30, message: { error: "Too many requests" } }));
app.use("/api",      rateLimit({ windowMs: 60*1000, max: 200, message: { error: "Too many requests" } }));

app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth",   authRoutes);
app.use("/api/menu",   menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin",  adminRoutes);

app.get("/api/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Route not found" });
  const page = req.path.startsWith("/admin") ? "admin.html" : "index.html";
  const fp = path.join(__dirname, "../frontend", page);
  fs.existsSync(fp) ? res.sendFile(fp) : res.status(404).send("Not found");
});

app.use((err, _req, res, _next) => {
  console.error("Error:", err.message);
  if (err.name === "MulterError") return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅  MongoDB connected");
    server.listen(PORT, () => console.log(`🚀  Server → http://localhost:${PORT}`));
  })
  .catch(err => { console.error("❌  MongoDB failed:", err.message); process.exit(1); });

module.exports = { app, io };