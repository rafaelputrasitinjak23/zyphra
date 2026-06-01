require('dotenv').config();

const connectDB = require('../config/db');
const Share = require('../models/Share');
const { slugify } = require('../utils/helpers');

const demo = [
  {
    title: 'Bot WhatsApp Downloader Pro',
    slug: slugify('Bot WhatsApp Downloader Pro'),
    type: 'script',
    category: 'bot-wa',
    imageUrl: 'https://placehold.co/900x560/0f172a/ffffff?text=Bot+WhatsApp+Pro',
    shortDescription: 'Script bot WhatsApp untuk downloader, sticker, admin tools, dan automation.',
    description: '## Fitur Utama\n- Downloader video dan audio\n- Sticker image/video\n- Admin tools grup\n- Struktur command rapi\n\nCocok untuk base bot WhatsApp modern.',
    downloadUrl: 'https://github.com/',
    tags: ['whatsapp', 'bot', 'downloader'],
    isFeatured: true,
    isPublished: true
  },
  {
    title: 'Express MongoDB API Starter',
    slug: slugify('Express MongoDB API Starter'),
    type: 'code',
    category: 'api',
    language: 'javascript',
    shortDescription: 'Starter REST API Express.js + MongoDB dengan struktur sederhana dan siap deploy.',
    description: '## Tentang Code\nSnippet ini berisi contoh koneksi Express.js dengan MongoDB, routing API, dan error handler dasar.',
    code: `const express = require('express');\nconst mongoose = require('mongoose');\n\nconst app = express();\napp.use(express.json());\n\nmongoose.connect(process.env.MONGODB_URI);\n\napp.get('/api/health', (req, res) => {\n  res.json({ ok: true, message: 'API ready' });\n});\n\napp.listen(3000, () => console.log('Server running'));`,
    tags: ['express', 'mongodb', 'api'],
    isFeatured: false,
    isPublished: true
  },
  {
    title: 'Telegram Broadcast Bot',
    slug: slugify('Telegram Broadcast Bot'),
    type: 'script',
    category: 'telegram',
    imageUrl: 'https://placehold.co/900x560/2563eb/ffffff?text=Telegram+Bot',
    shortDescription: 'Template bot Telegram untuk broadcast, button, dan pengelolaan user.',
    description: '## Cocok Untuk\n- Bot promosi\n- Bot notifikasi\n- Bot tools admin\n\nTambahkan token bot dan jalankan di hosting Node.js.',
    downloadUrl: 'https://github.com/',
    tags: ['telegram', 'broadcast', 'bot'],
    isFeatured: false,
    isPublished: true
  }
];

async function seed() {
  await connectDB();
  for (const item of demo) {
    await Share.findOneAndUpdate({ slug: item.slug }, item, { upsert: true, new: true });
  }
  console.log('Demo data berhasil dibuat.');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
