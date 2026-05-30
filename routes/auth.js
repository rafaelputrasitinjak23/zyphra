const express = require('express');
const crypto = require('crypto');
const admin = require('../config/firebaseAdmin');
const User = require('../models/User');
const firebaseClientConfig = require('../config/firebaseClient');
const { setCaptcha, verifyCaptcha } = require('../services/captcha');
const { sendDiscordLog } = require('../services/discord');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailer');
const { requireAjax, botTrap, rateLimit } = require('../middleware/security');
const router = express.Router();

function adminEmails() {
  const list = [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || '').split(',')];
  return list.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function validateStrongPassword(password) {
  const value = String(password || '');
  const common = ['password', 'qwerty', 'admin', 'rahasia', '123456', 'abcdef', 'zyphra', 'calamary'];
  if (value.length < 10) return 'Password minimal 10 karakter.';
  if (/\s/.test(value)) return 'Password tidak boleh memakai spasi.';
  if (!/[a-z]/.test(value)) return 'Password wajib memiliki huruf kecil.';
  if (!/[A-Z]/.test(value)) return 'Password wajib memiliki huruf besar.';
  if (!/[0-9]/.test(value)) return 'Password wajib memiliki angka.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Password wajib memiliki simbol.';
  if (/(.)\1\1/.test(value)) return 'Password tidak boleh memiliki karakter sama berulang 3 kali.';
  if (common.some((word) => value.toLowerCase().includes(word))) return 'Password terlalu mudah ditebak.';
  return '';
}

async function syncUser(decodedToken) {
  const firebaseUser = await admin.auth().getUser(decodedToken.uid);
  const existingUser = await User.findOne({ uid: firebaseUser.uid });
  const isEnvAdmin = adminEmails().includes((firebaseUser.email || '').toLowerCase());
  const role = existingUser?.role === 'admin' || isEnvAdmin ? 'admin' : 'user';
  const user = await User.findOneAndUpdate(
    { uid: firebaseUser.uid },
    {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: existingUser?.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      photoURL: firebaseUser.photoURL || '',
      provider: 'password',
      emailVerified: firebaseUser.emailVerified,
      role,
      lastLoginAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return user;
}

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/account');
  const captcha = setCaptcha(req, 'login');
  res.render('pages/login', { title: 'Login', firebaseConfig: firebaseClientConfig(), next: req.query.next || '/account', captchaCode: captcha.code, captchaToken: captcha.token });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/account');
  const captcha = setCaptcha(req, 'register');
  res.render('pages/register', { title: 'Register', captchaCode: captcha.code, captchaToken: captcha.token });
});

router.post('/api/auth/register', requireAjax, botTrap, rateLimit({ name: 'register', limit: Number(process.env.AUTH_RATE_LIMIT || 12), windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { name, email, password, confirmPassword, captcha, captchaToken } = req.body;
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanName || !cleanEmail || !password || !confirmPassword) return res.status(400).json({ message: 'Semua field wajib diisi.' });
    if (!verifyCaptcha(req, 'register', captcha, captchaToken)) return res.status(400).json({ message: 'Captcha salah atau sudah kedaluwarsa. Refresh halaman dan coba lagi.' });
    if (password !== confirmPassword) return res.status(400).json({ message: 'Password dan konfirmasi password tidak sama.' });
    const strength = validateStrongPassword(password);
    if (strength) return res.status(400).json({ message: strength });

    const token = makeToken();
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({ email: cleanEmail, password, displayName: cleanName, emailVerified: false, disabled: false });
    } catch (err) {
      if (err.code !== 'auth/email-already-exists') throw err;
      firebaseUser = await admin.auth().getUserByEmail(cleanEmail);
      if (firebaseUser.emailVerified) return res.status(409).json({ message: 'Email sudah terdaftar. Silakan login.' });
      await admin.auth().updateUser(firebaseUser.uid, { password, displayName: cleanName, emailVerified: false, disabled: false });
    }

    const isEnvAdmin = adminEmails().includes(cleanEmail);
    const user = await User.findOneAndUpdate(
      { uid: firebaseUser.uid },
      {
        uid: firebaseUser.uid,
        email: cleanEmail,
        name: cleanName,
        provider: 'password',
        emailVerified: false,
        role: isEnvAdmin ? 'admin' : 'user',
        emailVerificationToken: token,
        emailVerificationExpires: new Date(Date.now() + 30 * 60 * 1000)
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const sent = await sendVerificationEmail(req, user, token);
    res.json({ ok: true, message: sent ? 'Akun dibuat. Link verifikasi dikirim ke email Anda.' : 'Akun dibuat, tetapi SMTP belum aktif sehingga email belum terkirim. Isi SMTP di .env.' });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Register gagal.' });
  }
});

