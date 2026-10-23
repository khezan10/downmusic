import { NextRequest, NextResponse } from 'next/server';
import { cleanupAtMidnight } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    await cleanupAtMidnight();
    return NextResponse.json({ success: true, message: 'Midnight cleanup completed' });
  } catch (error: any) {
    console.error('Cron job failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}