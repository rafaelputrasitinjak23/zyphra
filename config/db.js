const mongoose = require('mongoose');

let cached = global.__zyphraMongoCache;

if (!cached) {
  cached = global.__zyphraMongoCache = {
    conn: null,
    promise: null
  };
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI belum diisi. Isi MONGODB_URI di .env lokal atau Environment Variables Vercel.');

  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 5),
      serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS || 10000)
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
