const mongoose = require('mongoose');

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = {
    conn: null,
    promise: null
  };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI belum diisi. Isi di .env untuk lokal atau Environment Variables di Vercel.');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || undefined,
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
