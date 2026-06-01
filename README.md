# Zyphra Share Script

Website sharing script dan code berbasis **Express.js + MongoDB + EJS**, dengan UI clean premium seperti referensi yang diberikan. Project ini support deploy ke **Vercel**.

## Fitur

- Homepage untuk menampilkan script dan code.
- Kategori: Bot WA, Telegram, Discord, Website, API, Tools, Template, dan lainnya.
- Admin login sederhana menggunakan username/password dari environment variable.
- Admin dashboard untuk tambah, edit, hapus share.
- Tipe `Script`: thumbnail/gambar, deskripsi markdown, URL download.
- Tipe `Code`: auto detect bahasa syntax, preview code, copy code, download code sebagai file.
- Halaman detail dengan counter view, download, dan copy berbentuk icon SVG + angka.
- Search dan filter berdasarkan kategori/tipe.
- Konfigurasi Vercel sudah tersedia.
- Link admin tidak tampil di halaman publik; akses admin dilakukan lewat URL manual.
- Floating chat **Zyphra AI** untuk membantu pengunjung mencari script/code dari data yang tersedia di website.
- Zyphra AI membaca konten publik dari MongoDB lalu mengirim prompt ke API AI eksternal secara server-side.

## Struktur Folder

```txt
zyphra-share-script/
├── api/
│   └── index.js
├── config/
│   └── db.js
├── models/
│   └── Share.js
├── public/
│   ├── css/style.css
│   └── js/app.js
├── scripts/
│   └── seed.js
├── utils/
│   └── helpers.js
├── views/
│   ├── partials/
│   ├── index.ejs
│   ├── detail.ejs
│   ├── admin-login.ejs
│   ├── admin-dashboard.ejs
│   ├── admin-form.ejs
│   └── error.ejs
├── .env.example
├── package.json
└── vercel.json
```

## Cara Jalankan Lokal

1. Install dependency:

```bash
npm install
```

2. Buat file `.env` dari `.env.example`:

```bash
cp .env.example .env
```

3. Isi `.env`:

```env
PORT=3000
NODE_ENV=development
APP_NAME=Zyphra Share
APP_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/zyphra_share?retryWrites=true&w=majority
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin12345
ADMIN_COOKIE_SECRET=ganti_dengan_random_secret_panjang
AI_API_URL=https://api.siputzx.my.id/api/ai/glm47flash
AI_TEMPERATURE=0.7
AI_TIMEOUT_MS=18000
AI_CREATOR_NAME=Rafael Putra
```

4. Jalankan server:

```bash
npm run dev
```

5. Buka:

```txt
http://localhost:3000
```

Admin page:

```txt
http://localhost:3000/admin/login
```


## Fitur Zyphra AI

Zyphra AI tersedia sebagai tombol chat melayang di halaman publik. Chat ini memakai endpoint server-side:

```txt
POST /api/chat
```

Server akan mengambil daftar konten publik dari MongoDB, menyusun `system prompt` agar AI berperan sebagai Zyphra AI, mengenal pembuatnya dari `AI_CREATOR_NAME`, dan mengirim request ke API:

```txt
https://api.siputzx.my.id/api/ai/glm47flash
```

Agar AI tidak mengarang, system prompt dibuat untuk hanya menjawab berdasarkan script/code yang sudah dipublikasikan di website. Jawaban AI juga dibersihkan dari format markdown tebal dan hasil pencarian ditampilkan sebagai tombol/card, bukan link mentah. Kalau API eksternal timeout/error, website tetap memberi jawaban fallback berdasarkan data konten yang ada.

## Tambah Demo Data

Setelah `.env` benar dan MongoDB aktif, jalankan:

```bash
npm run seed
```

## Deploy ke Vercel

1. Upload project ke GitHub.
2. Import repository di Vercel.
3. Tambahkan Environment Variables di Vercel:

```env
APP_NAME=Zyphra Share
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/zyphra_share?retryWrites=true&w=majority
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password_admin_kamu
ADMIN_COOKIE_SECRET=random_secret_panjang
NODE_ENV=production
AI_API_URL=https://api.siputzx.my.id/api/ai/glm47flash
AI_TEMPERATURE=0.7
AI_TIMEOUT_MS=18000
AI_CREATOR_NAME=Rafael Putra
```

4. Deploy.

## Catatan Penting

- Project ini memakai URL gambar, bukan upload file lokal, supaya aman untuk Vercel serverless.
- Kalau ingin upload gambar langsung, gunakan Cloudinary, Firebase Storage, atau storage eksternal lain.
- `ADMIN_COOKIE_SECRET` wajib diganti dengan string random panjang.
- Untuk script, isi `downloadUrl` dengan link GitHub, Google Drive, Catbox, CDN, atau link file lainnya.
- Untuk code, kalau `downloadUrl` kosong, tombol download otomatis mengunduh isi code sebagai file teks sesuai bahasa.

## Catatan Deploy Vercel

Project ini memakai `pnpm` di Vercel untuk menghindari error npm seperti:

```txt
npm error Exit handler never called!
```

Pastikan file berikut ikut ter-push ke GitHub:

- `package.json`
- `vercel.json`
- `.npmrc`
- `pnpm-lock.yaml`

Jangan push `package-lock.json`. Jika ada, hapus dulu:

```bash
rm -f package-lock.json
```

Lalu commit ulang:

```bash
git add .
git commit -m "fix vercel install"
git push
```
