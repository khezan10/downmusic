import { NextRequest, NextResponse } from 'next/server';

/**
 * Download proxy.
 *
 * This route streams a file from an upstream CDN to the browser. It is NOT an
 * open proxy: only hosts listed in DOWNLOAD_ALLOWED_HOSTS are proxied, and
 * private/loopback addresses are always rejected. Without that variable every
 * request is refused, because no audio source is configured by default.
 */

function allowedHosts(): string[] {
  return (process.env.DOWNLOAD_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  if (h === '::1' || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download';
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  const filename = safeFilename(request.nextUrl.searchParams.get('filename') || 'download');

  if (!raw) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'url is not a valid absolute URL' }, { status: 400 });
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return NextResponse.json({ error: 'only http(s) URLs can be proxied' }, { status: 400 });
  }

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: 'private hosts are not allowed' }, { status: 403 });
  }

  const hosts = allowedHosts();
  if (hosts.length === 0) {
    return NextResponse.json(
      {
        error:
          'Download proxy is disabled. Set DOWNLOAD_ALLOWED_HOSTS to the CDN host(s) that serve your audio, and AUDIO_RESOLVER_URL to produce links.',
      },
      { status: 503 }
    );
  }

  const host = target.hostname.toLowerCase();
  const permitted = hosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!permitted) {
    return NextResponse.json(
      { error: `host ${host} is not in DOWNLOAD_ALLOWED_HOSTS` },
      { status: 403 }
    );
  }

  try {
    const range = request.headers.get('range');
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (range) upstreamHeaders.Range = range;

    const response = await fetch(target, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `upstream returned ${response.status}` },
        { status: response.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream'
    );
    responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);

    const contentLength = response.headers.get('content-length');
    const acceptRanges = response.headers.get('accept-ranges');
    const contentRange = response.headers.get('content-range');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Download proxy error:', error);
    return NextResponse.json({ error: 'download failed' }, { status: 502 });
  }
}
