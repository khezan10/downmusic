import { NextResponse } from 'next/server'
import { getDownloadsCollection } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/recent — the public activity log. */
export async function GET(request) {
  const limit = Math.min(
    Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '12', 10) || 12),
    50
  )

  try {
    const collection = await getDownloadsCollection()
    if (!collection) {
      return NextResponse.json({ success: true, downloads: [], configured: false })
    }

    const items = await collection
      .find({ success: { $ne: false } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .project({
        _id: 0,
        kind: 1,
        title: 1,
        author: 1,
        thumbnail: 1,
        duration: 1,
        format: 1,
        ipMasked: 1,
        upstream: 1,
        hasAudio: 1,
        createdAt: 1,
      })
      .toArray()

    return NextResponse.json({ success: true, downloads: items, configured: true })
  } catch (error) {
    console.error('recent failed:', error)
    return NextResponse.json(
      { success: false, error: 'Could not read the activity log.', downloads: [] },
      { status: 500 }
    )
  }
}
