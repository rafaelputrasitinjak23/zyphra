require('dotenv').config();
const admin = require('../config/firebaseAdmin');
const connectDB = require('../config/db');
const User = require('../models/User');

function adminEmails() {
  const list = [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || '').split(',')];
  return list.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean);
}

async function run() {
  const email = (process.env.ADMIN_EMAIL || adminEmails()[0] || 'admin@example.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin12345!';
  const displayName = process.env.ADMIN_NAME || 'Administrator';

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(password)) {
    throw new Error('ADMIN_PASSWORD harus kuat: minimal 10 karakter, huruf besar, huruf kecil, angka, dan simbol.');
  }

  let firebaseUser;
  try {
    firebaseUser = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(firebaseUser.uid, {
      password,
      displayName,
      emailVerified: true,
      disabled: false
    });
    console.log(`Admin Firebase sudah ada, password diperbarui: ${email}`);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false
    });
    console.log(`Admin Firebase berhasil dibuat: ${email}`);
  }

  await admin.auth().setCustomUserClaims(firebaseUser.uid, { admin: true });
  await connectDB();
  await User.findOneAndUpdate(
    { uid: firebaseUser.uid },
    {
      uid: firebaseUser.uid,
      email,
      name: displayName,
      photoURL: firebaseUser.photoURL || '',
      provider: 'password',
      emailVerified: true,
      role: 'admin',
      lastLoginAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  console.log('Admin siap digunakan.');
  console.log(`Email    : ${email}`);
  console.log(`Password : ${password}`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
