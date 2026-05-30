const crypto = require('crypto');

const WINDOW_MS = 15 * 60 * 1000;
const buckets = new Map();

function cleanOldBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.start > WINDOW_MS * 2) buckets.delete(key);
  }
}

setInterval(cleanOldBuckets, WINDOW_MS).unref?.();

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function getAllowedOrigins(req) {
  const origins = new Set();
  const appUrl = process.env.APP_URL || '';
  const trusted = process.env.TRUSTED_ORIGINS || '';
  const host = req.get('host');
  if (host) {
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }
  if (appUrl) origins.add(normalizeOrigin(appUrl));
  trusted.split(',').map((x) => normalizeOrigin(x.trim())).filter(Boolean).forEach((x) => origins.add(x));
  return origins;
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown').split(',')[0].trim();
}

function rateLimit({ name, limit = 60, windowMs = WINDOW_MS, message = 'Terlalu banyak request. Coba lagi nanti.' }) {
  return (req, res, next) => {
    const ip = requestIp(req);
    const key = `${name}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, start: now };
    if (now - bucket.start > windowMs) {
      bucket.count = 0;
      bucket.start = now;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      if (req.accepts('json') && req.path.startsWith('/api/')) return res.status(429).json({ message });
      req.session.error = message;
      return res.status(429).redirect('back');
    }
    next();
  };
}

function ensureCsrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function attachSecurity(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.locals.csrfToken = ensureCsrfToken(req);
  res.locals.enableClientGuard = String(process.env.ENABLE_CLIENT_GUARD || 'true') === 'true';
  next();
}

function verifyOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const originHeader = req.get('origin');
  const refererHeader = req.get('referer');
  const suppliedOrigin = normalizeOrigin(originHeader || refererHeader || '');
  if (!suppliedOrigin) return next();
  if (getAllowedOrigins(req).has(suppliedOrigin)) return next();
  if (req.accepts('json') && req.path.startsWith('/api/')) return res.status(403).json({ message: 'Request ditolak karena origin tidak valid.' });
  req.session.error = 'Request ditolak karena origin tidak valid.';
  return res.status(403).redirect('/login');
}

function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const sessionToken = ensureCsrfToken(req);
  const bodyToken = req.body?._csrf || req.body?.csrfToken;
  const headerToken = req.get('x-csrf-token');
  const suppliedToken = String(headerToken || bodyToken || '');
  const valid = suppliedToken && sessionToken && crypto.timingSafeEqual(Buffer.from(sessionToken), Buffer.from(suppliedToken.padEnd(sessionToken.length).slice(0, sessionToken.length)));
  if (valid) return next();
  if (req.accepts('json') && req.path.startsWith('/api/')) return res.status(403).json({ message: 'CSRF token tidak valid. Refresh halaman dan coba lagi.' });
  req.session.error = 'CSRF token tidak valid. Refresh halaman dan coba lagi.';
  return res.status(403).redirect('back');
}

function requireAjax(req, res, next) {
  const hasJson = String(req.get('content-type') || '').includes('application/json');
  const requestedWith = req.get('x-requested-with') === 'XMLHttpRequest';
  if (hasJson && requestedWith) return next();
  return res.status(403).json({ message: 'Request ditolak.' });
}

function botTrap(req, res, next) {
  const trap = String(req.body?.website || req.body?.company || '').trim();
  if (!trap) return next();
  if (req.accepts('json') && req.path.startsWith('/api/')) return res.status(400).json({ message: 'Request ditolak.' });
  req.session.error = 'Request ditolak.';
  return res.status(400).redirect('back');
}

module.exports = {
  attachSecurity,
  verifyOrigin,
  csrfProtection,
  requireAjax,
  botTrap,
  rateLimit
};
