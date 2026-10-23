export interface SpotifyMetadata {
  type: 'track' | 'album' | 'playlist';
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  cover?: string;
  tracks?: SpotifyMetadata[];
}

async function fetchSpotifyOEmbed(url: string): Promise<any> {
  const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error('Failed to fetch Spotify oEmbed');
  return response.json();
}

async function fetchSpotifyMetadata(url: string): Promise<SpotifyMetadata | null> {
  try {
    const oembed = await fetchSpotifyOEmbed(url);
    
    const match = url.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!match) return null;
    
    const type = match[1] as 'track' | 'album' | 'playlist';
    const id = match[2];
    
    return {
      type,
      id,
      title: oembed.title || 'Unknown',
      artist: oembed.author_name || 'Unknown',
      cover: oembed.thumbnail_url,
    };
  } catch {
    return null;
  }
}

export async function getSpotifyMetadata(url: string): Promise<SpotifyMetadata | null> {
  return fetchSpotifyMetadata(url);
}

export function buildSearchQuery(metadata: SpotifyMetadata): string {
  if (metadata.type === 'track') {
    return `${metadata.artist} ${metadata.title}`;
  }
  return `${metadata.artist} ${metadata.title}`;
}

export function isSpotifyUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes('spotify.com');
  } catch {
    return false;
  }
}

export function extractSpotifyId(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
  try {
    const match = url.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (match) {
      return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}