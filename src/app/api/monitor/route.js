import { NextResponse } from 'next/server'
import { probeAllUpstreams, UPSTREAMS } from '@/lib/upstreams'
import { getDownloadsCollection } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/monitor
 *
 * Three separate facts, never conflated:
 *   role     — static config (who is primary, who is fallback)
 *   status   — probed right now, with latency
 *   serving  — share of the last N downloads, read from the database
 */
export async function GET() {
  const probe = await probeAllUpstreams()

  let share = {}
  let sample = 0
  let recent = []

  try {
    const collection = await getDownloadsCollection()
    if (collection) {
      recent = await collection
        .find({ upstream: { $exists: true, $ne: null } })
        .sort({ createdAt: -1 })
        .limit(50)
        .project({ upstream: 1 })
        .toArray()

      sample = recent.length
      for (const doc of recent) {
        const key = String(doc.upstream).split('+')[0]
        share[key] = (share[key] ?? 0) + 1
      }
    }
  } catch {
    // A monitor that cannot read the DB still reports live status.
  }

  const upstreams = probe.upstreams.map((u) => ({
    id: u.id,
    label: u.label,
    host: u.host,
    role: u.role,
    scope: u.scope,
    detail: u.detail,
    status: u.status,
    ms: u.ms,
    share: sample > 0 && share[u.id] != null ? Math.round((share[u.id] / sample) * 100) : null,
  }))

  // The converter is the only upstream that produces files, so it is the one
  // that is "serving" when it is healthy.
  const converter = upstreams.find((u) => u.id === 'savefrom')
  const active = converter?.status === 'ok' ? converter : null

  return NextResponse.json({
    success: true,
    upstreams,
    healthy: probe.healthy,
    total: probe.total,
    probeMs: probe.ms,
    sample,
    active: active ? { id: active.id, label: active.label } : null,
    registered: UPSTREAMS.length,
  })
}
