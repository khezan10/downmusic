/**
 * Client-side YouTube audio extractor
 * 
 * This runs in the browser to bypass server IP restrictions on YouTube.
 * Extracts audio streams directly from YouTube and downloads them to the user's device.
 * 
 * No server-side code needed - all fetch happens from the user's browser.
 */

export interface AudioStream {
  url: string;
  quality: string;
  bitrate: number;
  mimeType: string;
  size?: number;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  audioStreams: AudioStream[];
}

/**
 * Extract video ID from YouTube Music search results
 */
export async function searchYouTubeMusic(query: string): Promise<string | null> {
  try {
    const response = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20241023.00.00',
            hl: 'en',
            gl: 'US'
          }
        },
        query: query
      })
    });

    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Navigate to find videoId
    const findVideoId = (obj: any): string | null => {
      if (typeof obj !== 'object' || !obj) return null;
      
      if (obj.musicResponsiveListItemRenderer) {
        const item = obj.musicResponsiveListItemRenderer;
        const nav = item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
        const vid = nav?.watchEndpoint?.videoId;
        if (vid) return vid;
      }
      
      for (const key of Object.keys(obj)) {
        const result = findVideoId(obj[key]);
        if (result) return result;
      }
      
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const result = findVideoId(item);
          if (result) return result;
        }
      }
      
      return null;
    };

    return findVideoId(data);
  } catch (error) {
    console.error('YouTube Music search error:', error);
    return null;
  }
}

/**
 * Get audio streams from a YouTube video using browser fetch
 * This uses the YouTube IFrame API approach to get stream info
 */
export async function getAudioStreams(videoId: string): Promise<AudioStream[]> {
  try {
    // Method 1: Try Invidious API (public instances)
    const invidiousInstances = [
      'https://vid.puffyan.us',
      'https://invidious.private.coffee',
      'https://invidious.fdn.fr'
    ];

    for (const instance of invidiousInstances) {
      try {
        const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const audioStreams = (data.adaptiveFormats || [])
          .filter((f: any) => f.type?.includes('audio'))
          .map((f: any) => ({
            url: f.url,
            quality: f.qualityLabel || 'unknown',
            bitrate: f.bitrate || 0,
            mimeType: f.type?.split(';')[0] || 'audio/mp4',
            size: f.contentLength ? parseInt(f.contentLength) : undefined
          }))
          .sort((a: AudioStream, b: AudioStream) => b.bitrate - a.bitrate);

        if (audioStreams.length > 0) {
          return audioStreams;
        }
      } catch {
        continue;
      }
    }

    // Method 2: Try Piped API
    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.reallyaweso.me'
    ];

    for (const instance of pipedInstances) {
      try {
        const response = await fetch(`${instance}/streams/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const audioStreams = (data.audioStreams || [])
          .map((s: any) => ({
            url: s.url,
            quality: s.quality || 'unknown',
            bitrate: parseInt(s.quality) || 128000,
            mimeType: s.mimeType?.split(';')[0] || 'audio/mp4',
            size: s.contentLength ? parseInt(s.contentLength) : undefined
          }))
          .sort((a: AudioStream, b: AudioStream) => b.bitrate - a.bitrate);

        if (audioStreams.length > 0) {
          return audioStreams;
        }
      } catch {
        continue;
      }
    }

    return [];
  } catch (error) {
    console.error('Audio stream extraction error:', error);
    return [];
  }
}

/**
 * Download audio from URL directly to user's device
 */
export async function downloadAudio(
  url: string,
  filename: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<boolean> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength) : 0;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No reader available');
    }

    const chunks: any[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      if (onProgress && total > 0) {
        onProgress(loaded, total);
      }
    }

    // Create blob and download
    const blob = new Blob(chunks);
    const blobUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    
    return true;
  } catch (error) {
    console.error('Download error:', error);
    return false;
  }
}

/**
 * Full extraction flow: Spotify track -> YouTube Music search -> Audio stream -> Download
 */
export async function extractAndDownload(
  trackTitle: string,
  artistName: string,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    onStatus?.('Searching YouTube Music...');
    
    const query = `${trackTitle} ${artistName}`;
    const videoId = await searchYouTubeMusic(query);
    
    if (!videoId) {
      return { success: false, error: 'Could not find matching video on YouTube Music' };
    }

    onStatus?.('Extracting audio streams...');
    
    const streams = await getAudioStreams(videoId);
    
    if (streams.length === 0) {
      return { success: false, error: 'No audio streams available for this video' };
    }

    onStatus?.('Downloading audio...');
    
    const bestStream = streams[0]; // Highest bitrate
    const filename = `${trackTitle} - ${artistName}.m4a`.replace(/[^a-zA-Z0-9.\- ]/g, '_');
    
    const success = await downloadAudio(bestStream.url, filename, (loaded, total) => {
      const percent = Math.round((loaded / total) * 100);
      onStatus?.(`Downloading: ${percent}%`);
    });

    return { success };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}
