export interface YTMusicResult {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  thumbnail: string;
  views?: number;
}

async function searchYouTubeMusicInnerTube(query: string): Promise<YTMusicResult[]> {
  const payload = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240101.01.00',
        hl: 'en',
        gl: 'US',
      },
    },
    query,
  };
  
  const response = await fetch('https://music.youtube.com/youtubei/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/',
    },
    body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  if (!text) throw new Error('Empty response from YouTube Music');
  
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON from YouTube Music: ' + text.slice(0, 200));
  }
  
  const results: YTMusicResult[] = [];
  
  const contents = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
  if (!contents) return results;
  
  for (const section of contents) {
    const items = section?.musicShelfRenderer?.contents || section?.itemSectionRenderer?.contents;
    if (!items) continue;
    
    for (const item of items) {
      const renderer = item?.musicResponsiveListItemRenderer || item?.musicTwoRowItemRenderer;
      if (!renderer) continue;
      
      const flexColumns = renderer?.flexColumns;
      if (!flexColumns) continue;
      
      const title = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
      const artist = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
      
      const navigation = renderer?.navigationEndpoint?.watchEndpoint;
      const videoId = navigation?.videoId;
      
      const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      const thumbnail = thumbnails?.[thumbnails.length - 1]?.url || '';
      
      const durationText = renderer?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || '0:00';
      const duration = parseDuration(durationText);
      
      if (videoId && title) {
        results.push({ videoId, title, artist, duration, thumbnail });
      }
    }
  }
  
  return results.slice(0, 10);
}

function parseDuration(text: string): number {
  const parts = text.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export async function searchYouTubeMusic(query: string): Promise<YTMusicResult[]> {
  try {
    return await searchYouTubeMusicInnerTube(query);
  } catch (error) {
    console.error('YouTube Music search failed:', error);
    return [];
  }
}

export async function findBestMatch(query: string, spotifyMeta?: { title: string; artist: string; duration?: number }): Promise<YTMusicResult | null> {
  const results = await searchYouTubeMusic(query);
  if (results.length === 0) return null;
  
  if (!spotifyMeta) return results[0];
  
  let bestMatch = results[0];
  let bestScore = 0;
  
  for (const result of results) {
    let score = 0;
    const titleLower = result.title.toLowerCase();
    const artistLower = result.artist.toLowerCase();
    const targetTitle = spotifyMeta.title.toLowerCase();
    const targetArtist = spotifyMeta.artist.toLowerCase();
    
    if (titleLower.includes(targetTitle)) score += 3;
    if (artistLower.includes(targetArtist)) score += 3;
    if (spotifyMeta.duration && Math.abs(result.duration - spotifyMeta.duration) < 5) score += 2;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }
  
  return bestMatch;
}

export function getYTMusicUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}