import { NextRequest, NextResponse } from 'next/server';
import { resolveSpotify, parseSpotifyUrl } from '@/lib/spotify-resolvers';
import { getPlatformFromUrl } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 });
    }

    const trimmed = query.trim();
    const platform = getPlatformFromUrl(trimmed);

    if (platform !== 'spotify' || !parseSpotifyUrl(trimmed)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Paste a Spotify track link, e.g. https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        },
        { status: 400 }
      );
    }

    const result = await resolveSpotify(trimmed);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to resolve that Spotify link' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      isSpotify: true,
      results: [
        {
          title: result.title,
          author: result.artist,
          artist: result.artist,
          album: result.album,
          thumbnail: result.thumbnail,
          duration: result.duration,
          downloads: result.downloads,
          upstream: result.upstream,
          youtubeMusicUrl: result.youtubeMusicUrl,
          note: result.note,
          url: trimmed,
          isSpotify: true,
        },
      ],
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}
