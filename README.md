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
> Spotify's public embed page, the recording is matched on YouTube, and the
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

`infra/cloudflare-worker.js` is deployed as the Worker `downmusic-media` and
served at `https://media.mzg.my.id`, configured through `NEXT_PUBLIC_MEDIA_PROXY`.
It exists for one measured reason: the same media URL answers **403 to Vercel's
addresses** and **206 to Cloudflare's**, so the browser cannot fetch it from our
own functions. The Worker also supplies the CORS headers the CDN does not send,
which is what makes a client-side MP3 encode possible.

Each step exists for a measured reason:

| Step | Why it is there |
|---|---|
| Spotify embed page | `oembed` returns a title only. The embed page carries `trackList` with title, artist, duration and id for every track — no token, no account. |
| Two search catalogues | YouTube Music ranks songs and performances; the regular YouTube search still has the official upload. Only merging both found the 3:33 original. |
| Runtime gate | Title matching alone resolved *Never Gonna Give You Up* to a 9:20 Glastonbury performance. The Spotify runtime is now a hard signal, checked again against the decoded audio. |
| Two candidates, two attempts | The converter occasionally answers "no audio stream" for a valid video. A retry, then the runner-up upload, fixes it. |
| Cloudflare Worker | Neither the Node nor the Edge runtime can fetch these CDNs from Vercel — both answer 403. The Worker reaches them and adds the CORS headers the CDN does not send. |
| Chunked transfer | A single response has a size ceiling; a 5-minute track is ~4.8 MB. 3 MB chunks keep every response legal, and each chunk is retried on its own. |
| Browser MP3 encode | A real MP3 is a transcode. 4 minutes at 192 kbps is ~5.5 MB — over the same cap. The browser has no cap, and the audio never leaves the machine. |
| ID3 tags in the browser | lamejs writes bare frames. A v2.3 block (UTF-16 text, APIC cover) is prepended after the encode, so the file has a title, an artist and artwork in any player — the cover comes from Spotify's image CDN, which is CORS-open, so the image never touches our servers. |

## Upstreams

The registry (`src/lib/upstreams.js`) is the only list: the monitor, the health
route and the resolve path all read it, and it is what the site displays.

| # | Upstream | Host | Scope | File bytes |
|---|---|---|---|---|
| 1 | Spotify Embed | `open.spotify.com` | metadata + track list | no |
| 2 | YouTube Search | `music.youtube.com`, `www.youtube.com` | recording match | no |
| 3 | SaveFrom Converter | `api-wh.savefrom.co.id` | audio stream (m4a) | yes |
| 4 | Cloudflare Worker | `media.mzg.my.id` | media transfer (CORS + Range) | no |

**Nothing local is registered, and nothing local may be.** No `localhost`, no
`127.0.0.1`, no LAN address, no service running on a developer's machine: Vercel
cannot reach any of them, so a monitor listing them would report a status that
means nothing. The Worker is the only piece outside the two clouds, and it is a
public Cloudflare deployment — its origin allowlist names the production site
alone.

## What works (verified 2026-10-24)

| Capability | Result |
|---|---|
| Track link → full MP3 | ✅ 3:33 track → 5.13 MB MP3, 192 kbps, `ff fb` frame sync |
| Tags + artwork | ✅ ID3v2.3: title, artist, album, track number, front cover (JPEG, ~70–120 KB) inside the file |
| Album link → track list | ✅ 15 tracks with title, artist, runtime, Spotify link |
| Playlist link → track list | ✅ 50 tracks (the embed page caps at 50) |
| Per-track download from a collection | ✅ real MP3, correct filename |
| Download all | ✅ sequential, per-row progress, honest counter |
| Recent activity log | ✅ MongoDB, masked IP |
| Backend monitor | ✅ 4/4 live probes: Spotify embed, YouTube search, converter, Worker |
| No match / converter down | ✅ a clear message instead of a broken button |

## Why there is no Spotify API

No public Spotify→MP3 endpoint is registered, and none should be. The ones that
were tried — `api.spotifydown.com`, `api.spotify-download.com`,
`api.spotifyconverter.net`, `spotisongdownloader.com/api`,
`api.paxsenix.org/spotify/dl`, `api.spotidown.app`, `api.spotimate.xyz`,
`api.cobalt.tools` — are dead, empty, or key-gated, and one endpoint's status
today says nothing about tomorrow. `downtify.stream` and `spotiflac.com` are
**self-hosted / desktop apps** (Docker, Flutter), not APIs, so they cannot bridge
a serverless site.

The app therefore resolves the audio itself and encodes the MP3 where it costs
nothing: in the browser. An upstream earns a place in the registry only if it
answers production's own calls; a service that needs a local process, a private
key or a home connection does not qualify.

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
- **`/api/download` stays a closed proxy.** The allowlist is fixed in code
  (`googlevideo.com`, `sf-converter.com`) plus an optional env extension. This
  route is the fallback for a normal network; from Vercel both media CDNs refuse
  it, which is exactly why the Worker exists.
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
- YouTube catalogue parsing and match scoring, including the live-version
  regression
- converter payload normalisation: `du.sf-converter.com/convert?payload=…` is an
  HTML page and must never reach a download button
- MP3 encoding: frame sync, bitrate, progress
- the proxy's host guards, redirect guard and rate limiter

## License

MIT — see [LICENSE](LICENSE). This project hosts no audio: it resolves links and
encodes what the visitor downloads. Use it for content you have the right to
download.
