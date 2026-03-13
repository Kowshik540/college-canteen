// models/Menu.js
const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500 },
  price:       { type: Number, required: true, min: 0 },
  category:    { type: String, required: true, enum: ["breakfast","lunch","dinner","snacks","beverages","other"] },
  image:       { type: String, default: "" },
  isAvailable: { type: Boolean, default: true },
  stock:       { type: Number, default: 999, min: 0 },
  preparationTime: { type: Number, default: 10 },  // minutes
}, { timestamps: true });

menuSchema.index({ category: 1, isAvailable: 1 });
module.exports = mongoose.model("Menu", menuSchema);