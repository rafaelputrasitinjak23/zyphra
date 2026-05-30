const express = require('express');
const axios = require('axios');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Review = require('../models/Review');
const { requireAuth } = require('../middleware/auth');
const { formatRupiah } = require('../utils');
const { sendDiscordLog } = require('../services/discord');
const { sendPurchaseEmail } = require('../services/mailer');
const router = express.Router();

function makeInvoiceNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ZYP-${y}${m}${d}-${random}`;
}

async function createUniqueInvoiceNumber() {
  for (let i = 0; i < 8; i += 1) {
    const invoiceNumber = makeInvoiceNumber();
    const exists = await Order.exists({ invoiceNumber });
    if (!exists) return invoiceNumber;
  }
  return `ZYP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function getReviewSummary(productId) {
  const [summary] = await Review.aggregate([
    { $match: { product: productId, active: true } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  return { average: summary?.average || 0, count: summary?.count || 0 };
}

async function findPurchasedOrder(uid, productId) {
  return Order.findOne({
    uid,
    paymentStatus: 'paid',
    'items.product': productId
  }).sort({ createdAt: -1 });
}

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = { active: true };
  if (q) filter.$text = { $search: q };
  const products = await Product.find(filter).sort({ featured: -1, createdAt: -1 });
  res.render('pages/home', { title: 'Home', products, q, formatRupiah, homeThumbnailUrl: process.env.HOME_THUMBNAIL_URL || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1200&auto=format&fit=crop' });
});

router.get('/product/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, active: true });
  if (!product) return res.status(404).render('pages/error', { title: 'Produk Tidak Ada', message: 'Produk tidak ditemukan atau tidak aktif.' });
  const [reviews, reviewSummary, existingReview, purchasedOrder] = await Promise.all([
    Review.find({ product: product._id, active: true }).populate('user').sort({ createdAt: -1 }).limit(20),
    getReviewSummary(product._id),
    req.user ? Review.findOne({ product: product._id, uid: req.user.uid }) : null,
    req.user ? findPurchasedOrder(req.user.uid, product._id) : null
  ]);
  res.render('pages/product', {
    title: product.name,
    product,
    reviews,
    reviewSummary,
    existingReview,
    canReview: Boolean(purchasedOrder),
    formatRupiah
  });
});

router.post('/product/:id/review', requireAuth, async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || !product.active) {
    req.session.error = 'Produk tidak ditemukan.';
    return res.redirect('/');
  }
  const purchasedOrder = await findPurchasedOrder(req.user.uid, product._id);
  if (!purchasedOrder) {
    req.session.error = 'Anda hanya bisa memberi review setelah membeli produk ini.';
    return res.redirect('/product/' + product.slug);
  }
  const rating = Math.min(Math.max(parseInt(req.body.rating || '5', 10), 1), 5);
  const comment = String(req.body.comment || '').trim();
  if (comment.length < 8) {
    req.session.error = 'Review minimal 8 karakter.';
    return res.redirect('/product/' + product.slug);
  }
  await Review.findOneAndUpdate(
    { product: product._id, uid: req.user.uid },
    { product: product._id, user: req.user._id, uid: req.user.uid, order: purchasedOrder._id, rating, comment, active: true },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  req.session.success = 'Review berhasil disimpan.';
  res.redirect('/product/' + product.slug + '#reviews');
});

router.get('/report', (req, res) => {
  res.render('pages/report', { title: 'Report' });
});

router.post('/report', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    req.session.error = 'Nama, email, subjek, dan pesan wajib diisi.';
    return res.redirect('/report');
  }
  const sent = await sendDiscordLog({
    title: 'Report Baru dari Website',
    description: String(subject).slice(0, 256),
    color: 16753920,
    fields: [
      { name: 'Nama', value: name, inline: true },
      { name: 'Email', value: email, inline: true },
      { name: 'Pesan', value: message }
    ]
  });
  req.session[sent ? 'success' : 'error'] = sent ? 'Report berhasil dikirim ke admin.' : 'Discord webhook belum aktif atau gagal menerima pesan.';
  res.redirect('/report');
});

router.post('/cart/add/:id', requireAuth, async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || !product.active) {
    req.session.error = 'Produk tidak ditemukan.';
    return res.redirect('/');
  }
  if (product.stock < 1) {
    req.session.error = 'Stok produk habis.';
    return res.redirect('/product/' + product.slug);
  }
  const qty = Math.max(parseInt(req.body.qty || '1', 10), 1);
  const existing = req.user.cart.find(item => item.product.toString() === product._id.toString());
  if (existing) existing.qty = Math.min(existing.qty + qty, product.stock);
  else req.user.cart.push({ product: product._id, qty: Math.min(qty, product.stock) });
  await req.user.save();
  req.session.success = 'Produk masuk ke keranjang.';
  res.redirect('/cart');
});

