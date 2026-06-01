require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const connectDB = require('../config/db');
const Share = require('../models/Share');
const {
  categoryLabels,
  languageLabels,
  slugify,
  escapeHtml,
  parseTags,
  formatNumber,
  getSnippet,
  makeAdminToken,
  verifyAdminToken,
  siteName,
  defaultImage,
  detectLanguage,
  iconSvg,
  prismAliases,
  renderMarkdown
} = require('../utils/helpers');

const app = express();
const ROOT = path.join(__dirname, '..');


app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/public', express.static(path.join(ROOT, 'public'), { maxAge: 0, etag: false }));

app.use((req, res, next) => {
  res.locals.siteName = siteName();
  res.locals.path = req.path;
  res.locals.categoryLabels = categoryLabels;
  res.locals.languageLabels = languageLabels;
  res.locals.formatNumber = formatNumber;
  res.locals.getSnippet = getSnippet;
  res.locals.escapeHtml = escapeHtml;
  res.locals.defaultImage = defaultImage;
  res.locals.detectLanguage = detectLanguage;
  res.locals.iconSvg = iconSvg;
  res.locals.prismAliases = prismAliases;
  res.locals.isAdmin = verifyAdminToken(req.cookies.zs_admin);
  res.locals.isAdminArea = req.path.startsWith('/admin');
  next();
});

async function ensureDB(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).render('error', {
      title: 'Database Error',
      message: error.message || 'Gagal menghubungkan ke database.'
    });
  }
}

function requireAdmin(req, res, next) {
  if (!verifyAdminToken(req.cookies.zs_admin)) {
    return res.redirect('/admin/login');
  }
  next();
}


function normalizeAiText(data) {
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object') return '';

  const directKeys = ['result', 'response', 'answer', 'message', 'text', 'content', 'output'];
  for (const key of directKeys) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }

  if (data.data) {
    const nested = normalizeAiText(data.data);
    if (nested) return nested;
  }

  if (Array.isArray(data.choices) && data.choices.length) {
    const choice = data.choices[0];
    if (choice?.message?.content) return String(choice.message.content).trim();
    if (choice?.text) return String(choice.text).trim();
  }

  return '';
}

