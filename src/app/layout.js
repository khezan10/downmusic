import './globals.css'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://downmusic.vercel.app'
const REPO_URL = 'https://github.com/khezan10/downmusic'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'DownMusic — Spotify track & playlist downloader',
  description:
    'Paste a Spotify track, album or playlist link and download the audio. No login, no Spotify API key, no Spotify account.',
  applicationName: 'DownMusic',
  keywords: [
    'spotify downloader',
    'spotify playlist downloader',
    'spotify album downloader',
    'download spotify songs',
    'spotify to mp3',
    'spotify to m4a',
  ],
  authors: [{ name: 'Khezan Amartya', url: REPO_URL }],
  creator: 'Khezan Amartya',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'DownMusic',
    title: 'DownMusic — Spotify track & playlist downloader',
    description:
      'Paste a Spotify track, album or playlist link and download the audio. No login, no API key.',
  },
  twitter: {
    card: 'summary',
    title: 'DownMusic — Spotify track & playlist downloader',
    description: 'Paste a Spotify link and download the audio. No login, no API key.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-16.svg" type="image/svg+xml" sizes="16x16" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="bg-grid" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
