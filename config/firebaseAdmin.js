const admin = require('firebase-admin');

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  return null;
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.warn('Firebase Admin belum dikonfigurasi. Isi FIREBASE_SERVICE_ACCOUNT di .env');
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  } else {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

module.exports = admin;
