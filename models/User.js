// models/User.js
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 50 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, "Invalid email"] },
  password: { type: String, required: true, minlength: 6, select: false },
  phone:    { type: String, default: "" },
  role:     { type: String, enum: ["user","admin"], default: "user" },
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  banReason:{ type: String, default: "" },
  totalOrders:  { type: Number, default: 0 },
  totalSpent:   { type: Number, default: 0 },
}, { timestamps: true });

userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.matchPassword = async function(pw) {
  return bcrypt.compare(pw, this.password);
};
userSchema.methods.toJSON = function() {
  const o = this.toObject(); delete o.password; return o;
};

module.exports = mongoose.model("User", userSchema);