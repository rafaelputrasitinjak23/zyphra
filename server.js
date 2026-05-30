require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { attachUser } = require('./middleware/auth');
const flash = require('./middleware/flash');
const { attachSecurity, verifyOrigin, csrfProtection, rateLimit } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

connectDB().catch(err => {
  console.error('MongoDB connection error:', err.message);
  if (require.main === module) process.exit(1);
});

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://cdn.tailwindcss.com", "https://www.gstatic.com", "https://www.googleapis.com", "'unsafe-inline'"],
      "connect-src": ["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.googleapis.com"],
      "img-src": ["'self'", "data:", "https:", "http:"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"]
    }
  }
}));
if (!isProduction) app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  etag: true,
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(session({
  name: 'zyphra.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 1000 * 60 * 60,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction
  },
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: 'sessions', ttl: 60 * 60 })
}));

app.use(attachSecurity);
app.use(verifyOrigin);
app.use(csrfProtection);
app.use(rateLimit({ name: 'global', limit: Number(process.env.GLOBAL_RATE_LIMIT || 350), windowMs: 15 * 60 * 1000 }));
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.siteLinks = {
    whatsapp: process.env.CONTACT_WHATSAPP_URL || '#',
    discord: process.env.CONTACT_DISCORD_URL || '#',
    telegram: process.env.CONTACT_TELEGRAM_URL || '#',
    youtube: process.env.CONTACT_YOUTUBE_URL || '#'
  };
  next();
});
app.use(flash);

app.use(require('./routes/auth'));
app.use(require('./routes/shop'));
app.use(require('./routes/admin'));

app.use((req, res) => res.status(404).render('pages/error', { title: '404', message: 'Halaman tidak ditemukan.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('pages/error', { title: 'Server Error', message: err.message || 'Terjadi kesalahan server.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
