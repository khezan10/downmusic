'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Typewriter from '@/components/Typewriter'
import IdleAnimations from '@/components/IdleAnimations'
import { downloadAsMp3 } from '@/lib/download-client'
import { formatDuration, timeAgo } from '@/lib/format'

// Entrance animation: fade + rise + deblur, staggered per element. Mirrors the
// Zanara landing page (.reveal / .in) but starts on mount instead of waiting for
// an IntersectionObserver, so nothing can get stuck invisible.
const REVEAL_STAGGER_MS = 90
const TITLE_TEXT = 'DOWNMUSIC'

const TAGLINES = [
  'download your playlist spotif*ck anything anywhere anytime',
  'Paste a track, an album or a playlist link — you get the audio file, not a preview page.',
  'Album and playlist links come back as a track list. Grab one track, or the whole list.',
  'No login, no Spotify API key, no cookies. Public links only.',
  'Every track is matched to its YouTube Music recording, then resolved to a real m4a.',
]

const PLATFORMS = [
  { label: 'Track', active: true },
  { label: 'Album', active: true },
  { label: 'Playlist', active: true },
  { label: 'Liked Songs', active: false },
  { label: 'Podcast', active: false },
]

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [track, setTrack] = useState(null)
  const [collection, setCollection] = useState(null)
  const [busy, setBusy] = useState(null) // 'single' | track index | 'all'
  const [progress, setProgress] = useState({}) // key -> percent|null
  const [done, setDone] = useState({}) // key -> true
  const [batch, setBatch] = useState(null) // { current, total, ok }
  const [recent, setRecent] = useState([])
  const [monitor, setMonitor] = useState(null)

  const titleRef = useRef(null)
  const eyebrowRef = useRef(null)
  const cardRef = useRef(null)

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/recent', { cache: 'no-store' })
      const data = await res.json()
      if (data?.success) setRecent(Array.isArray(data.downloads) ? data.downloads : [])
    } catch {
      /* the log is decoration; a failure must not break the page */
    }
  }, [])

  const loadMonitor = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor', { cache: 'no-store' })
      const data = await res.json()
      if (data?.success) setMonitor(data)
    } catch {
      /* same */
    }
  }, [])

  useEffect(() => {
    loadRecent()
    loadMonitor()
    const timer = setInterval(loadMonitor, 120000)
    return () => clearInterval(timer)
  }, [loadRecent, loadMonitor])

  // The entrance is a CSS animation (see globals.css); the only thing JS
  // contributes is the per-element stagger.
  const revealClass = 'reveal-item'
  const reveal = (index) => ({ style: { '--reveal-delay': `${index * REVEAL_STAGGER_MS}ms` } })

  const resetResult = () => {
    setTrack(null)
    setCollection(null)
    setProgress({})
    setDone({})
    setBatch(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const value = url.trim()
    if (!value) {
      setError('Please paste a Spotify link first.')
      return
    }
    if (!/spotify\.com|spotify:/i.test(value)) {
      setError('That is not a Spotify link. It should look like https://open.spotify.com/track/…')
      return
    }

    resetResult()
    setLoading(true)

    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) throw new Error(data.error || 'Could not resolve that link.')

      // The API reports the Spotify kind (track/album/playlist); what matters
      // here is whether a collection came back with it.
      if (data.collection) setCollection(data.collection)
      else if (data.track) setTrack(data.track)
      else throw new Error('The resolver returned an empty result.')

      loadRecent()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Resolve on demand: a collection row carries only a title/artist, and a
  // single track re-resolves when its CDN link has gone stale.
  const resolveAudio = async (meta, skip = 0) => {
    const res = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...meta, skip }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Resolve failed.')
    return data
  }

  /**
   * Resolve, then download and encode.
   *
   * A media link can be dead on arrival: the converter caches its results, and a
   * cached googlevideo host is sometimes gone. The proxy marks that failure
   * `retryable`, and the next candidate recording is requested instead of
   * showing the visitor an error they cannot act on.
   */
  const downloadTrackAudio = async (meta, filename, onStage) => {
    let lastError = null

    for (let skip = 0; skip < 3; skip += 1) {
      const data = await resolveAudio(meta, skip)
      const audio = data.track?.audio
      if (!audio) {
        throw new Error(data.track?.note || 'No audio stream was returned for this track.')
      }

      try {
        return await downloadAsMp3(audio.url, filename || audio.filename, {
          duration: data.track?.duration || meta?.duration || 0,
          fallbackUrl: audio.fallbackUrl || null,
          onStage,
        })
      } catch (error) {
        lastError = error
        // A dead CDN host, or a match whose runtime is wrong — both are worth
        // one more candidate recording.
        if (!error.retryable) throw error
      }
    }

    throw lastError || new Error('The audio could not be fetched.')
  }

  const runDownload = async (key, meta, filename) => {
    setBusy(key)
    setProgress((prev) => ({ ...prev, [key]: { stage: 'resolving', percent: null } }))
    try {
      const saved = await downloadTrackAudio(meta, filename, (stage) =>
        setProgress((prev) => ({ ...prev, [key]: stage }))
      )

      if (saved.format !== 'mp3') {
        setError(
          'This browser could not decode the stream, so the original AAC file was saved instead of an MP3.'
        )
      }

      setDone((prev) => ({ ...prev, [key]: true }))
      loadRecent()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(null)
      setProgress((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  // A single track result: the click transfers the bytes and encodes them. The
  // resolve happens again here so a stale media link can be replaced.
  const downloadResolved = async () => {
    if (!track?.audio) return
    setBusy('single')
    setProgress((prev) => ({ ...prev, single: { stage: 'fetching', percent: null } }))
    try {
      const saved = await downloadTrackAudio(
        {
          title: track.title,
          artist: track.artist,
          duration: track.duration,
          thumbnail: track.thumbnail || track.cover,
          spotifyUrl: track.spotifyUrl,
        },
        track.audio.filename,
        (stage) => setProgress((prev) => ({ ...prev, single: stage }))
      )

      if (saved.format !== 'mp3') {
        setError(
          'This browser could not decode the stream, so the original AAC file was saved instead of an MP3.'
        )
      }

      setDone((prev) => ({ ...prev, single: true }))
      loadRecent()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
      setProgress((prev) => {
        const next = { ...prev }
        delete next.single
        return next
      })
    }
  }

  const downloadRow = (row) =>
    runDownload(
      row.index,
      {
        title: row.title,
        artist: row.artist,
        thumbnail: collection?.cover,
        album: collection?.kind === 'album' ? collection.name : null,
        spotifyUrl: row.spotifyUrl,
        duration: row.duration,
      },
      // The row's own artist, not the playlist owner — "Spotify - Housewife.mp3"
      // is not a useful filename.
      `${row.artist && row.artist !== 'Unknown artist' ? `${row.artist} - ` : ''}${row.title}.mp3`
    )

  const downloadAll = async () => {
    if (!collection?.tracks?.length) return
    setError('')
    setBatch({ current: 0, total: collection.tracks.length, ok: 0 })

    let ok = 0
    for (let i = 0; i < collection.tracks.length; i += 1) {
      const row = collection.tracks[i]
      setBatch({ current: i + 1, total: collection.tracks.length, ok })
      // One track at a time: the converter is a third party, and a parallel
      // burst is how you get throttled.
      const success = await downloadRow(row)
      if (success) ok += 1
    }

    setBatch({ current: collection.tracks.length, total: collection.tracks.length, ok })
    setTimeout(() => setBatch(null), 6000)
  }

  const formatTime = (value) => timeAgo(value)
  const progressLabel = (key, idle) => {
    if (busy === key) {
      const state = progress[key]
      if (!state) return 'PREPARING…'
      if (state.stage === 'resolving') return 'RESOLVING…'
      if (state.stage === 'fetching') {
        return state.percent ? `FETCH ${state.percent}%` : 'FETCHING…'
      }
      if (state.stage === 'decoding') return 'DECODING…'
      if (state.stage === 'encoding') return `MP3 ${state.percent ?? 0}%`
      return 'WORKING…'
    }
    if (done[key]) return 'SAVED ✓'
    return idle
  }

  return (
    <main>
      <section className="hero">
        <p className={`eyebrow ${revealClass}`} {...reveal(0)} ref={eyebrowRef}>
          Spotify Audio Downloader
        </p>

        <h1 className={`title ${revealClass}`} {...reveal(1)} ref={titleRef}>
          <span className="title-text" aria-label={TITLE_TEXT}>
            {TITLE_TEXT.split('').map((ch, i) => (
              <span className="ch" key={i} aria-hidden="true">
                {ch === ' ' ? '\u00a0' : ch}
              </span>
            ))}
          </span>
          <span className="caret" aria-hidden="true">
            _
          </span>
        </h1>

        <p className={`subtitle ${revealClass}`} {...reveal(2)}>
          <Typewriter lines={TAGLINES} />
        </p>

        <div className={`platforms ${revealClass}`} {...reveal(3)}>
          {PLATFORMS.map((p) => (
            <span
              key={p.label}
              className={`platform-badge ${p.active ? 'platform-badge--active' : 'is-soon'}`}
              title={p.active ? undefined : 'Not supported yet'}
            >
              {p.label}
            </span>
          ))}
        </div>

        <div className={`download-card ${revealClass}`} {...reveal(4)} ref={cardRef}>
          <form className="download-form" onSubmit={handleSubmit}>
            <div className="input-wrapper">
              <input
                type="text"
                className="url-input"
                placeholder="Paste a Spotify track, album or playlist link…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="submit-btn" disabled={loading || !url.trim()}>
                {loading ? '...' : 'RESOLVE'}
              </button>
            </div>
            {error && <div className="error-msg">{error}</div>}
          </form>
        </div>

        {loading && (
          <div className="loading" aria-label="Resolving">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        )}

        {/* Single track result */}
        {track && !collection && (
          <div className="result">
            <p className="result-title">AUDIO READY_</p>

            <div className="track-info">
              {(track.thumbnail || track.cover) && (
                <img
                  className="track-cover"
                  src={track.thumbnail || track.cover}
                  alt=""
                  loading="lazy"
                />
              )}
              <div className="track-meta">
                <span className="track-name">{track.title}</span>
                <span className="track-artist">{track.artist}</span>
                <div className="track-facts">
                  {formatDuration(track.duration) && (
                    <span>
                      <strong>Duration</strong> {formatDuration(track.duration)}
                    </span>
                  )}
                  <span>
                    <strong>Output</strong> MP3 · 192 kbps
                  </span>
                </div>
              </div>
            </div>

            <div className="download-options">
              {track.audio ? (
                <button
                  type="button"
                  className="download-btn download-btn--solid"
                  onClick={downloadResolved}
                  disabled={busy === 'single'}
                >
                  {progressLabel('single', 'DOWNLOAD MP3')}
                </button>
              ) : null}

              {track.spotifyUrl && (
                <a
                  className="download-btn download-btn--ghost"
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Spotify
                </a>
              )}
            </div>

            {track.note && <p className="note">{track.note}</p>}
          </div>
        )}

        {/* Collection result */}
        {collection && (
          <div className="collection">
            <div className="collection-head">
              {collection.cover && (
                <img className="collection-cover" src={collection.cover} alt="" loading="lazy" />
              )}
              <div className="collection-meta">
                <span className="collection-kind">{collection.kind}</span>
                <span className="collection-name">{collection.name}</span>
                <span className="collection-sub">{collection.artist}</span>
                <div className="track-facts">
                  <span>
                    <strong>Tracks</strong> {collection.total}
                  </span>
                  {collection.releaseDate && (
                    <span>
                      <strong>Released</strong> {collection.releaseDate}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="collection-actions">
              <button
                type="button"
                className="download-btn download-btn--solid"
                onClick={downloadAll}
                disabled={busy !== null || collection.total === 0}
              >
                {busy === 'all' ? 'DOWNLOADING…' : `DOWNLOAD ALL (${collection.total})`}
              </button>
              <a
                className="download-btn download-btn--ghost"
                href={collection.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Spotify
              </a>
              {batch && (
                <span className="collection-progress">
                  {batch.ok}/{batch.total} saved · working on {batch.current}
                </span>
              )}
            </div>

            <div className="tracklist">
              {collection.tracks.map((row) => (
                <div
                  key={row.index}
                  className={`track-row ${busy === row.index ? 'is-busy' : ''}`}
                >
                  <span className="track-index">{String(row.index).padStart(2, '0')}</span>
                  <div className="track-row-main">
                    <div className="track-row-title">{row.title}</div>
                    <div className="track-row-artist">{row.artist}</div>
                  </div>
                  <span className="track-row-time">{formatDuration(row.duration) || '—'}</span>
                  <button
                    type="button"
                    className={`track-row-btn ${done[row.index] ? 'is-done' : ''}`}
                    onClick={() => downloadRow(row)}
                    disabled={busy !== null}
                  >
                    {progressLabel(row.index, 'MP3')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section className="section">
        <header className={`section-header ${revealClass}`} {...reveal(6)}>
          <p className="section-eyebrow">activity log</p>
          <h2 className="section-title">RECENT DOWNLOADS_</h2>
          <p className="section-sub">
            Every resolve is written to the database with a masked address. Nothing is
            stored about the file itself — the audio streams straight from the CDN.
          </p>
        </header>

        <div className="recent-grid">
          {recent.length === 0 ? (
            <div className={`card ${revealClass}`} {...reveal(7)}>
              <p className="card-empty">No activity yet. Resolve a track to start the log.</p>
            </div>
          ) : (
            recent.slice(0, 6).map((item, i) => (
              <article key={`${item.title}-${i}`} className={`card ${revealClass}`} {...reveal(7 + i)}>
                <div className="card-top">
                  <span className="card-label">{item.format || item.kind || 'track'}</span>
                  <span className="card-time">{formatTime(item.createdAt)}</span>
                </div>
                <div className="recent-row">
                  {item.thumbnail ? (
                    <img className="recent-thumb" src={item.thumbnail} alt="" loading="lazy" />
                  ) : null}
                  <div className="recent-body">
                    <p className="card-title">{item.title}</p>
                    <p className="card-sub">
                      {item.author || 'Unknown artist'}
                      {item.ipMasked ? ` · ${item.ipMasked}` : ''}
                    </p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {/* Backend monitor */}
      <section className="section section--monitor">
        <header className={`section-header ${revealClass}`} {...reveal(8)}>
          <p className="section-eyebrow">backend monitor</p>
          <h2 className="section-title">UPSTREAM STATUS_</h2>
          <p className="section-sub">
            The whole chain, probed live with the same calls a download makes: Spotify for the
            metadata and track list, YouTube for the recording match, a signed converter for the
            audio, and the Worker that carries the bytes to your browser.
          </p>
        </header>

        {!monitor ? (
          <div className={`card ${revealClass}`} {...reveal(9)}>
            <p className="card-empty">Probing upstream resolvers…</p>
          </div>
        ) : (
          <>
            <div className="monitor-grid">
              {monitor.upstreams.map((u, i) => (
                <article key={u.id} className={`monitor-card ${revealClass}`} {...reveal(9 + i)}>
                  <div className="monitor-card-top">
                    <span className={`monitor-role monitor-role--${u.role}`}>
                      {u.role === 'transport' ? 'TRANSPORT' : 'PRIMARY'}
                    </span>
                    <span className={`monitor-status monitor-status--${u.status}`}>
                      <span className="monitor-dot" aria-hidden="true" />
                      {u.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <h3 className="monitor-name">{u.label}</h3>
                  <p className="monitor-host">{u.host}</p>

                  <dl className="monitor-facts">
                    <div>
                      <dt>scope</dt>
                      <dd>{u.scope}</dd>
                    </div>
                    <div>
                      <dt>latency</dt>
                      <dd>{u.status === 'ok' ? `${u.ms} ms` : '—'}</dd>
                    </div>
                    {u.serves ? (
                      <div>
                        <dt>serving</dt>
                        <dd>
                          {u.share === null ? 'no traffic yet' : `${u.share}% of last ${monitor.sample}`}
                        </dd>
                      </div>
                    ) : (
                      <div>
                        <dt>file bytes</dt>
                        <dd>no</dd>
                      </div>
                    )}
                  </dl>

                  <p className="monitor-note">{u.detail}</p>

                  {u.serves && (
                    <div
                      className="monitor-bar"
                      role="img"
                      aria-label={
                        u.share === null
                          ? `${u.label}: no traffic yet`
                          : `${u.label} served ${u.share}% of the last ${monitor.sample} downloads`
                      }
                    >
                      <span style={{ width: `${u.share || 0}%` }} />
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className={`monitor-summary ${revealClass}`} {...reveal(12)}>
              <span className="monitor-summary-label">currently serving</span>
              <span className="monitor-summary-value">
                {monitor.active ? monitor.active.label : 'none'}
              </span>
              <span className="monitor-summary-meta">
                {monitor.healthy}/{monitor.total} online · probed in {monitor.probeMs} ms
              </span>
            </div>
          </>
        )}
      </section>

      <footer className="footer">
        <span>DownMusic — Spotify audio downloader · open source</span>
        <a href="https://github.com/khezan10/downmusic" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <a href="/api/health" target="_blank" rel="noopener noreferrer">
          Health
        </a>
      </footer>

      <IdleAnimations titleRef={titleRef} eyebrowRef={eyebrowRef} cardRef={cardRef} />
    </main>
  )
}
