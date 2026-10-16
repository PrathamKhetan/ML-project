/**
 * AuditAI - MongoDB Connection Manager
 * Connects to MongoDB Atlas using the MONGODB_URI environment variable.
 */

const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/auditai';

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // Timeout after 5s if Atlas is unreachable
    });

    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`⚠️ MongoDB Connection Warning: ${error.message}`);
    console.warn(`👉 Please set a valid MONGODB_URI in your .env file (e.g. from MongoDB Atlas).`);
    return null;
  }
}

function getIsConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  getIsConnected
};
