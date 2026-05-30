const User = require('../models/User');

async function attachUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.isAdmin = false;
  res.locals.cartCount = 0;
  if (req.session && req.session.uid) {
    const user = await User.findOne({ uid: req.session.uid }).populate('cart.product');
    if (user) {
      req.user = user;
      res.locals.currentUser = user;
      res.locals.isAdmin = user.role === 'admin';
      res.locals.cartCount = user.cart.reduce((sum, item) => sum + item.qty, 0);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  if (req.user.role !== 'admin') return res.status(403).render('pages/error', { title: 'Akses Ditolak', message: 'Halaman ini hanya untuk admin.' });
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
