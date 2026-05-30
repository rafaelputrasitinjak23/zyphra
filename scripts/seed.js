require('dotenv').config();
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Banner = require('../models/Banner');
const { slugify } = require('../utils');

async function run() {
  await connectDB();
  await Product.deleteMany({});
  await Banner.deleteMany({});
  await Product.insertMany([
    {
      name: 'Bot WhatsApp Store Script',
      slug: slugify('Bot WhatsApp Store Script'),
      description: 'Source code bot WhatsApp untuk toko digital, sudah support fitur katalog, order, dan admin sederhana.',
      price: 75000,
      stock: 20,
      imageUrl: 'https://images.unsplash.com/photo-1556155092-490a1ba16284?q=80&w=1200&auto=format&fit=crop',
      fileUrl: 'https://example.com/files/bot-whatsapp-store.zip',
      category: 'Bot Script',
      featured: true
    },
    {
      name: 'REST API Starter Express',
      slug: slugify('REST API Starter Express'),
      description: 'Template REST API Express.js dengan auth, MongoDB, rate limit, dan dokumentasi endpoint.',
      price: 50000,
      stock: 15,
      imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1200&auto=format&fit=crop',
      fileUrl: 'https://example.com/files/rest-api-starter.zip',
      category: 'REST API',
      featured: true
    }
  ]);
  await Banner.insertMany([
    { title: 'Diskon Script Premium', imageUrl: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?q=80&w=1200&auto=format&fit=crop', link: '/' },
    { title: 'Produk Eksklusif', imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop', link: '/' }
  ]);
  console.log('Seed selesai');
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
