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

export function getPlatformFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('tiktok.com') || hostname.includes('vm.tiktok.com')) return 'tiktok';
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) return 'facebook';
    if (hostname.includes('threads.net')) return 'threads';
    if (hostname.includes('twitter.com') || hostname.includes('x.com') || hostname === 't.co') return 'twitter';
    if (hostname.includes('pinterest.com') || hostname.includes('pin.it')) return 'pinterest';
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be') || hostname.includes('music.youtube.com')) return 'youtube';
    if (hostname.includes('spotify.com') || hostname.includes('open.spotify.com')) return 'spotify';
    return 'unknown';
  } catch {
    return 'unknown';
  }
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
    const u = new URL(url);
    const path = u.pathname;
    const match = path.match(/^\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (match) {
      return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}