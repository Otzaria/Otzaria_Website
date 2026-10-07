import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db'

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable')
}

// Initialize global cache if not exists
let cached = global.mongoose
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

/**
 * Connect to MongoDB with connection pooling and caching
 * @returns {Promise<Object>} Mongoose connection
 */
export function mongoConnectionOptions(env = process.env) {
  // Connection establishment and server selection have separate deadlines.
  // Preserve the production driver's 30s selection budget; CI uses 5s.
  const selectionTimeout = Number(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 30000)
  if (!Number.isInteger(selectionTimeout) || selectionTimeout < 100 || selectionTimeout > 120000) {
    throw new Error('MONGODB_SERVER_SELECTION_TIMEOUT_MS must be an integer between 100 and 120000')
  }
  return {
    bufferCommands: false, maxPoolSize: 10, minPoolSize: 5,
    connectTimeoutMS: 5000, socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: selectionTimeout,
  }
}

async function connectDB() {
  // Return existing connection if available
  if (cached.conn) {
    return cached.conn
  }

  // Create new connection promise if not exists
  if (!cached.promise) {
    const connectOptions = mongoConnectionOptions()

    cached.promise = mongoose
      .connect(MONGODB_URI, connectOptions)
      .then((mongoose) => {
        return mongoose
      })
      .catch((error) => {
        console.error('❌ MongoDB Connection Error:', error.message)
        cached.promise = null // Reset promise on error
        throw error
      })
  }

  try {
    cached.conn = await cached.promise
  } catch (error) {
    cached.promise = null // Reset promise on error
    throw new Error(`Database connection failed: ${error.message}`)
  }

  return cached.conn
}

export default connectDB
