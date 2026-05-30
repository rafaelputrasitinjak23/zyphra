const express = require('express');
const mongoose = require('mongoose');
const adminFirebase = require('../config/firebaseAdmin');
const { requireAdmin } = require('../middleware/auth');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const { formatRupiah, slugify } = require('../utils');
const router = express.Router();

router.use(requireAdmin);

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get('/admin', async (req, res) => {
  const today = startOfDay();
  const month = startOfMonth();
  const [products, users, orders, admins, reviews, revenueAgg, todayRevenueAgg, monthRevenueAgg, recentOrders, topProducts, sales7Days] = await Promise.all([
    Product.countDocuments(),
    User.countDocuments(),
    Order.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    Review.countDocuments({ active: true }),
    Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: month } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Order.find().populate('user').sort({ createdAt: -1 }).limit(6),
    Product.find().sort({ sold: -1, createdAt: -1 }).limit(5),
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);
  res.render('pages/admin/dashboard', {
    title: 'Admin Dashboard',
    stats: {
      products,
      users,
      admins,
      orders,
      reviews,
      revenue: revenueAgg[0]?.total || 0,
      todayRevenue: todayRevenueAgg[0]?.total || 0,
      todayOrders: todayRevenueAgg[0]?.count || 0,
      monthRevenue: monthRevenueAgg[0]?.total || 0,
      monthOrders: monthRevenueAgg[0]?.count || 0
    },
    recentOrders,
    topProducts,
    sales7Days,
    formatRupiah
  });
});

router.get('/admin/products', async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.render('pages/admin/products', { title: 'Kelola Produk', products, formatRupiah });
});

router.get('/admin/products/new', (req, res) => {
  res.render('pages/admin/product-form', { title: 'Tambah Produk', product: null });
});

router.post('/admin/products', async (req, res) => {
  const { name, description, price, stock, imageUrl, fileUrl, category, featured, active } = req.body;
  await Product.create({ name, slug: slugify(name), description, price, stock, imageUrl, fileUrl, category, featured: !!featured, active: active !== 'off' });
  req.session.success = 'Produk berhasil ditambahkan.';
  res.redirect('/admin/products');
});

router.get('/admin/products/:id/edit', async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.render('pages/admin/product-form', { title: 'Edit Produk', product });
});

router.post('/admin/products/:id', async (req, res) => {
  const { name, description, price, stock, imageUrl, fileUrl, category, featured, active } = req.body;
  await Product.findByIdAndUpdate(req.params.id, { name, description, price, stock, imageUrl, fileUrl, category, featured: !!featured, active: active !== 'off' });
  req.session.success = 'Produk berhasil diperbarui.';
  res.redirect('/admin/products');
});

router.post('/admin/products/:id/delete', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  req.session.success = 'Produk berhasil dihapus.';
  res.redirect('/admin/products');
});

router.get('/admin/users', async (req, res) => {
  const users = await User.find().sort({ role: 1, createdAt: -1 });
  res.render('pages/admin/users', { title: 'Kelola User', users });
});

router.post('/admin/users/:uid/make-admin', async (req, res) => {
  const user = await User.findOneAndUpdate({ uid: req.params.uid }, { role: 'admin' }, { new: true });
  if (!user) {
    req.session.error = 'User tidak ditemukan.';
    return res.redirect('/admin/users');
  }
  try { await adminFirebase.auth().setCustomUserClaims(req.params.uid, { admin: true }); } catch (err) { console.warn('Set admin claim:', err.message); }
  req.session.success = `${user.email} sekarang menjadi admin.`;
  res.redirect('/admin/users');
});

router.post('/admin/users/:uid/remove-admin', async (req, res) => {
  if (req.params.uid === req.user.uid) {
    req.session.error = 'Admin tidak bisa mencabut akses admin akun sendiri.';
    return res.redirect('/admin/users');
  }
  const user = await User.findOneAndUpdate({ uid: req.params.uid }, { role: 'user' }, { new: true });
  if (!user) {
    req.session.error = 'User tidak ditemukan.';
    return res.redirect('/admin/users');
  }
  try { await adminFirebase.auth().setCustomUserClaims(req.params.uid, { admin: false }); } catch (err) { console.warn('Remove admin claim:', err.message); }
  req.session.success = `Akses admin ${user.email} dicabut.`;
  res.redirect('/admin/users');
});

router.post('/admin/users/:uid/delete', async (req, res) => {
  if (req.params.uid === req.user.uid) {
    req.session.error = 'Admin tidak bisa menghapus akun sendiri.';
    return res.redirect('/admin/users');
  }
  try { await adminFirebase.auth().deleteUser(req.params.uid); } catch (err) { console.warn('Delete Firebase user:', err.message); }
  const user = await User.findOneAndDelete({ uid: req.params.uid });
  if (user) {
    await Order.deleteMany({ uid: req.params.uid });
    await Review.deleteMany({ uid: req.params.uid });
  }
  req.session.success = 'User, review, dan data pesanannya berhasil dihapus.';
  res.redirect('/admin/users');
});

router.get('/admin/orders', async (req, res) => {
  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();
  const filter = {};
  if (status && ['paid', 'pending', 'failed', 'cancelled', 'refunded'].includes(status)) filter.paymentStatus = status;
  if (q) {
    const safeQ = escapeRegex(q);
    const users = await User.find({ $or: [{ email: new RegExp(safeQ, 'i') }, { name: new RegExp(safeQ, 'i') }] }).select('_id uid');
    const ids = users.map((u) => u._id);
    const uids = users.map((u) => u.uid);
    filter.$or = [
      { invoiceNumber: new RegExp(safeQ, 'i') },
      { user: { $in: ids } },
      { uid: { $in: uids } }
    ];
    if (mongoose.Types.ObjectId.isValid(q)) filter.$or.push({ _id: q });
  }
  const orders = await Order.find(filter).populate('user').sort({ createdAt: -1 });
  const totals = await Order.aggregate([
    { $match: filter.$or ? { $and: [filter] } : filter },
    { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$total' } } }
  ]).catch(() => []);
  res.render('pages/admin/orders', { title: 'Riwayat Transaksi', orders, totals, q, status, formatRupiah });
});

module.exports = router;
