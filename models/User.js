const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true, index: true },
  name: { type: String, default: '' },
  photoURL: { type: String, default: '' },
  provider: { type: String, default: 'password' },
  emailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  lastLoginAt: Date,
  cart: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, qty: { type: Number, default: 1, min: 1 } }],
  purchases: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  emailVerificationToken: { type: String, default: '' },
  emailVerificationExpires: Date,
  passwordResetToken: { type: String, default: '' },
  passwordResetExpires: Date
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