router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.render('pages/verify-email', { title: 'Verifikasi Email', status: 'info', message: 'Cek email Anda dan klik link verifikasi dari Zyphra.' });
  const user = await User.findOne({ emailVerificationToken: token, emailVerificationExpires: { $gt: new Date() } });
  if (!user) return res.render('pages/verify-email', { title: 'Verifikasi Email', status: 'error', message: 'Link verifikasi tidak valid atau sudah kedaluwarsa.' });
  await admin.auth().updateUser(user.uid, { emailVerified: true, disabled: false });
  user.emailVerified = true;
  user.emailVerificationToken = '';
  user.emailVerificationExpires = undefined;
  await user.save();
  res.render('pages/verify-email', { title: 'Verifikasi Berhasil', status: 'success', message: 'Email berhasil diverifikasi. Silakan login menggunakan email dan password Anda.' });
});

router.get('/forgot-password', (req, res) => {
  res.render('pages/forgot-password', { title: 'Lupa Password' });
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  if (user) {
    const token = makeToken();
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(req, user, token);
  }
  req.session.success = 'Jika email terdaftar, link ganti password akan dikirim melalui email.';
  res.redirect('/forgot-password');
});

router.get('/reset-password', async (req, res) => {
  const token = String(req.query.token || '').trim();
  const user = token ? await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } }) : null;
  if (!user) return res.render('pages/reset-password', { title: 'Ganti Password', token: '', invalid: true });
  res.render('pages/reset-password', { title: 'Ganti Password', token, invalid: false });
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body.token || '').trim();
  const { password, confirmPassword } = req.body;
  const user = await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } });
  if (!user) {
    req.session.error = 'Link ganti password tidak valid atau sudah kedaluwarsa.';
    return res.redirect('/forgot-password');
  }
  if (password !== confirmPassword) {
    req.session.error = 'Password dan konfirmasi password tidak sama.';
    return res.redirect('/reset-password?token=' + encodeURIComponent(token));
  }
  const strength = validateStrongPassword(password);
  if (strength) {
    req.session.error = strength;
    return res.redirect('/reset-password?token=' + encodeURIComponent(token));
  }
  await admin.auth().updateUser(user.uid, { password });
  user.passwordResetToken = '';
  user.passwordResetExpires = undefined;
  await user.save();
  req.session.success = 'Password berhasil diganti. Silakan login.';
  res.redirect('/login');
});


router.get('/api/captcha/new', rateLimit({ name: 'captcha', limit: Number(process.env.CAPTCHA_RATE_LIMIT || 40), windowMs: 10 * 60 * 1000 }), (req, res) => {
  const scope = req.query.scope === 'register' ? 'register' : 'login';
  const captcha = setCaptcha(req, scope);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ ok: true, code: captcha.code, token: captcha.token });
});

router.post('/api/captcha/verify', requireAjax, rateLimit({ name: 'captcha-verify', limit: Number(process.env.CAPTCHA_RATE_LIMIT || 40), windowMs: 10 * 60 * 1000 }), (req, res) => {
  const scope = req.body.scope === 'register' ? 'register' : 'login';
  const { captcha, captchaToken } = req.body;
  if (!verifyCaptcha(req, scope, captcha, captchaToken)) return res.status(400).json({ message: 'Captcha salah atau sudah kedaluwarsa. Refresh halaman dan coba lagi.' });
  res.json({ ok: true });
});

router.post('/api/session/login', requireAjax, botTrap, rateLimit({ name: 'login', limit: Number(process.env.AUTH_RATE_LIMIT || 12), windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { idToken, captcha, captchaToken, flow } = req.body;
    if (!idToken) return res.status(400).json({ message: 'Token tidak ditemukan.' });
    if (flow === 'login' && !verifyCaptcha(req, 'login', captcha, captchaToken)) return res.status(400).json({ message: 'Captcha salah atau sudah kedaluwarsa. Refresh halaman dan coba lagi.' });
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    const firebaseUser = await admin.auth().getUser(decodedToken.uid);
    if (!firebaseUser.emailVerified) return res.status(403).json({ message: 'Email belum diverifikasi. Cek email dari Zyphra terlebih dahulu.' });
    if (firebaseUser.providerData.some((provider) => provider.providerId === 'google.com')) return res.status(403).json({ message: 'Login Google sudah dinonaktifkan. Gunakan login email dan password.' });
    const user = await syncUser(decodedToken);
    req.session.uid = user.uid;
    req.session.userId = user._id.toString();
    req.session.role = user.role;
    await sendDiscordLog({
      title: 'User Login',
      description: 'Ada user yang berhasil login ke Zyphra.',
      color: user.role === 'admin' ? 15105570 : 5793266,
      fields: [
        { name: 'Nama', value: user.name, inline: true },
        { name: 'Email', value: user.email, inline: true },
        { name: 'Role', value: user.role, inline: true }
      ]
    });
    res.json({ ok: true, role: user.role });
  } catch (err) {
    res.status(401).json({ message: 'Login gagal. ' + err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
