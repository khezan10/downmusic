import { NextResponse } from 'next/server'
import { cleanupOldDownloads } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Keep the public activity log short: it is a feed, not an archive. */
const RETENTION_HOURS = 24

/**
 * GET /api/cron/cleanup — called by Vercel Cron once a day.
 * Guarded by CRON_SECRET; Vercel sends it as `Authorization: Bearer …`.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get('authorization') || ''
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const deleted = await cleanupOldDownloads(RETENTION_HOURS)
    return NextResponse.json({
      success: true,
      deleted,
      retentionHours: RETENTION_HOURS,
      at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('cleanup failed:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'cleanup failed' },
      { status: 500 }
    )
  }
}
