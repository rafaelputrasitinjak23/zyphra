const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String,
  price: Number,
  qty: Number,
  imageUrl: String,
  fileUrl: String
}, { _id: false });

const orderSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid: { type: String, required: true, index: true },
  items: [orderItemSchema],
  total: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'pending', 'failed', 'cancelled', 'refunded'], default: 'paid', index: true },
  paymentStatus: { type: String, enum: ['paid', 'pending', 'failed', 'cancelled', 'refunded'], default: 'paid', index: true },
  paymentMethod: { type: String, default: 'Demo Checkout' },
  paidAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
