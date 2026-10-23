/**
 * MongoDB access.
 *
 * Every function is guarded: Next.js imports route modules while collecting
 * page data during `next build`, so a module that throws on a missing
 * `MONGODB_URI` fails the BUILD, not just the request.
 */

import { MongoClient } from 'mongodb'

const URI = process.env.MONGODB_URI
const DB_NAME = process.env.MONGODB_DB || 'downmusic'

let cachedClient = null
let cachedDb = null

export function isDatabaseConfigured() {
  return Boolean(URI)
}

export async function getDb() {
  if (cachedDb) return cachedDb
  if (!URI) throw new Error('MONGODB_URI is not set')

  if (!cachedClient) {
    cachedClient = new MongoClient(URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    await cachedClient.connect()
  }
  cachedDb = cachedClient.db(DB_NAME)
  return cachedDb
}

/** Download records live in `downloads`. Returns null when unconfigured. */
export async function getDownloadsCollection() {
  if (!isDatabaseConfigured()) return null
  const db = await getDb()
  return db.collection('downloads')
}

/**
 * Record one resolve/download in the public activity log.
 * Never throws: a database problem must not break a working download.
 */
export async function logActivity(record) {
  try {
    const collection = await getDownloadsCollection()
    if (!collection) return false
    await collection.insertOne({ ...record, createdAt: new Date() })
    return true
  } catch (error) {
    console.error('activity log write failed:', error?.message || error)
    return false
  }
}

/** Delete records older than `hours`. Returns the number removed. */
export async function cleanupOldDownloads(hours = 24) {
  const collection = await getDownloadsCollection()
  if (!collection) return 0
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
  const result = await collection.deleteMany({ createdAt: { $lt: cutoff } })
  return result.deletedCount ?? 0
}

/** Indexes are created lazily; a failure is logged, never fatal. */
export async function ensureIndexes() {
  try {
    const collection = await getDownloadsCollection()
    if (!collection) return
    await collection.createIndex({ createdAt: -1 })
    await collection.createIndex({ upstream: 1 })
    await collection.createIndex({ kind: 1, createdAt: -1 })
  } catch (error) {
    console.error('index creation failed:', error?.message || error)
  }
}
