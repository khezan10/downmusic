import { MongoClient, Db, Collection } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'downmusic';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Configure it in the environment (see .env.example).');
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    await cachedClient.connect();
  }

  cachedDb = cachedClient.db(DB_NAME);
  return cachedDb;
}

export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}

export interface DownloadRecord {
  _id?: any;
  platform: string;
  originalUrl: string;
  ip: string;
  ipMasked: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  author?: string;
  success: boolean;
  upstream: string;
  downloadOffered?: boolean;
  format?: string;
  quality?: string;
  createdAt: Date;
}

export interface UpstreamStatus {
  id: string;
  role: 'primary' | 'fallback';
  scope: string | string[];
  status: 'online' | 'offline';
  latency?: number;
  servingPct?: number;
  lastChecked: Date;
}

export async function getDownloadsCollection(): Promise<Collection<DownloadRecord>> {
  const db = await getDb();
  return db.collection<DownloadRecord>('downloads');
}

export async function getUpstreamsCollection(): Promise<Collection<UpstreamStatus>> {
  const db = await getDb();
  return db.collection<UpstreamStatus>('upstreams');
}

export function maskIP(ip: string): string {
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.***` : ip;
}

export function getClientIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIP = headers.get('x-real-ip');
  if (realIP) return realIP;
  return '0.0.0.0';
}

export async function createIndexes(): Promise<void> {
  const db = await getDb();
  const downloads = db.collection<DownloadRecord>('downloads');
  await downloads.createIndex({ createdAt: -1 });
  await downloads.createIndex({ platform: 1, createdAt: -1 });
  await downloads.createIndex({ upstream: 1 });
  await downloads.createIndex({ ip: 1 });
  
  // TTL index - auto delete after 90 days (7776000 seconds)
  await downloads.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
}

export async function cleanupOldDownloads(olderThanHours: number = 24): Promise<number> {
  const db = await getDb();
  const downloads = db.collection<DownloadRecord>('downloads');
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const result = await downloads.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount;
}

export async function cleanupAtMidnight(): Promise<void> {
  try {
    const deleted = await cleanupOldDownloads(1); // Keep only last 1 hour
    console.log(`[${new Date().toISOString()}] Midnight cleanup: deleted ${deleted} old download records`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Midnight cleanup failed:`, error);
  }
}