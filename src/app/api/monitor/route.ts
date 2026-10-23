import { NextRequest, NextResponse } from 'next/server';
import { getDownloadsCollection } from '@/lib/mongodb';

/**
 * Upstream monitor — probes the services this app actually calls.
 * Every probe below was verified reachable when the resolver was written.
 * Nothing here is a placeholder: an entry only exists if resolveSpotify()
 * depends on it.
 */

interface Probe {
  id: string;
  name: string;
  host: string;
  role: 'primary' | 'fallback';
  scope: string[];
  run: () => Promise<Response>;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PROBES: Probe[] = [
  {
    id: 'spotify-oembed',
    name: 'Spotify oEmbed',
    host: 'open.spotify.com',
    role: 'primary',
    scope: ['spotify'],
    run: () =>
      fetch(
        'https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F4cOdK2wGLETKBW3PvgPWqT',
        {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        }
      ),
  },
  {
    id: 'itunes-search',
    name: 'iTunes Search',
    host: 'itunes.apple.com',
    role: 'fallback',
    scope: ['metadata'],
    run: () =>
      fetch('https://itunes.apple.com/search?term=test&entity=song&limit=1&country=US', {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }),
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    host: 'music.youtube.com',
    role: 'fallback',
    scope: ['audio-match'],
    run: () =>
      fetch('https://music.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
          Origin: 'https://music.youtube.com',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00' } },
          query: 'test',
        }),
        signal: AbortSignal.timeout(10000),
      }),
  },
];

export async function GET(_request: NextRequest) {
  try {
    const results = await Promise.all(
      PROBES.map(async (p) => {
        const started = Date.now();
        try {
          const res = await p.run();
          return { probe: p, online: res.ok, latency: Date.now() - started };
        } catch {
          return { probe: p, online: false, latency: Date.now() - started };
        }
      })
    );

    // Delivery counts per upstream, when the DB is reachable.
    const upstreamCounts: Record<string, number> = {};
    let totalRecent = 0;
    try {
      const downloads = await getDownloadsCollection();
      const recent = await downloads
        .find({ success: true, upstream: { $exists: true } })
        .sort({ createdAt: -1 })
        .limit(50)
        .project({ upstream: 1 })
        .toArray();
      totalRecent = recent.length;
      for (const d of recent) {
        if (d.upstream) upstreamCounts[d.upstream] = (upstreamCounts[d.upstream] || 0) + 1;
      }
    } catch (dbError) {
      console.error('Monitor: DB unavailable', dbError);
    }

    const upstreams = results.map(({ probe, online, latency }) => {
      const serving = upstreamCounts[probe.id] || 0;
      return {
        id: probe.id,
        role: probe.role,
        name: probe.name,
        host: probe.host,
        scope: probe.scope,
        status: online ? ('online' as const) : ('offline' as const),
        latency,
        serving,
        servingPct: totalRecent > 0 ? Math.round((serving / totalRecent) * 100) : 0,
      };
    });

    return NextResponse.json({
      success: true,
      upstreams,
      summary: {
        online: upstreams.filter((u) => u.status === 'online').length,
        total: upstreams.length,
        currentPrimary:
          upstreams.find((u) => u.role === 'primary' && u.status === 'online')?.name ?? 'None',
        audioResolverConfigured: Boolean(process.env.AUDIO_RESOLVER_URL),
        lastChecked: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Monitor API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to probe upstreams' },
      { status: 500 }
    );
  }
}
