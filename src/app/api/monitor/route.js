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
    serves: Boolean(u.serves),
    detail: u.detail,
    status: u.status,
    ms: u.ms,
    // Only an upstream that hands over file bytes can have a traffic share;
    // counting the metadata and matching steps as "serving" produced a
    // meaningless 94/6 split.
    share:
      u.serves && sample > 0 && share[u.id] != null
        ? Math.round((share[u.id] / sample) * 100)
        : null,
  }))

  // What a visitor is actually downloading through right now: the converter
  // produces the file, the Worker carries it, so both must be up.
  const converter = upstreams.find((u) => u.id === 'savefrom')
  const transport = upstreams.find((u) => u.id === 'media-proxy')
  const active =
    converter?.status === 'ok' && transport?.status === 'ok'
      ? { id: converter.id, label: `${converter.label} → ${transport.label}` }
      : null

  return NextResponse.json({
    success: true,
    upstreams,
    healthy: probe.healthy,
    total: probe.total,
    probeMs: probe.ms,
    sample,
    active,
    registered: UPSTREAMS.length,
  })
}
