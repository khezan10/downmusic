'use client'

import { useEffect } from 'react'

/** Error boundary in the site's own styling — not the default Next page. */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('page error:', error)
  }, [error])

  return (
    <main className="hero">
      <p className="eyebrow">500</p>
      <h1 className="title">SOMETHING BROKE_</h1>
      <p className="subtitle">
        The page hit an error. Reloading usually clears it; the resolver upstream is a third
        party and does go down from time to time.
      </p>
      <button type="button" className="download-btn download-btn--solid" onClick={reset}>
        TRY AGAIN
      </button>
    </main>
  )
}
