const crypto = require('crypto');

function secret() {
  return process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || 'dev-captcha-secret-change-me';
}

function createCaptchaCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) code += chars[crypto.randomInt(chars.length)];
  return code;
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase();
}

function signPayload(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

function createCaptcha(scope = 'auth') {
  const code = createCaptchaCode();
  const payloadObject = {
    scope,
    code,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomBytes(12).toString('hex')
  };
  const payload = Buffer.from(JSON.stringify(payloadObject)).toString('base64url');
  const signature = signPayload(payload);
  return { code, token: `${payload}.${signature}` };
}

function setCaptcha(req, scope = 'auth') {
  const captcha = createCaptcha(scope);
  req.session.captcha = req.session.captcha || {};
  req.session.captcha[scope] = captcha.code;
  req.session.captchaToken = req.session.captchaToken || {};
  req.session.captchaToken[scope] = captcha.token;
  return captcha;
}

function verifyToken(token, scope, input) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expectedSignature = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (data.scope !== scope) return false;
  if (!data.exp || Date.now() > data.exp) return false;
  return normalize(input) === normalize(data.code);
}

function verifyCaptcha(req, scope, input, token = '') {
  if (verifyToken(token, scope, input)) return true;

  const expected = req.session.captcha?.[scope];
  const ok = expected && normalize(input) === normalize(expected);
  if (ok && req.session.captcha) delete req.session.captcha[scope];
  return !!ok;
}

module.exports = { setCaptcha, verifyCaptcha, createCaptcha, normalize };
