import { NextRequest, NextResponse } from 'next/server';
import { resolveSpotify } from '@/lib/spotify-resolvers';
import { getPlatformFromUrl, maskIP } from '@/lib/utils';
import { getDownloadsCollection } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    const spotifyUrl = url.trim();
    const platform = getPlatformFromUrl(spotifyUrl);

    if (platform !== 'spotify') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only Spotify links are supported. Paste a link like https://open.spotify.com/track/...',
        },
        { status: 400 }
      );
    }

    const result = await resolveSpotify(spotifyUrl);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to resolve that Spotify link' },
        { status: 502 }
      );
    }

    const clientIP =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';

    try {
      const downloads = await getDownloadsCollection();
      await downloads.insertOne({
        platform,
        originalUrl: spotifyUrl,
        ip: clientIP,
        ipMasked: maskIP(clientIP),
        title: result.title ?? 'Unknown',
        thumbnail: result.thumbnail ?? '',
        duration: result.duration ?? 0,
        author: result.artist ?? 'Unknown artist',
        success: true,
        upstream: result.upstream ?? 'spotify-oembed',
        downloadOffered: result.downloads.length > 0,
        createdAt: new Date(),
      });
    } catch (dbError) {
      console.error('Failed to log resolve:', dbError);
    }

    return NextResponse.json({
      success: true,
      title: result.title,
      author: result.artist,
      album: result.album,
      thumbnail: result.thumbnail,
      duration: result.duration,
      downloads: result.downloads,
      audio: result.audio,
      upstream: result.upstream,
      platform,
      youtubeMusicUrl: result.youtubeMusicUrl,
      spotifyUrl: result.spotifyUrl,
      note: result.note,
    });
  } catch (error: any) {
    console.error('Resolve API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Resolve failed' },
      { status: 500 }
    );
  }
}
