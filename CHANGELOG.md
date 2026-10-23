# Changelog

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-24

First release that actually downloads something.

### Added

- **Full-length MP3 downloads.** The audio is fetched in 3 MB range chunks, then
  decoded with the Web Audio API and encoded to MP3 at 192 kbps in the browser.
  A 3:33 track produces a 5.13 MB file starting with an MPEG-1 Layer III frame.
- **Albums and playlists.** The Spotify embed page supplies the whole track list
  (title, artist, runtime, id) in one request, so a collection resolves in well
  under a second. Per-track and "download all" both produce MP3s.
- **Runtime-aware matching.** Candidates are scored on the YouTube Music `Song`
  entity plus the runtime from the subtitle column; a 9:20 live recording no
  longer wins over the 3:33 studio track.
- **Two candidates, two attempts.** The converter's occasional empty media list
  is retried, then the runner-up upload is used.
- **Live backend monitor** with three real probes and the share of traffic each
  one served.
- **Public activity log** in MongoDB, with masked IPs and a nightly cleanup cron.
- **44 tests** on Node's built-in runner, covering URL parsing, embed
  normalisation, match scoring, converter payloads, MP3 encoding and the proxy
  guards.

### Changed

- Metadata now comes from the Spotify embed page instead of `oembed` + Deezer +
  iTunes. One request instead of three, and the artist is exact.
- The entrance animation is a CSS animation rather than a JS-driven class, so no
  JavaScript failure can leave the page invisible.
- The site is plain CSS again (no Tailwind), matching the rest of the MZG
  Terminal properties.

### Removed

- The 30-second Spotify preview button. The app downloads the full track; a
  preview clip next to it was a confusing downgrade.
- The "YouTube Music" button. It opened a page that cannot download; the MP3
  button is the download.
- The upstream name from the result card. Which service produced the bytes is
  the monitor's business, not the visitor's.

### Fixed

- The page rendered a blank screen while every element sat at `opacity: 0`,
  because the reveal depended on `requestAnimationFrame`, which never fires in a
  background tab.
- A playlist/album result rendered nothing: the API reports the Spotify kind
  (`playlist`), while the UI compared against `'collection'`.
- `1.mp3.mp3` filenames when a row already carried an extension.
- The MP3 encode froze the tab for the whole track; it now yields between blocks
  and reports progress.
- A malformed Spotify link returned 502; it is a 400 now, and only an upstream
  failure is a 502.

### Security

- The download proxy refuses private/link-local addresses, enforces a fixed CDN
  allowlist, and re-validates the URL after a redirect.
- Filenames are stripped of control characters before entering
  `Content-Disposition`.
- Per-instance rate limiting on both API routes, with `Retry-After`.
