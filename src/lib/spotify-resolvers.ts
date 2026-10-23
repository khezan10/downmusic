/**
 * Spotify resolver — only services verified alive.
 *
 * VERIFIED LIVE (2026-10-23, from a datacenter IP):
 *   open.spotify.com/oembed              -> 200 (title + cover)
 *   api.deezer.com/search                -> 200 (artist, album, cover, duration, rank)
 *   itunes.apple.com/search              -> 200 (fallback metadata)
 *   music.youtube.com/youtubei/v1/search -> 200 (audio match search)
 *
 * VERIFIED DEAD / BLOCKED (do NOT re-add without testing first):
 *   api.spotidown.app            -> no DNS / HTTP 000
 *   api.spotimate.xyz            -> no DNS / HTTP 000
 *   api.spotisaver.net           -> HTTP 000
 *   spotisaver.net/api           -> 403 (Cloudflare)
 *   spotdown.org/api/download    -> 404
 *   api.cobalt.tools             -> 401 error.api.auth.jwt.missing
 *   youtubei/v1/player (ANDROID) -> playabilityStatus null, 0 adaptiveFormats
 *   pipedapi.* stream URLs       -> 401 (LBRY) / 502 (360p)
 *
 * CONSEQUENCE: there is no free, anonymous, serverless-compatible audio source.
 * A download is only offered when an external resolver is configured via env:
 *   AUDIO_RESOLVER_URL  e.g. https://my-resolver.example/audio?url={url}
 *   AUDIO_RESOLVER_KEY  optional bearer token
 * Without it the API returns metadata plus a direct YouTube Music link instead
 * of inventing a download URL.
 */

export interface DownloadOption {
  quality: string;
  format: string;
  url: string;
}

export interface SpotifyResolveResult {
  success: boolean;
  title?: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
  downloads: DownloadOption[];
  audio?: { title: string; url: string };
  upstream?: string;
  note?: string;
  youtubeMusicUrl?: string;
  spotifyUrl?: string;
  error?: string;
}

interface SpotifyEmbed {
  title?: string;
  thumbnail_url?: string;
}

interface ItunesTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
}

interface DeezerTrack {
  title?: string;
  duration?: number;
  rank?: number;
  artist?: { name?: string };
  album?: { title?: string; cover_xl?: string; cover_big?: string };
}

interface TrackMeta {
  artist?: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
  source: 'deezer' | 'itunes';
}

interface YTMusicHit {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function parseSpotifyUrl(
  url: string
): { type: 'track' | 'album' | 'playlist'; id: string } | null {
  const m = url.match(/spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})/);
  if (m) return { type: m[1] as 'track' | 'album' | 'playlist', id: m[2] };

  const uri = url.match(/^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/);
  if (uri) return { type: uri[1] as 'track' | 'album' | 'playlist', id: uri[2] };

  return null;
}

async function fetchOEmbed(url: string): Promise<SpotifyEmbed | null> {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SpotifyEmbed;
  } catch {
    return null;
  }
}

async function fetchDeezer(title: string): Promise<TrackMeta | null> {
  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(title)}&limit=10`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { data?: DeezerTrack[] };
    const results = data.data ?? [];
    if (results.length === 0) return null;

    // Several recordings share a title (covers, tributes, remasters). Deezer
    // exposes a popularity `rank`, so an exact title match with the highest
    // rank reliably identifies the canonical recording.
    const target = title.toLowerCase().trim();
    const exact = results.filter((t) => (t.title ?? '').toLowerCase().trim() === target);
    const pool = exact.length > 0 ? exact : results;
    const best = pool.reduce((a, b) => ((b.rank ?? 0) > (a.rank ?? 0) ? b : a));

    return {
      artist: best.artist?.name?.trim(),
      album: best.album?.title?.trim(),
      thumbnail: best.album?.cover_xl ?? best.album?.cover_big,
      duration: best.duration,
      source: 'deezer',
    };
  } catch {
    return null;
  }
}

async function fetchItunes(title: string): Promise<TrackMeta | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=song&limit=10&country=US`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: ItunesTrack[] };
    const results = data.results ?? [];
    if (results.length === 0) return null;

    const target = title.toLowerCase().trim();
    const exact = results.find((r) => (r.trackName ?? '').toLowerCase().trim() === target);
    const best = exact ?? results[0];

    return {
      artist: best.artistName?.trim(),
      album: best.collectionName?.trim(),
      thumbnail: best.artworkUrl100?.replace('100x100bb', '600x600bb'),
      duration: best.trackTimeMillis ? Math.round(best.trackTimeMillis / 1000) : undefined,
      source: 'itunes',
    };
  } catch {
    return null;
  }
}

/** Deezer first (has a popularity rank), iTunes as fallback. */
async function fetchMetadata(title: string): Promise<TrackMeta | null> {
  return (await fetchDeezer(title)) ?? (await fetchItunes(title));
}

