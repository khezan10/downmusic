import { NextRequest, NextResponse } from 'next/server';
import { getDownloadsCollection } from '@/lib/mongodb';

// Reads query params and the DB, so it can never be prerendered.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 50);
    const skip = (page - 1) * limit;
    
    const downloads = await getDownloadsCollection();
    
    const [items, total] = await Promise.all([
      downloads
        .find({ success: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .project({
          _id: 0,
          platform: 1,
          originalUrl: 1,
          ipMasked: 1,
          title: 1,
          thumbnail: 1,
          duration: 1,
          author: 1,
          upstream: 1,
          createdAt: 1,
        })
        .toArray(),
      downloads.countDocuments({ success: true }),
    ]);
    
    return NextResponse.json({
      success: true,
      downloads: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Recent API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch recent downloads' },
      { status: 500 }
    );
  }
}