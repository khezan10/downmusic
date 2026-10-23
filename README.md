# DownMusic

> **download your playlist spotif*ck anything anywhere anytime**

Open-source Spotify/YouTube music downloader with full metadata, album art, and lyrics. No account needed. Deployed on Vercel with serverless functions.

![DownMusic](https://img.shields.io/badge/DownMusic-v1.0.0-B4FF2B?style=for-the-badge&logo=music&logoColor=0A0B08)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=for-the-badge&logo=vercel)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green?style=for-the-badge&logo=mongodb)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

## Features

- 🎵 **Spotify Support** — Paste any Spotify track/album/playlist URL, auto-resolves via YouTube Music
- 🎬 **Multi-platform** — YouTube, TikTok, Instagram, Facebook, Twitter/X, Threads, Pinterest
- 📦 **Full Metadata** — Title, artist, album, duration, cover art, lyrics
- 🎨 **Album Art & Lyrics** — High-quality thumbnails and synced lyrics
- 📁 **M3U Playlist Export** — Generate `.m3u` files for playlists
- 🎯 **Artist Folder Organization** — Auto-organize downloads by artist
- ⚡ **Parallel Downloads** — Multiple quality options (4K, 1080p, 720p, 480p, Audio)
- 🔄 **Fallback Resolvers** — SaveFrom (primary) → TikWM → socialdownloader.space
- 📊 **Backend Monitor** — Real-time upstream status, latency, serving %
- 📋 **Activity Log** — Recent downloads with masked IPs
- 🌙 **Terminal-Lime UI** — Dark theme with staggered reveal animations
- 🆓 **100% Free** — No API keys, no accounts, no rate limits

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  Vercel API  │────▶│  Upstream APIs  │
│  (Next.js)  │     │  (Serverless)│     │  (Free Tiers)   │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │  MongoDB    │
                    │  (Atlas)    │
                    └─────────────┘
```

**Upstream Resolvers (Priority Order):**
1. **SaveFrom** (Primary) — All platforms, signed URL converter
2. **TikWM** (Fallback) — TikTok specialist, no watermark
3. **socialdownloader.space** (Fallback) — IG, Twitter, Threads, Pinterest

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free tier)
- Vercel account

### Local Development

```bash
# Clone and install
git clone https://github.com/khezan10/downmusic.git
cd downmusic
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI

# Run dev server
npm run dev
```

Open http://localhost:3000

### Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create khezan10/downmusic --public --push
   ```

2. **Import in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import `khezan10/downmusic`
   - Add Environment Variables:
     - `MONGODB_URI` — Your MongoDB Atlas connection string
     - `MONGODB_DB` — `downmusic`
     - `CRON_SECRET` — Generate with `openssl rand -hex 32`

3. **Deploy**
   - Vercel auto-detects Next.js
   - Cron job runs at 00:00 UTC daily for DB cleanup

## Project Structure

```
downmusic/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search/         # POST - Search Spotify/YouTube Music
│   │   │   ├── resolve/        # POST - Resolve download URLs
│   │   │   ├── download/       # GET  - Proxy download stream
│   │   │   ├── recent/         # GET  - Recent downloads log
│   │   │   ├── monitor/        # GET  - Upstream status monitor
│   │   │   └── cron/cleanup/   # GET  - Midnight DB cleanup (Vercel Cron)
│   │   ├── page.tsx            # Main UI (terminal-lime theme)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── design-tokens.ts    # Design system (colors, typography, spacing)
│   │   ├── mongodb.ts          # MongoDB client + cleanup logic
│   │   ├── upstreams.ts        # Upstream registry & config
│   │   ├── utils.ts            # Helpers (IP masking, platform detection)
│   │   ├── savefrom.ts         # SaveFrom signed URL resolver
│   │   ├── tikwm.ts            # TikWM TikTok resolver
│   │   ├── socialdownloader.ts # socialdownloader.space resolver
│   │   ├── resolver-chain.ts   # Fallback chain with health probes
│   │   ├── spotify.ts          # Spotify oEmbed metadata
│   │   ├── youtube-music.ts    # YouTube Music InnerTube search
│   │   └── spotify-to-ytmusic.ts # Spotify→YT Music pipeline
│   └── components/             # (Future: extracted components)
├── public/                     # Static assets (pixel logo, favicon)
├── DESIGN.md                   # Design system documentation
├── vercel.json                 # Vercel config + cron schedule
├── .env.example                # Environment template
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search` | Search Spotify/YouTube Music |
| POST | `/api/resolve` | Resolve download URLs via fallback chain |
| GET | `/api/download` | Proxy download stream (range support) |
| GET | `/api/recent` | Recent downloads (paginated) |
| GET | `/api/monitor` | Upstream health & stats |
| GET | `/api/cron/cleanup` | Midnight DB cleanup (cron) |

## Database Schema

**Collection: `downloads`**
```typescript
{
  platform: string,           // 'spotify', 'youtube', 'tiktok', etc.
  originalUrl: string,        // User-submitted URL
  ip: string,                 // Full IP (server-side only)
  ipMasked: string,           // '192.168.1.***' (logged)
  title: string,
  thumbnail: string,
  duration: number,
  author: string,
  success: boolean,
  upstream: string,           // 'savefrom', 'tikwm', 'socialdownloader'
  format: string,
  quality: string,
  createdAt: Date,            // TTL index: 90 days auto-expiry
}
```

**Collection: `upstreams`** (cached status)
```typescript
{
  id: string,
  role: 'primary' | 'fallback',
  name: string,
  host: string,
  scope: string[],
  status: 'online' | 'offline',
  latency: number,
  servingPct: number,
  lastChecked: Date,
}
```

**Auto-cleanup:** TTL index (90 days) + Vercel Cron at 00:00 UTC deletes records older than 1 hour (keeps only recent activity log).

## Design System

Terminal-lime theme matching Downloadin's aesthetic:
- **Background**: `#0A0B08` (near-black)
- **Surface**: `#060705`
- **Primary Text**: `#F5F5F5`
- **Accent (Lime)**: `#B4FF2B`
- **Muted**: `#A8A8A8`
- **Borders**: `#262626`

**Typography:**
- Display/Title: `DotGothic16` (pixel font)
- Body/Metadata: `Space Mono` (monospace)

**Animations:**
- Staggered reveal: `fade + rise + deblur` (0.6s)
- Per-character hover on title
- Typewriter effect on subtitle
- Stagger delays: 0, 100, 160, 220, 280, 340, 400, 460ms

See [DESIGN.md](DESIGN.md) for full specification.

## Spotify → YouTube Music Pipeline

1. User pastes Spotify URL (track/album/playlist)
2. Fetch metadata via Spotify oEmbed (no auth needed)
3. Build search query: `{artist} {title}`
4. Search YouTube Music via InnerTube API (WEB_REMIX client)
6. Match best result by title/artist/duration similarity
7. Resolve via SaveFrom converter (YouTube Music URL)
8. Return download options with full metadata

## Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feat/amazing-feature`
3. Commit changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feat/amazing-feature`
5. Open Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

## Credits

- **Design Inspiration**: [Downloadin](https://downloadin.mzg.my.id/) — Terminal-lime UI, activity log, backend monitor
- **Functionality Reference**: [Downtify](https://downtify.stream/) — Spotify downloader, metadata, M3U export, artist folders
- **Upstream Resolvers**: SaveFrom, TikWM, socialdownloader.space (free tiers)
- **Fonts**: DotGothic16, Space Mono (Google Fonts)

## Disclaimer

DownMusic is for personal use only. Downloading copyrighted content may violate terms of service. Respect artists and creators — support them on official platforms.

---

**Built with ❤️ by [Khezan Amartya](https://github.com/khezan10)**  
Deployed on Vercel • Database on MongoDB Atlas
