# DownMusic Development Plan

## Overview
Build stable Spotify downloader with working audio resolver, hosted on Vercel + GitHub, no local backend.

## Architecture Decisions

### Hosting Stack
- **Frontend**: Next.js 14 on Vercel (serverless)
- **Database**: MongoDB Atlas (already configured)
- **Audio Resolver**: TBD - need to research serverless-compatible options
- **GitHub**: khezan10/downmusic (existing)

### Design Reference
- Target: downloadin.mzg.my.id design patterns
- Theme: Terminal-lime (#0A0B08 bg, #B4FF2B fg) - already implemented
- Style: Open source, transparent (show recent downloads + monitor)

## Critical Blockers

### 1. Audio Resolver (BLOCKING)
**Problem**: No working free Spotify→MP3 API exists
**Options**:
1. Cloudflare Worker with yt-dlp (complex, may hit limits)
2. External paid API (user rejected cost)
3. YouTube Music stream extraction (requires client-side)
4. Self-hosted resolver on VPS (user rejected local server)

**Proposed Solution**: 
- Implement YouTube Music stream extraction via InnerTube API
- Use client-side fetch to bypass server IP restrictions
- Store audio metadata in MongoDB, stream directly to browser

### 2. UI Not Showing Content - RESOLVED
**Status**: CONTENT IS RENDERING
**Verification**:
- ✅ Page HTML: 10858 bytes, contains "DownMusic", "RESOLVE", "RECENT", "MONITOR"
- ✅ /api/monitor: 200 OK (839 bytes, 4/4 upstreams online)
- ✅ /api/recent: 200 OK (2016 bytes, returns download history)
- ✅ /api/resolve: 200 OK (returns metadata + YouTube Music link)
**Note**: User may have been testing before deployment completed

## Development Phases

### Phase 1: Fix Current Issues (Priority: HIGH)
1. Verify why content not appearing
2. Ensure all API routes work
3. Fix any console errors
4. Verify MongoDB connection

### Phase 2: Audio Resolver Implementation
1. Research YouTube Music InnerTube streaming
2. Implement serverless-compatible resolver
3. Test with multiple tracks
4. Handle edge cases (region locks, unavailable tracks)

### Phase 3: Design Improvements
1. Apply downloadin.mzg.my.id design patterns
2. Improve responsive layout
3. Add loading states
4. Polish animations

### Phase 4: Production Readiness
1. Security audit
2. Performance optimization
3. Documentation
4. Deploy to production

## Questions to Resolve
- [ ] What specifically "belum muncul" on the web?
- [ ] User's tolerance for partial solutions (metadata only vs full audio)?
- [ ] Budget for external services?