function truncateText(text, max = 420) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function getBaseUrl(req) {
  const envUrl = String(process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (envUrl) return envUrl;
  return `${req.protocol}://${req.get('host')}`;
}

function scoreShareForPrompt(share, prompt) {
  const terms = String(prompt || '')
    .toLowerCase()
    .split(/[^a-z0-9+#._-]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 18);

  if (!terms.length) return share.isFeatured ? 2 : 0;

  const haystack = [
    share.title,
    share.type,
    categoryLabels[share.category],
    languageLabels[share.language],
    share.shortDescription,
    share.description,
    (share.tags || []).join(' '),
    share.code ? share.code.slice(0, 1600) : ''
  ]
    .join(' ')
    .toLowerCase();

  return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), share.isFeatured ? 2 : 0);
}

function pickKnowledgeShares(shares, prompt, limit = 14) {
  const scored = shares
    .map((share, index) => ({ share, index, score: scoreShareForPrompt(share, prompt) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const relevant = scored.filter((item) => item.score > 0).map((item) => item.share);
  const fallback = shares.slice(0, limit);
  const selected = relevant.length ? relevant : fallback;

  const unique = [];
  const seen = new Set();
  for (const share of selected.concat(fallback)) {
    const id = String(share._id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(share);
    if (unique.length >= limit) break;
  }
  return unique;
}

function buildShareKnowledge(shares, prompt, baseUrl) {
  const selected = pickKnowledgeShares(shares, prompt);
  if (!selected.length) {
    return 'Belum ada konten publik yang tersimpan di website.';
  }

  return selected
    .map((share, index) => {
      const typeLabel = share.type === 'code' ? 'Code' : 'Script';
      const category = categoryLabels[share.category] || share.category || 'Lainnya';
      const language = share.type === 'code' ? (languageLabels[share.language] || share.language || 'Text') : '-';
      const desc = truncateText(share.shortDescription || share.description || 'Tidak ada deskripsi singkat.', 280);
      const tags = (share.tags || []).slice(0, 8).join(', ') || '-';
      const codePreview = share.type === 'code' && share.code ? ` | preview code: ${truncateText(share.code, 420)}` : '';
      return `${index + 1}. ${share.title} | tipe: ${typeLabel} | kategori: ${category} | bahasa: ${language} | tag: ${tags} | statistik: ${share.views || 0} view, ${share.downloads || 0} download, ${share.copies || 0} copy | deskripsi: ${desc}${codePreview}`;
    })
    .join('\n');
}

function getAiCreatorName() {
  return String(process.env.AI_CREATOR_NAME || 'Rafael Putra').trim();
}

function cleanAiAnswer(answer) {
  return String(answer || '')
    .replace(/\*\*/g, '')
    .replace(/__+/g, '')
    .replace(/`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/https?:\/\/[^\s)]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shouldShowRecommendationCards(prompt) {
  return /\b(cari|carikan|search|find|rekomendasi|rekomendasikan|ada|tersedia|tampilkan|lihat|butuh|mau|script|kode|code|bot|api|website|web|telegram|whatsapp|wa|discord|download|template|tools?)\b/i.test(String(prompt || ''));
}

function buildRecommendationCards(shares, prompt, baseUrl, limit = 4) {
  if (!shouldShowRecommendationCards(prompt)) return [];
  const selected = pickKnowledgeShares(shares, prompt, limit);

  return selected.slice(0, limit).map((share) => {
    const type = share.type === 'code' ? 'Code' : 'Script';
    const category = categoryLabels[share.category] || share.category || 'Lainnya';
    const language = share.type === 'code' ? (languageLabels[share.language] || share.language || 'Text') : '';
    const description = truncateText(share.shortDescription || share.description || 'Tidak ada deskripsi singkat.', 145);

    return {
      title: share.title,
      type,
      category,
      language,
      description,
      url: `/share/${share.slug}`,
      views: share.views || 0,
      downloads: share.downloads || 0,
      copies: share.copies || 0
    };
  });
}

function buildZyphraSystem(knowledge, totalCount, creatorName) {
  return `Kamu adalah Zyphra AI, asisten AI resmi untuk website Zyphra Share.

Identitas:
- Nama kamu: Zyphra AI.
- Kamu dibuat dan dikembangkan oleh ${creatorName}.
- Tugas utama kamu membantu pengunjung mencari script, code, bot WhatsApp, bot Telegram, bot Discord, website, API, tools, dan template yang tersedia di website.

Aturan jawaban:
- Jawab natural seperti chat assistant profesional, bukan seperti bot kaku.
- Gunakan bahasa Indonesia yang rapi, ramah, singkat, jelas, dan percaya diri.
- Jangan gunakan markdown tebal seperti **teks**.
- Jangan tulis link mentah atau URL di jawaban. Jika merekomendasikan konten, cukup arahkan user untuk klik tombol hasil yang muncul di bawah chat.
- Jangan mengarang judul, link, harga, fitur, atau file yang tidak ada di data.
- Jawab hanya berdasarkan DATA KONTEN PUBLIK di bawah saat membahas isi website.
- Jika user meminta konten yang belum tersedia, katakan dengan jujur bahwa konten itu belum tersedia, lalu sarankan kata kunci atau kategori terdekat.
- Jangan menyebut admin page, MongoDB, database internal, token, cookie, endpoint rahasia, atau detail teknis server.
- Jika user bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh ${creatorName} untuk membantu pengunjung Zyphra mencari script dan code.

Total konten publik: ${totalCount}.

DATA KONTEN PUBLIK ZYPHRA:
${knowledge}`;
}

function buildFallbackAnswer(prompt, shares, baseUrl) {
  const cards = buildRecommendationCards(shares, prompt, baseUrl, 4);

  if (!shares.length) {
    return {
      answer: 'Belum ada script atau code publik yang tersimpan di website ini. Coba cek lagi nanti setelah konten ditambahkan.',
      cards: []
    };
  }

  if (cards.length) {
    return {
      answer: 'Saya menemukan beberapa konten yang paling sesuai dengan pencarian kamu. Silakan klik tombol detail pada hasil di bawah untuk melihat preview, statistik, copy code, atau download.',
      cards
    };
  }

  return {
    answer: `Saya Zyphra AI, asisten chat untuk membantu kamu mencari script, code, bot, website, API, dan template yang tersedia di Zyphra. Saya dibuat dan dikembangkan oleh ${getAiCreatorName()}. Kamu bisa bertanya seperti: carikan bot WhatsApp, cari API downloader, atau tampilkan code JavaScript.`,
    cards: []
  };
}

async function callZyphraAi(prompt, system) {
  const endpoint = process.env.AI_API_URL || 'https://api.siputzx.my.id/api/ai/glm47flash';
  const url = new URL(endpoint);
  url.searchParams.set('prompt', prompt);
  url.searchParams.set('system', system);
  url.searchParams.set('temperatur', process.env.AI_TEMPERATURE || '0.7');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 18000));

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': `${siteName().replace(/\s+/g, '-')}/1.0`
      },
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`AI API error ${response.status}`);

    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {}

    const answer = normalizeAiText(parsed) || raw.trim();
    if (!answer) throw new Error('AI API tidak mengembalikan jawaban.');
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) return '';
  return history
    .slice(-6)
    .map((item) => {
      const role = item && item.role === 'assistant' ? 'Zyphra AI' : 'User';
      const text = truncateText(item && item.content, 220);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

async function createUniqueSlug(title, currentId) {
  const base = slugify(title);
  let slug = base;
  let counter = 2;

  while (true) {
    const exists = await Share.findOne({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) }).select('_id').lean();
    if (!exists) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

function normalizeBody(body) {
  const type = body.type === 'code' ? 'code' : 'script';
  const code = String(body.code || '');
  const selectedLanguage = String(body.language || 'auto').trim().toLowerCase();
  const language = type === 'code' ? detectLanguage(code, selectedLanguage) : 'text';

  return {
    title: String(body.title || '').trim(),
    type,
    category: categoryLabels[body.category] ? body.category : 'other',
    language,
    imageUrl: String(body.imageUrl || '').trim(),
    shortDescription: String(body.shortDescription || '').trim(),
    description: String(body.description || '').trim(),
    downloadUrl: String(body.downloadUrl || '').trim(),
    code,
    tags: parseTags(body.tags),
    isFeatured: body.isFeatured === 'on',
    isPublished: body.isPublished !== 'off'
  };
}

app.get('/', ensureDB, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const type = String(req.query.type || '').trim();

  const filter = { isPublished: true };
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { shortDescription: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { tags: { $regex: q, $options: 'i' } }
    ];
  }
  if (category && categoryLabels[category]) filter.category = category;
  if (['script', 'code'].includes(type)) filter.type = type;

  const [shares, featured, totalShares, totalViews, totalDownloads, codeCount] = await Promise.all([
    Share.find(filter).sort({ isFeatured: -1, createdAt: -1 }).limit(24).lean(),
    Share.findOne({ isPublished: true, isFeatured: true }).sort({ createdAt: -1 }).lean(),
    Share.countDocuments({ isPublished: true }),
    Share.aggregate([{ $match: { isPublished: true } }, { $group: { _id: null, total: { $sum: '$views' } } }]),
    Share.aggregate([{ $match: { isPublished: true } }, { $group: { _id: null, total: { $sum: '$downloads' } } }]),
    Share.countDocuments({ isPublished: true, type: 'code' })
  ]);

  res.render('index', {
    title: `${siteName()} - Sharing Script & Code`,
    shares,
    featured: featured || shares[0] || null,
    query: { q, category, type },
    stats: {
      totalShares,
      totalViews: totalViews[0]?.total || 0,
      totalDownloads: totalDownloads[0]?.total || 0,
      codeCount
    }
  });
});

app.get('/share/:slug', ensureDB, async (req, res) => {
  const share = await Share.findOneAndUpdate(
    { slug: req.params.slug, isPublished: true },
    { $inc: { views: 1 } },
    { new: true }
  ).lean();

  if (!share) {
    return res.status(404).render('error', {
      title: 'Share Tidak Ditemukan',
      message: 'Konten yang kamu cari tidak tersedia atau belum dipublikasikan.'
    });
  }

  const related = await Share.find({
    _id: { $ne: share._id },
    isPublished: true,
    category: share.category
  })
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  res.render('detail', {
    title: `${share.title} - ${siteName()}`,
    share,
    related,
    markdownHtml: share.description ? renderMarkdown(share.description) : ''
  });
});

app.get('/download/:id', ensureDB, async (req, res) => {
  const share = await Share.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true }).lean();

  if (!share || !share.isPublished) {
    return res.status(404).render('error', {
      title: 'Download Tidak Tersedia',
      message: 'File atau kode yang kamu minta tidak ditemukan.'
    });
  }

  if (share.downloadUrl) return res.redirect(share.downloadUrl);

  if (share.code) {
    const extensionMap = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      php: 'php',
      html: 'html',
      css: 'css',
      json: 'json',
      bash: 'sh',
      markdown: 'md',
      java: 'java',
      cpp: 'cpp',
      csharp: 'cs',
      go: 'go',
      rust: 'rs',
      sql: 'sql',
      text: 'txt'
    };
    const ext = extensionMap[share.language] || 'txt';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${share.slug}.${ext}"`);
    return res.send(share.code);
  }

  res.status(404).render('error', {
    title: 'URL Download Kosong',
    message: 'Admin belum menambahkan URL download untuk konten ini.'
  });
});

app.post('/api/share/:id/copy', ensureDB, async (req, res) => {
  const share = await Share.findByIdAndUpdate(req.params.id, { $inc: { copies: 1 } }, { new: true }).select('copies').lean();
  if (!share) return res.status(404).json({ ok: false, message: 'Share tidak ditemukan.' });
  res.json({ ok: true, copies: share.copies });
});

app.post('/api/chat', ensureDB, async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  const history = normalizeChatHistory(req.body.history);

  if (!prompt) {
    return res.status(400).json({ ok: false, message: 'Pesan tidak boleh kosong.' });
  }

  if (prompt.length > 700) {
    return res.status(400).json({ ok: false, message: 'Pesan terlalu panjang. Maksimal 700 karakter.' });
  }

  const baseUrl = getBaseUrl(req);
  const creatorName = getAiCreatorName();
  const shares = await Share.find({ isPublished: true })
    .sort({ isFeatured: -1, createdAt: -1 })
    .limit(80)
    .lean();

  const cards = buildRecommendationCards(shares, prompt, baseUrl, 4);
  const knowledge = buildShareKnowledge(shares, prompt, baseUrl);
  const system = buildZyphraSystem(knowledge, shares.length, creatorName);
  const cardContext = cards.length
    ? cards.map((card, index) => `${index + 1}. ${card.title} | ${card.type} | ${card.category}${card.language ? ` | ${card.language}` : ''}`).join('\n')
    : '';

  const userPrompt = [
    history ? `Riwayat chat singkat:\n${history}` : '',
    `Pertanyaan user: ${prompt}`,
    cardContext ? `Konten yang akan ditampilkan website sebagai tombol hasil:\n${cardContext}` : '',
    'Jawab sebagai Zyphra AI. Jangan gunakan markdown tebal. Jangan tulis URL mentah. Jika ada hasil pencarian, arahkan user untuk klik tombol hasil di bawah chat.'
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const rawAnswer = await callZyphraAi(userPrompt, system);
    const answer = cleanAiAnswer(rawAnswer) || 'Saya siap membantu mencari script dan code yang tersedia di Zyphra.';
    res.json({ ok: true, answer, cards, source: 'ai' });
  } catch (error) {
    console.error('[zyphra-ai]', error.message || error);
    const fallback = buildFallbackAnswer(prompt, shares, baseUrl);
    res.json({
      ok: true,
      answer: cleanAiAnswer(fallback.answer),
      cards: fallback.cards,
      source: 'fallback'
    });
  }
});

app.get('/admin/login', (req, res) => {
  if (verifyAdminToken(req.cookies.zs_admin)) return res.redirect('/admin');
  res.render('admin-login', {
    title: 'Admin Login',
    error: req.query.error ? 'Username atau password admin salah.' : ''
  });
});

app.post('/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin12345';

  if (username !== adminUsername || password !== adminPassword) {
    return res.redirect('/admin/login?error=1');
  }

  res.cookie('zs_admin', makeAdminToken(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  });
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie('zs_admin');
  res.redirect('/admin/login');
});

app.get('/admin', ensureDB, requireAdmin, async (req, res) => {
  const [shares, totalShares, totalViews, totalDownloads, totalCopies] = await Promise.all([
    Share.find({}).sort({ createdAt: -1 }).lean(),
    Share.countDocuments({}),
    Share.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
    Share.aggregate([{ $group: { _id: null, total: { $sum: '$downloads' } } }]),
    Share.aggregate([{ $group: { _id: null, total: { $sum: '$copies' } } }])
  ]);

  res.render('admin-dashboard', {
    title: 'Admin Dashboard',
    shares,
    stats: {
      totalShares,
      totalViews: totalViews[0]?.total || 0,
      totalDownloads: totalDownloads[0]?.total || 0,
      totalCopies: totalCopies[0]?.total || 0
    }
  });
});

app.get('/admin/add', ensureDB, requireAdmin, (req, res) => {
  res.render('admin-form', {
    title: 'Tambah Share',
    mode: 'add',
    action: '/admin/add',
    share: {
      title: '',
      type: 'script',
      category: 'bot-wa',
      language: 'auto',
      imageUrl: '',
      shortDescription: '',
      description: '',
      downloadUrl: '',
      code: '',
      tags: [],
      isFeatured: false,
      isPublished: true
    },
    error: ''
  });
});

app.post('/admin/add', ensureDB, requireAdmin, async (req, res) => {
  const data = normalizeBody(req.body);

  if (!data.title) {
    return res.status(400).render('admin-form', {
      title: 'Tambah Share',
      mode: 'add',
      action: '/admin/add',
      share: data,
      error: 'Judul wajib diisi.'
    });
  }

  data.slug = await createUniqueSlug(data.title);
  await Share.create(data);
  res.redirect('/admin');
});

app.get('/admin/edit/:id', ensureDB, requireAdmin, async (req, res) => {
  const share = await Share.findById(req.params.id).lean();
  if (!share) return res.redirect('/admin');
  res.render('admin-form', {
    title: 'Edit Share',
    mode: 'edit',
    action: `/admin/edit/${share._id}`,
    share,
    error: ''
  });
});

app.post('/admin/edit/:id', ensureDB, requireAdmin, async (req, res) => {
  const data = normalizeBody(req.body);

  if (!data.title) {
    return res.status(400).render('admin-form', {
      title: 'Edit Share',
      mode: 'edit',
      action: `/admin/edit/${req.params.id}`,
      share: { ...data, _id: req.params.id },
      error: 'Judul wajib diisi.'
    });
  }

  data.slug = await createUniqueSlug(data.title, req.params.id);
  await Share.findByIdAndUpdate(req.params.id, data, { runValidators: true });
  res.redirect('/admin');
});

app.post('/admin/delete/:id', ensureDB, requireAdmin, async (req, res) => {
  await Share.findByIdAndDelete(req.params.id);
  res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Tidak Ditemukan',
    message: 'Halaman yang kamu cari tidak ada.'
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: err.message || 'Terjadi kesalahan pada server.'
  });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`${siteName()} running on http://localhost:${port}`);
  });
}
