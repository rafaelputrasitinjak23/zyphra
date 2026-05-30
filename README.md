# Zyphra E-Commerce

Zyphra adalah website e-commerce produk digital berbasis Express.js, MongoDB, Firebase Auth, Tailwind CSS, Nodemailer, dan Discord Webhook.

## Fitur

- Login email/password only.
- Register dengan captcha unik dan password kuat.
- Verifikasi email menggunakan Nodemailer, bukan Firebase email template.
- Ganti password/reset password menggunakan Nodemailer.
- Session login 1 jam.
- Halaman utama clean, ringan, minimalis, modern, dan dark theme.
- Thumbnail besar di atas search produk.
- Produk digital dengan gambar URL, deskripsi, harga, stok, kategori, dan file URL.
- Checkout mengurangi stok otomatis.
- Produk yang dibeli tetap tersedia di akun user dan bisa di-download kapan saja.
- Email data pembelian dikirim ke user memakai Nodemailer.
- Admin login dari `/login`.
- Admin dashboard untuk produk, user, order, dan role admin.
- Admin bisa memberi/mencabut akses admin user lain.
- Admin bisa hapus user.
- Page `/report` untuk mengirim pesan ke Discord webhook.
- Discord logs untuk user login dan item terjual.
- Footer rapi dengan SVG untuk navigasi, WhatsApp, Discord, Telegram, dan YouTube.

## Instalasi

```bash
npm install
cp .env.example .env
```

Isi file `.env`.

## Jalankan lokal

```bash
npm run dev
```

Buka:

```text
http://localhost:3000
```

## Membuat akun admin

Isi bagian ini di `.env`:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin12345!
ADMIN_NAME=Administrator
ADMIN_EMAILS=admin@example.com
```

Lalu jalankan:

```bash
npm run create-admin
```

Login admin dari:

```text
/login
```

Jika akun memiliki role `admin`, otomatis diarahkan ke dashboard admin.

## Konfigurasi Firebase

Firebase masih dipakai untuk Authentication email/password dan penyimpanan identitas auth user.

Aktifkan hanya provider:

```text
Authentication > Sign-in method > Email/Password
```

Google Login tidak dipakai.

Isi Firebase Client Config di `.env`:

```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

Isi Firebase Admin SDK di `.env` sebagai JSON 1 baris:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

## Konfigurasi Nodemailer

Nodemailer dipakai untuk:

- Email verifikasi register.
- Email reset/ganti password.
- Email data pembelian ke user.

Contoh Gmail SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
MAIL_FROM=Zyphra <your_email@gmail.com>
SITE_NAME=Zyphra
APP_URL=http://localhost:3000
```

Untuk Gmail, gunakan App Password, bukan password akun biasa.

## Discord Webhook

Isi:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/yyyyy
DISCORD_WEBHOOK_USERNAME=Zyphra Logs
```

Webhook menerima:

- Pesan dari `/report`.
- Log user berhasil login.
- Log item terjual setelah checkout.

## Social Links Footer

```env
CONTACT_WHATSAPP_URL=https://wa.me/6281234567890
CONTACT_DISCORD_URL=https://discord.gg/yourinvite
CONTACT_TELEGRAM_URL=https://t.me/yourusername
CONTACT_YOUTUBE_URL=https://youtube.com/@yourchannel
```

## Thumbnail Home

```env
HOME_THUMBNAIL_URL=https://example.com/thumbnail.jpg
```

## Struktur Penting

```text
config/              Firebase dan MongoDB config
models/              User, Product, Order
routes/              Auth, Shop, Admin
services/mailer.js   Nodemailer emails
services/discord.js  Discord webhook logs
services/captcha.js  Captcha token HMAC
views/               EJS pages dan partials
public/css/app.css   Styling tambahan
public/js/auth.js    Login/register client logic
scripts/create-admin.js
```

## Catatan Deploy

Saat deploy ke Vercel atau hosting lain, isi semua `.env` di Environment Variables. Pastikan `APP_URL` memakai domain asli, contoh:

```env
APP_URL=https://zyphra.example.com
```

Ini penting agar link verifikasi email dan reset password mengarah ke domain produksi.

## Security Hardening v8

Versi ini menambahkan perlindungan ekstra untuk endpoint sensitif:

- CSRF token server-side untuk semua request POST/PUT/PATCH/DELETE.
- Same-origin check melalui header Origin/Referer.
- Rate limit global, login, register, dan captcha.
- Honeypot field pada login/register untuk menahan bot sederhana.
- Security headers via Helmet + CSP.
- Static file dotfiles ditolak.
- Client guard untuk blok klik kanan, F12, Ctrl+U, Ctrl+Shift+I/J/C sebagai penghalang ringan.

Catatan penting: endpoint API di aplikasi web tidak bisa benar-benar disembunyikan dari DevTools karena browser memang harus mengirim request ke server. Keamanan utama sudah dipindahkan ke server-side dengan CSRF, origin check, rate limit, captcha, Firebase token verification, dan session httpOnly.

Tambahkan domain produksi Anda di `.env`:

```env
APP_URL=https://domainanda.com
TRUSTED_ORIGINS=https://domainanda.com
GLOBAL_RATE_LIMIT=350
AUTH_RATE_LIMIT=12
CAPTCHA_RATE_LIMIT=40
ENABLE_CLIENT_GUARD=true
```

Jika memakai Vercel atau reverse proxy, `trust proxy` sudah diaktifkan agar rate limit membaca IP lebih akurat.

## Update v9

Fitur tambahan yang masuk di versi ini:

- Invoice otomatis setiap checkout berhasil.
- Halaman invoice user/admin: `/invoice/:orderId`.
- Email pembelian via Nodemailer sekarang menyertakan nomor invoice dan link invoice.
- Riwayat transaksi admin di `/admin/orders` dengan pencarian invoice/email/nama dan filter status.
- Dashboard statistik admin lebih lengkap:
  - total revenue
  - revenue hari ini
  - revenue bulan ini
  - transaksi hari ini/bulan ini
  - review produk
  - produk terlaris
  - transaksi terbaru
  - ringkasan penjualan 7 hari terakhir
- Review produk:
  - hanya user yang sudah membeli produk yang dapat memberi review
  - 1 user 1 review per produk
  - user dapat update review
  - rating rata-rata tampil di halaman produk

Catatan: checkout masih mode demo langsung `paid`. Untuk produksi, hubungkan status `paymentStatus` dengan payment gateway seperti Midtrans, Xendit, atau Tripay.