async function searchYTMusic(query: string): Promise<YTMusicHit[]> {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const data: any = await res.json();
    const sections =
      data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
        ?.sectionListRenderer?.contents ?? [];

    // YouTube Music nests song rows differently per renderer
    // (musicShelfRenderer vs itemSectionRenderer), so collect every
    // musicResponsiveListItemRenderer by walking the tree instead of
    // hard-coding one path.
    const renderers: any[] = [];
    const collect = (node: any, depth: number) => {
      if (!node || depth > 12 || renderers.length > 40) return;
      if (Array.isArray(node)) {
        for (const child of node) collect(child, depth + 1);
        return;
      }
      if (typeof node !== 'object') return;
      const item = node.musicResponsiveListItemRenderer;
      if (item) renderers.push(item);
      for (const value of Object.values(node)) collect(value, depth + 1);
    };
    collect(sections, 0);

    const hits: YTMusicHit[] = [];
    for (const r of renderers) {
      const cols = r.flexColumns ?? [];
      const title: string = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ?? '';
      const subRuns: any[] =
        cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
      const artist: string = subRuns
        .map((run: any) => run?.text ?? '')
        .filter(Boolean)
        .join(' ')
        .trim();
      const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
      const thumbnail: string = thumbs[thumbs.length - 1]?.url ?? '';
      const durText: string =
        r?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ?? '';

      // videoId lives on the title run's watchEndpoint (fallbacks: overlay, menu)
      const videoId: string | undefined =
        cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint
          ?.watchEndpoint?.videoId ??
        r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId ??
        r?.menu?.menuRenderer?.items?.[0]?.menuNavigationItemRenderer?.navigationEndpoint
          ?.watchEndpoint?.videoId;

      if (videoId && title) {
        hits.push({ videoId, title, artist, duration: parseDuration(durText), thumbnail });
      }
    }
    return hits.slice(0, 8);
  } catch {
    return [];
  }
}

function parseDuration(text: string): number {
  const p = text.split(':').map(Number);
  if (p.length === 2 && p.every((n) => !Number.isNaN(n))) return p[0] * 60 + p[1];
  if (p.length === 3 && p.every((n) => !Number.isNaN(n))) return p[0] * 3600 + p[1] * 60 + p[2];
  return 0;
}

function bestHit(hits: YTMusicHit[], title: string, artist?: string): YTMusicHit | null {
  if (hits.length === 0) return null;

  const t = title.toLowerCase();
  const a = (artist ?? '').toLowerCase();

  let best = hits[0];
  let bestScore = -1;

  for (const h of hits) {
    let score = 0;
    if (h.title.toLowerCase().includes(t)) score += 3;
    if (a && h.artist.toLowerCase().includes(a)) score += 3;
    if (!/remix|live|cover|karaoke|instrumental/i.test(h.title)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }

  return best;
}

/** Optional external audio resolver. Returns a direct audio URL, or null. */
async function resolveAudioExternally(targetUrl: string): Promise<string | null> {
  const template = process.env.AUDIO_RESOLVER_URL;
  if (!template) return null;

  try {
    const endpoint = template.includes('{url}')
      ? template.replace('{url}', encodeURIComponent(targetUrl))
      : `${template}${template.includes('?') ? '&' : '?'}url=${encodeURIComponent(targetUrl)}`;

    const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' };
    if (process.env.AUDIO_RESOLVER_KEY) {
      headers.Authorization = `Bearer ${process.env.AUDIO_RESOLVER_KEY}`;
    }

    const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;

    const data: any = await res.json();
    const url = data?.url ?? data?.downloadUrl ?? data?.link ?? data?.data?.url;
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

export async function resolveSpotify(url: string): Promise<SpotifyResolveResult> {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) {
    return {
      success: false,
      downloads: [],
      error: 'Not a valid Spotify track/album/playlist URL.',
    };
  }

  const oembed = await fetchOEmbed(url);
  if (!oembed?.title) {
    return {
      success: false,
      downloads: [],
      error: 'Spotify did not return metadata for that link.',
    };
  }

  const title = oembed.title.trim();
  const meta = await fetchMetadata(title);

  const artist = meta?.artist;
  const album = meta?.album;
  const thumbnail = meta?.thumbnail ?? oembed.thumbnail_url;
  const duration = meta?.duration ?? 0;

  const query = [artist, title].filter(Boolean).join(' ');
  const hits = await searchYTMusic(query);
  const hit = bestHit(hits, title, artist);
  const youtubeMusicUrl = hit ? `https://music.youtube.com/watch?v=${hit.videoId}` : undefined;

  let audioUrl = hit ? await resolveAudioExternally(youtubeMusicUrl!) : null;
  if (!audioUrl) audioUrl = await resolveAudioExternally(url);

  const downloads: DownloadOption[] = audioUrl
    ? [{ quality: 'Audio', format: 'mp3', url: audioUrl }]
    : [];

  const upstream = hit
    ? meta
      ? `${meta.source}+youtube-music`
      : 'youtube-music'
    : 'spotify-oembed';

  return {
    success: true,
    title,
    artist: artist ?? 'Unknown artist',
    album,
    thumbnail,
    duration: duration || hit?.duration || 0,
    downloads,
    audio: audioUrl ? { title: `${artist ?? 'Unknown'} - ${title}`, url: audioUrl } : undefined,
    upstream,
    youtubeMusicUrl,
    spotifyUrl: url,
    note: audioUrl
      ? undefined
      : 'Metadata resolved. No audio source is configured on this deployment — set AUDIO_RESOLVER_URL to enable downloads. Free public Spotify converters (spotidown/spotisaver/spotmate) are Cloudflare-blocked from server IPs and are not used.',
  };
}

/** Alias kept so existing imports keep working. */
export const resolveSpotifyWithMetadata = resolveSpotify;
