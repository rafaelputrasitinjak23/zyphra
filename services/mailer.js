const nodemailer = require('nodemailer');

function getBaseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: { user, pass }
  });
}

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
}

function wrapEmail(title, body) {
  const siteName = process.env.SITE_NAME || 'Zyphra';
  return `
  <div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden">
        <div style="padding:26px;background:#020617;color:#ffffff">
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em">${siteName}</div>
          <div style="margin-top:8px;color:#cbd5e1;font-size:14px">Digital product marketplace</div>
        </div>
        <div style="padding:28px">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#0f172a">${title}</h1>
          ${body}
        </div>
        <div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
          Email otomatis dari ${siteName}. Abaikan email ini jika Anda tidak merasa melakukan aktivitas terkait.
        </div>
      </div>
    </div>
  </div>`;
}

async function sendMail({ to, subject, html, text }) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('SMTP belum dikonfigurasi. Email tidak dikirim:', subject, to);
    return false;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || `Zyphra <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text
  });
  return true;
}

async function sendVerificationEmail(req, user, token) {
  const link = `${getBaseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: user.email,
    subject: 'Verifikasi akun Zyphra',
    text: `Klik link berikut untuk verifikasi akun Zyphra: ${link}`,
    html: wrapEmail('Verifikasi akun Anda', `
      <p style="font-size:15px;line-height:1.7;color:#334155">Halo ${user.name || 'User'}, klik tombol di bawah untuk memverifikasi email akun Zyphra Anda.</p>
      <a href="${link}" style="display:inline-block;margin-top:14px;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:14px;font-weight:700">Verifikasi Email</a>
      <p style="margin-top:18px;font-size:13px;line-height:1.7;color:#64748b">Link berlaku 30 menit.</p>
    `)
  });
}

async function sendPasswordResetEmail(req, user, token) {
  const link = `${getBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: user.email,
    subject: 'Reset password Zyphra',
    text: `Klik link berikut untuk reset password Zyphra: ${link}`,
    html: wrapEmail('Reset password akun', `
      <p style="font-size:15px;line-height:1.7;color:#334155">Kami menerima permintaan reset password untuk akun ${user.email}.</p>
      <a href="${link}" style="display:inline-block;margin-top:14px;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:14px;font-weight:700">Ganti Password</a>
      <p style="margin-top:18px;font-size:13px;line-height:1.7;color:#64748b">Link berlaku 30 menit.</p>
    `)
  });
}

async function sendPurchaseEmail(user, order, items) {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0">${item.name}</td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center">${item.qty}</td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right">${rupiah(item.price * item.qty)}</td>
    </tr>
  `).join('');
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const invoiceLink = `${appUrl}/invoice/${order._id}`;
  return sendMail({
    to: user.email,
    subject: `Invoice ${order.invoiceNumber} - Pembelian Zyphra berhasil`,
    text: `Pembelian berhasil. Invoice: ${order.invoiceNumber}. Total: ${rupiah(order.total)}. Lihat invoice: ${invoiceLink}. Silakan login ke akun Zyphra untuk download produk kapan saja.`,
    html: wrapEmail('Pembelian berhasil', `
      <p style="font-size:15px;line-height:1.7;color:#334155">Terima kasih, ${user.name || user.email}. Pembelian Anda berhasil diproses.</p>
      <div style="margin-top:14px;padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;color:#1e3a8a"><b>Invoice:</b> ${order.invoiceNumber}<br><b>Status:</b> ${order.paymentStatus || order.status}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px">
        <thead><tr style="background:#f1f5f9"><th style="padding:12px;text-align:left">Produk</th><th style="padding:12px;text-align:center">Qty</th><th style="padding:12px;text-align:right">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:18px;font-size:16px;font-weight:800;color:#0f172a">Total: ${rupiah(order.total)}</p>
      <a href="${invoiceLink}" style="display:inline-block;margin-top:10px;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:14px;font-weight:700">Lihat Invoice</a>
      <p style="font-size:14px;line-height:1.7;color:#64748b">File produk tidak dilampirkan di email. Silakan login ke akun Zyphra untuk download produk Anda kapan saja.</p>
    `)
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendPurchaseEmail };
