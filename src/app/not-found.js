import Link from 'next/link'

export const metadata = {
  title: 'Not found — DownMusic',
}

export default function NotFound() {
  return (
    <main className="hero">
      <p className="eyebrow">404</p>
      <h1 className="title">LINK NOT FOUND_</h1>
      <p className="subtitle">
        That page does not exist. Paste a Spotify link on the home page instead.
      </p>
      <Link className="download-btn download-btn--solid" href="/">
        BACK TO DOWNMUSIC
      </Link>
    </main>
  )
}