router.get('/cart', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).populate('cart.product');
  const items = user.cart.filter(item => item.product && item.product.active);
  const total = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  res.render('pages/cart', { title: 'Keranjang', items, total, formatRupiah });
});

router.post('/cart/update/:id', requireAuth, async (req, res) => {
  const qty = Math.max(parseInt(req.body.qty || '1', 10), 1);
  const item = req.user.cart.find(i => i.product.toString() === req.params.id);
  if (item) item.qty = qty;
  await req.user.save();
  res.redirect('/cart');
});

router.post('/cart/remove/:id', requireAuth, async (req, res) => {
  req.user.cart = req.user.cart.filter(i => i.product.toString() !== req.params.id);
  await req.user.save();
  res.redirect('/cart');
});

router.get('/checkout', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).populate('cart.product');
  const items = user.cart.filter(item => item.product && item.product.active);
  const total = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  res.render('pages/checkout', { title: 'Checkout', items, total, formatRupiah });
});

router.post('/checkout', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).populate('cart.product');
  const items = user.cart.filter(item => item.product && item.product.active);
  if (!items.length) {
    req.session.error = 'Keranjang masih kosong.';
    return res.redirect('/cart');
  }
  for (const item of items) {
    if (item.product.stock < item.qty) {
      req.session.error = `Stok ${item.product.name} tidak cukup.`;
      return res.redirect('/cart');
    }
  }
  const orderItems = [];
  let total = 0;
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product._id, { $inc: { stock: -item.qty, sold: item.qty } }, { new: true });
    orderItems.push({ product: item.product._id, name: item.product.name, price: item.product.price, qty: item.qty, imageUrl: item.product.imageUrl, fileUrl: item.product.fileUrl });
    total += item.product.price * item.qty;
  }
  const invoiceNumber = await createUniqueInvoiceNumber();
  const order = await Order.create({
    invoiceNumber,
    user: user._id,
    uid: user.uid,
    items: orderItems,
    total,
    status: 'paid',
    paymentStatus: 'paid',
    paymentMethod: 'Demo Checkout',
    paidAt: new Date()
  });
  await sendPurchaseEmail(user, order, orderItems);
  await sendDiscordLog({
    title: 'Item Terjual',
    description: `Checkout baru berhasil dibuat. Invoice: ${order.invoiceNumber}`,
    color: 3066993,
    fields: [
      { name: 'Buyer', value: `${user.name} (${user.email})`, inline: true },
      { name: 'Invoice', value: order.invoiceNumber, inline: true },
      { name: 'Total', value: formatRupiah(total), inline: true },
      { name: 'Produk', value: orderItems.map((item) => `${item.qty}x ${item.name}`).join('\n') }
    ]
  });
  user.cart = [];
  user.purchases.push(order._id);
  await user.save();
  req.session.success = `Checkout berhasil. Invoice ${order.invoiceNumber} sudah dibuat dan produk tersedia di akun Anda.`;
  res.redirect('/invoice/' + order._id);
});

router.get('/account', requireAuth, async (req, res) => {
  const orders = await Order.find({ uid: req.user.uid }).sort({ createdAt: -1 }).populate('items.product');
  res.render('pages/account', { title: 'Akun Saya', orders, formatRupiah });
});

router.get('/invoice/:orderId', requireAuth, async (req, res) => {
  const query = { _id: req.params.orderId };
  if (req.user.role !== 'admin') query.uid = req.user.uid;
  const order = await Order.findOne(query).populate('user').populate('items.product');
  if (!order) return res.status(404).render('pages/error', { title: 'Invoice Tidak Ditemukan', message: 'Invoice tidak ditemukan atau Anda tidak memiliki akses.' });
  res.render('pages/invoice', { title: 'Invoice ' + order.invoiceNumber, order, formatRupiah });
});

router.get('/download/:orderId/:productId', requireAuth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, uid: req.user.uid });
  if (!order) return res.status(404).render('pages/error', { title: 'Tidak Ditemukan', message: 'Pesanan tidak ditemukan.' });
  const item = order.items.find(i => i.product.toString() === req.params.productId);
  if (!item) return res.status(404).render('pages/error', { title: 'Tidak Ditemukan', message: 'File tidak ditemukan pada pesanan ini.' });
  try {
    const response = await axios.get(item.fileUrl, { responseType: 'stream', timeout: 30000 });
    const fileName = `${item.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).render('pages/error', { title: 'Download Gagal', message: 'Server gagal mengambil file produk dari URL.' });
  }
});

module.exports = router;
