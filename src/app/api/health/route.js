import { NextResponse } from 'next/server'
import { getDownloadsCollection, isDatabaseConfigured } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const startedAt = Date.now()

/**
 * GET /api/health — cheap and dependency-free.
 *
 * Deliberately does NOT probe the converter: a scheduled watcher should be able
 * to tell "the app is up" from "a third party is down", and a redeploy never
 * fixes a third-party outage.
 */
export async function GET() {
  let database = 'unconfigured'
  let records = null

  if (isDatabaseConfigured()) {
    try {
      const collection = await getDownloadsCollection()
      if (collection) {
        records = await collection.estimatedDocumentCount()
        database = 'ok'
      }
    } catch (error) {
      database = `error: ${error?.message || 'unknown'}`
    }
  }

  return NextResponse.json(
    {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database,
      records,
      node: process.version,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
