import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

let auth = null;
if (window.firebaseConfig) {
  const app = initializeApp(window.firebaseConfig);
  auth = getAuth(app);
}

const $ = (id) => document.getElementById(id);
const alertBox = $('authAlert');
const loginForm = $('loginForm');
const registerForm = $('registerForm');
const nextInput = $('nextUrl');
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

function showAlert(message, type = 'info') {
  if (!alertBox) return;
  alertBox.className = 'mb-4 rounded-2xl border px-4 py-3 text-sm ' + (type === 'error'
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
    : 'border-blue-500/30 bg-blue-500/10 text-blue-200');
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
}

function parseFirebaseError(error) {
  const code = error?.code || '';
  const map = {
    'auth/unauthorized-domain': 'Domain website belum ditambahkan di Firebase Authorized domains.',
    'auth/operation-not-allowed': 'Provider email/password belum diaktifkan di Firebase Authentication.',
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/invalid-login-credentials': 'Email atau password salah.',
    'auth/user-not-found': 'Akun tidak ditemukan.',
    'auth/wrong-password': 'Password salah.',
    'auth/user-disabled': 'Akun dinonaktifkan.',
    'auth/network-request-failed': 'Koneksi internet bermasalah.'
  };
  return map[code] || error?.message || 'Terjadi kesalahan autentikasi.';
}

function validateStrongPassword(password) {
  const common = ['password', 'qwerty', 'admin', 'rahasia', '123456', 'abcdef', 'zyphra', 'calamary'];
  if (password.length < 10) return 'Password minimal 10 karakter.';
  if (/\s/.test(password)) return 'Password tidak boleh memakai spasi.';
  if (!/[a-z]/.test(password)) return 'Password wajib memiliki huruf kecil.';
  if (!/[A-Z]/.test(password)) return 'Password wajib memiliki huruf besar.';
  if (!/[0-9]/.test(password)) return 'Password wajib memiliki angka.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password wajib memiliki simbol, contoh: ! @ # $ %.';
  if (/(.)\1\1/.test(password)) return 'Password tidak boleh memiliki karakter sama berulang 3 kali.';
  if (common.some((word) => password.toLowerCase().includes(word))) return 'Password terlalu mudah ditebak. Hindari kata umum seperti password/admin/qwerty.';
  return '';
}

async function refreshCaptcha(scope) {
  const display = $('captchaDisplay');
  const tokenInput = $('captchaToken');
  const input = $('captcha');
  if (!display || !tokenInput) return;
  try {
    const res = await fetch(`/api/captcha/new?scope=${encodeURIComponent(scope)}&t=${Date.now()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code || !data.token) throw new Error('Captcha gagal dimuat ulang.');
    display.textContent = data.code;
    tokenInput.value = data.token;
    if (input) input.value = '';
  } catch {
    if (display) display.textContent = 'RELOAD';
    if (input) input.value = '';
  }
}

async function createServerSession(user, next = '/account', captcha = '', flow = 'login', captchaToken = '') {
  await user.reload();
  const freshUser = auth.currentUser || user;
  if (!freshUser.emailVerified) throw new Error('Email belum diverifikasi. Cek inbox/spam Anda lalu login lagi.');
  const idToken = await freshUser.getIdToken(true);
  const res = await fetch('/api/session/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ idToken, captcha, captchaToken, flow, website: $('website')?.value || '' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Gagal membuat session server.');
  location.href = data.role === 'admin' ? '/admin' : next;
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const emailInput = $('email');
  const passwordInput = $('password');
  const captchaInput = $('captcha');
  const captchaTokenInput = $('captchaToken');
  try {
    showAlert('Memproses login...');
    if (!auth) throw new Error('Firebase client config belum diisi.');
    const result = await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    await createServerSession(result.user, nextInput?.value || '/account', captchaInput?.value || '', 'login', captchaTokenInput?.value || '');
  } catch (error) {
    showAlert(parseFirebaseError(error), 'error');
    await refreshCaptcha('login');
  }
});

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const passwordInput = $('password');
  const confirmPasswordInput = $('confirmPassword');
  try {
    const strengthMessage = validateStrongPassword(passwordInput.value);
    if (strengthMessage) throw new Error(strengthMessage);
    if (passwordInput.value !== confirmPasswordInput.value) throw new Error('Password dan konfirmasi password tidak sama.');
    showAlert('Membuat akun dan mengirim email verifikasi...');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        website: $('website')?.value || '',
        name: $('name')?.value || '',
        email: $('email')?.value || '',
        password: passwordInput.value,
        confirmPassword: confirmPasswordInput.value,
        captcha: $('captcha')?.value || '',
        captchaToken: $('captchaToken')?.value || ''
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Register gagal.');
    showAlert(data.message || 'Link verifikasi sudah dikirim ke email Anda.');
    setTimeout(() => { location.href = '/login'; }, 1800);
  } catch (error) {
    showAlert(error?.message || 'Register gagal.', 'error');
    await refreshCaptcha('register');
  }
});
