# DownMusic

Paste a Spotify link — a track, an album or a whole playlist — and download the
audio as **MP3**.

Live: **https://downmusic.vercel.app**

> **Status, stated plainly.** The download is a real, full-length MP3 encoded in
> your browser at 192 kbps. It is not the 30-second Spotify preview, and it is
> not an m4a renamed to `.mp3`. Verified end to end: a 3:33 track produced
> 5,126,400 bytes starting with an MPEG-1 Layer III frame at 192 kbps.
>
> The audio is *matched*, not extracted from Spotify: the metadata comes from
> Spotify's public embed page, the recording is matched on YouTube Music, and the
> file comes from a public converter. That is the only pipeline that works
> without an account — see *Why there is no Spotify API* below.

## How it works

```
Spotify link
   │  open.spotify.com/embed/<type>/<id>     ← metadata + full track list
   ▼
YouTube search (InnerTube: Music + Web)      ← scoring: runtime, upload vs "Song"
   │
   ▼
public converter (signed client)             ← direct audio stream + fallback file
   │
   ▼
Cloudflare Worker proxy (CORS + Range)       ← Vercel's IPs are refused by the CDN
   │
   ▼
browser: decode → lamejs → .mp3              ← 192 kbps, no server limit
```

`infra/cloudflare-worker.js` is deployed as `downmusic-media` and configured
through `NEXT_PUBLIC_MEDIA_PROXY`. It exists for one measured reason: the same
media URL answers **403 to Vercel's addresses** and **206 to Cloudflare's**, so
the browser cannot fetch it from our own functions. The Worker also supplies the
CORS headers the CDN does not send, which is what makes a client-side MP3 encode
possible.

Each step exists for a measured reason:

| Step | Why it is there |
|---|---|
| Spotify embed page | `oembed` returns a title only. The embed page carries `trackList` with title, artist, duration and id for every track — no token, no account. |
| Runtime scoring | Title matching alone resolved *Never Gonna Give You Up* to a 9:20 Glastonbury performance. The Spotify runtime is now a hard signal. |
| Two candidates, two attempts | The converter occasionally answers "no audio stream" for a valid video. A retry, then the runner-up upload, fixes it. |
| Range proxy | The CDN sends no CORS headers, so the browser cannot fetch it directly. |
| **Edge runtime for the proxy** | The Node runtime is *refused* by these CDNs — googlevideo answers 403, the converter serves an HTML page — while the same URLs answer 206 with real bytes from the edge runtime. Measured, not assumed. |
| Chunked transfer | A single response has a size ceiling; a 5-minute track is ~4.8 MB. 3 MB chunks keep every response legal. |
| Browser MP3 encode | A real MP3 is a transcode. 4 minutes at 192 kbps is ~5.5 MB — over the same cap. The browser has no cap, and the audio never leaves the machine. |

## What works (verified 2026-10-24)

| Capability | Result |
|---|---|
| Track link → full MP3 | ✅ 3:33 track → 5.13 MB MP3, 192 kbps, `ff fb` frame sync |
| Album link → track list | ✅ 15 tracks with title, artist, runtime, Spotify link |
| Playlist link → track list | ✅ 50 tracks (the embed page caps at 50) |
| Per-track download from a collection | ✅ real MP3, correct filename |
| Download all | ✅ sequential, per-row progress, honest counter |
| Recent activity log | ✅ MongoDB, masked IP |
| Backend monitor | ✅ live probes: Spotify embed, YouTube Music, converter |
| No match / converter down | ✅ a clear message instead of a broken button |

## Why there is no Spotify API

Every free public Spotify→MP3 endpoint was tested from this machine on
2026-10-24, and every one is gone:

| Endpoint | Result |
|---|---|
| `api.spotifydown.com` | HTTP 000 — no DNS |
| `api.spotify-download.com` | HTTP 200, empty body |
| `api.spotifyconverter.net` | HTTP 000 |
| `spotisongdownloader.com/api` | 301 → no API |
| `api.paxsenix.org/spotify/dl` | 401 — requires a key |
| `api.spotidown.app`, `api.spotimate.xyz` | HTTP 000 |
| `api.cobalt.tools` | 401 — anonymous use removed |

`downtify.stream` and `spotiflac.com` are **self-hosted / desktop apps**
(Docker on port 8000, Flutter), not public APIs — they cannot be a bridge for a
serverless site. So the app resolves the audio itself and does the MP3 encode
where it costs nothing: in the browser.

Do not re-add any endpoint above without testing first; the table is here so
nobody repeats the experiment.

## Run it

```bash
npm install
cp .env.example .env.local     # optional: MongoDB for the activity log
npm run dev                    # http://localhost:3000
```

```bash
npm run check                  # lint + syntax + build + tests
```

Environment (all optional except MongoDB for the log):

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string. Without it the site works, the log stays empty. |
| `MONGODB_DB` | Database name, default `downmusic`. |
| `CRON_SECRET` | Guards `/api/cron/cleanup` (`Authorization: Bearer …`). |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata + sitemap. |
| `DOWNLOAD_ALLOWED_HOSTS` | Extra hosts for the proxy. The two CDN hosts are fixed in code. |

## Security

- **`/api/download` is not an open proxy.** The allowlist is fixed in code
  (`googlevideo.com`, `sf-converter.com`) plus an optional env extension. Private
  and link-local addresses are rejected before the allowlist is consulted, and
  the *final* URL after a redirect is checked again — a CDN that answers 302 to
  `169.254.169.254` is refused.
- **The proxy runs on the edge runtime**, because the Node runtime is refused by
  both media CDNs. Nothing in that route needs a Node API: no filesystem, no
  crypto, no database.
- **`/api/diag` is ops-only**: it needs `CRON_SECRET`, answers 404 without it,
  only inspects the app's own converter, and proxies no arbitrary URL.
- **Filenames are sanitised** before they reach `Content-Disposition`, including
  control characters (a raw CR/LF there is header injection).
- **Rate limiting** is per instance (30 resolves/min, 240 download requests/min)
  with a `Retry-After` header. It bounds one abusive client, not a botnet — that
  limitation is documented rather than hidden.
- **No secrets in the repository.** `.env*` is ignored; CI fails when a real
  connection string is found in the tree.

## Tests

`node --test` — 48 tests, no test dependency:

- URL parsing for every paste form, and the lookalike-host case
- embed normalisation (cover tiers, nbsp artist strings, missing durations)
- YouTube Music subtitle parsing and match scoring, including the live-version
  regression
- converter payload normalisation: `du.sf-converter.com/convert?payload=…` is an
  HTML page and must never reach a download button
- MP3 encoding: frame sync, bitrate, progress
- the proxy's host guards, redirect guard and rate limiter

## License

MIT — see [LICENSE](LICENSE). This project hosts no audio: it resolves links and
encodes what the visitor downloads. Use it for content you have the right to
download.
