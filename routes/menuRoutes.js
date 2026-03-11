// routes/menuRoutes.js
const express = require("express");
const router  = express.Router();
const Menu    = require("../models/Menu");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const { category } = req.query;
    const filter = {};
    if (category && category !== "all") filter.category = category;
    const items = await Menu.find(filter).sort({ category: 1, name: 1 });
    res.json({ success: true, count: items.length, items });
  } catch (err) { res.status(500).json({ error: "Failed to fetch menu" }); }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await Menu.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/",   protect, adminOnly, async (req, res) => {
  try { const item = await Menu.create(req.body); res.status(201).json({ success: true, item }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const item = await Menu.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await Menu.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

module.exports = router;