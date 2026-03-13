// models/Order.js
const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true },
  name:     { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price:    { type: Number, required: true, min: 0 },
});

const orderSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items:        { type: [itemSchema], validate: { validator: v => v.length > 0, message: "Empty order" } },
  totalAmount:  { type: Number, required: true, min: 0 },
  status:       { type: String, enum: ["pending","confirmed","preparing","ready","delivered","cancelled"], default: "pending" },

  // Payment
  paymentMethod:     { type: String, enum: ["online","cash"], default: "cash" },
  paymentStatus:     { type: String, enum: ["unpaid","awaiting_verification","paid","rejected","refunded"], default: "unpaid" },
  paymentScreenshot: { type: String, default: "" },   // path to uploaded screenshot
  paymentUtrNote:    { type: String, default: "" },   // optional UTR number entered by student

  // Legacy Razorpay fields (kept for DB compatibility)
  razorpayOrderId:   { type: String, default: "" },
  razorpayPaymentId: { type: String, default: "" },

  // Meta
  notes:          { type: String, maxlength: 300, default: "" },
  pickupTime:     { type: String, default: "" },
  createdByAdmin: { type: Boolean, default: false },
  customerName:   { type: String, default: "" },
}, { timestamps: true });

orderSchema.index({ user: 1, status: 1 });
orderSchema.index({ createdAt: -1 });
module.exports = mongoose.model("Order", orderSchema);