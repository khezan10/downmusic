# DownMusic

Resolve a Spotify link to full track metadata — title, artist, album, high-res
cover, duration — and jump straight to the matching YouTube Music recording.

Live: **https://downmusic.vercel.app**

> **Status, stated plainly.** This deployment resolves metadata and finds the
> audio match. It does **not** serve an MP3 by default, because every free
> public Spotify→MP3 converter (spotidown, spotisaver, spotmate, cobalt) is
> dead or Cloudflare-blocked from server IPs — each one was tested and recorded
> below. A download appears only when you point `AUDIO_RESOLVER_URL` at a
> resolver you control. There is no pretend download button.

## What works

| Capability | Source | Verified |
|---|---|---|
| Track title + cover | `open.spotify.com/oembed` | HTTP 200 |
| Artist, album, duration, 1000px cover | `api.deezer.com/search` (popularity `rank` picks the canonical recording, not a cover) | HTTP 200 |
| Metadata fallback | `itunes.apple.com/search` | HTTP 200 |
| Audio match | `music.youtube.com/youtubei/v1/search` | HTTP 200 |
| Resolve history | MongoDB Atlas, cleanup cron | verified |

## What does not work (tested 2026-10-23)

| Endpoint | Result |
|---|---|
| `api.spotidown.app` | HTTP 000 — no DNS |
| `api.spotimate.xyz` | HTTP 000 — no DNS |
| `api.spotisaver.net` | HTTP 000 |
| `spotisaver.net/api` | 403 (Cloudflare) |
| `spotdown.org/api/download` | 404 |
| `api.cobalt.tools` | 401 `error.api.auth.jwt.missing` |
| `youtubei/v1/player` (ANDROID) | `playabilityStatus: null`, 0 adaptiveFormats |
| `pipedapi.*` stream URLs | 401 (LBRY) / 502 (360p) |

Do not re-add any of these without re-testing first — the resolver file carries
the same table as a comment so nobody repeats the experiment.

## Enabling downloads

Set these on the Vercel project, then redeploy:

```
AUDIO_RESOLVER_URL=https://your-resolver.example/audio?url={url}
AUDIO_RESOLVER_KEY=optional-bearer-token
DOWNLOAD_ALLOWED_HOSTS=cdn.example.com,another-cdn.example.com
```

`AUDIO_RESOLVER_URL` must answer with JSON containing a direct audio URL —
`{"url": "https://..."}`, `{"downloadUrl": ...}`, `{"link": ...}` are all
accepted. `DOWNLOAD_ALLOWED_HOSTS` is the allowlist the streaming proxy
enforces; without it the proxy refuses every request, so the app can never be
used as an open relay.

## Environment

```
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/downmusic
MONGODB_DB=downmusic
CRON_SECRET=<random>
```

`MONGODB_URI` is required — the app throws a clear error instead of silently
using a placeholder. Never commit the connection string; it belongs in the
Vercel dashboard only.

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/search` | POST | `{ query }` — must be a Spotify track URL |
| `/api/resolve` | POST | `{ url }` — metadata + audio match + optional download |
| `/api/download` | GET | `?url=&filename=` — allowlisted streaming proxy, Range support |
| `/api/recent` | GET | `?page=&limit=` — resolve history, success only |
| `/api/monitor` | GET | live probe of every upstream actually used |
| `/api/cron/cleanup` | GET | `Authorization: Bearer $CRON_SECRET`, runs 00:00 UTC |

## Database cleanup

`vercel.json` schedules `/api/cron/cleanup` at `0 0 * * *` (00:00 UTC daily).
The handler deletes records older than one hour, so the collection is emptied
every night and cannot grow without bound. Verified: 401 without the bearer
token, 200 with it.

## Stack

Next.js 14 (App Router, webpack build), React 18, TypeScript, Tailwind CSS 4
via `@tailwindcss/postcss`, MongoDB driver 6. No browser automation, no
puppeteer, no native binaries — everything runs on Vercel's serverless runtime.

## Design

Terminal-lime identity: `#0A0B08` canvas, `#B4FF2B` single signal colour,
`#A8A8A8` supporting text, `#262626` hairlines. Space Mono for body,
DotGothic16 for display. Entrance animations are fade + 20px rise + deblur over
0.6s and are deliberately **not** gated behind `prefers-reduced-motion` — on
machines with Windows animation effects disabled the browser reports `reduce`,
and gating would remove them entirely.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in MONGODB_URI
npm run dev                  # http://localhost:3000
npm run build                # production check
```

## License

MIT — see [LICENSE](LICENSE).

DownMusic is not affiliated with Spotify. It reads public metadata and links to
where the audio actually lives.
