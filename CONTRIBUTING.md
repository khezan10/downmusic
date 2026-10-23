# Contributing

## Before you open a PR

```bash
npm install
npm run check      # lint + syntax + build + tests
```

`npm run check` must be green. CI runs the same command on Node 20 and 22.

## The rules that matter here

**Test against the real upstream before you claim a path works.** Every dead
endpoint in the README was found by curling it, not by reading a blog post. If
you add a resolver, paste the curl output in the PR.

**A parser must be driven by a real payload.** The converter returns
`url[].ext` — not `url[].type` — and mixes real CDN files with an HTML page that
is not a file at all. `tests/savefrom.test.js` encodes that; keep it passing.

**The proxy allowlist is not configurable by the request.** Adding a host means
editing `MEDIA_HOSTS` in `src/app/api/download/route.js`, not passing a parameter.
Any change there needs a security note in the PR.

**Never invent a download URL.** If no source resolves, the API returns
`audio: null` with a `note`, and the UI shows the note. A button that 404s is
worse than an honest message.

**Long tasks yield.** The MP3 encoder is synchronous; it hands control back every
few blocks so the tab keeps painting. Anything that loops over a whole track must
do the same.

## Style

- Plain ESM in `src/lib/*.js`, so `node --test` imports exactly what ships.
- Comments explain *why*, especially where the code looks odd because an upstream
  is odd.
- No new runtime dependency without a reason in the PR: the site is Next + React
  + mongodb + the MP3 encoder, and that is the whole list.

## Adding a platform

Out of scope for now — the app is Spotify-only on purpose. A second platform
needs: a metadata source, a match strategy, a resolver with a tested payload,
and its own tests. Open an issue before writing code.
