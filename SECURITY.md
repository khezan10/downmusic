# Security policy

## Reporting

Open a private security advisory on GitHub, or email the maintainer at the
address in `package.json`. Please do not file a public issue for a vulnerability.

Expect a reply within a few days. There is no bounty.

## What this app does that needs care

**The download proxy (`/api/download`) is the sensitive surface.** It fetches a
URL on the server's behalf, which is the classic SSRF shape. The guards are:

1. `http`/`https` only.
2. Private, loopback, link-local and CGNAT addresses are refused *before* the
   allowlist is consulted (`169.254.169.254` included).
3. The host must equal or be a subdomain of a fixed allowlist:
   `googlevideo.com`, `sf-converter.com`, plus any host in
   `DOWNLOAD_ALLOWED_HOSTS`. Matching is on the hostname, never a substring.
4. The URL the fetch **actually landed on** after redirects is checked again
   with the same rules.
5. Filenames are sanitised — control characters, slashes and quotes removed —
   before they are interpolated into `Content-Disposition`.
6. Rate limited per instance, with `Retry-After`.

If you find a bypass for any of those, that is a genuine finding — report it.

## Known, accepted limitations

Stated here so they are not mistaken for oversights:

- **Rate limiting is per instance.** Serverless runs many instances; the limiter
  bounds a single warm function, not a distributed client.
- **The converter is a third party.** Its availability is not in our control. The
  app degrades to a message, never to a fake download.
- **The media URLs expire** (~4 h). A stale link fails at the CDN; the fix is to
  resolve again, which the UI does on every click.
- **No authentication.** By design: it is a public utility. The activity log
  stores masked IPs only.

## Secrets

`.env*` is gitignored. CI fails if a real `mongodb+srv://` credential, a
`ghp_`/`github_pat_` token or a `vcp_` Vercel token appears in the tree. If a
credential is ever committed, rotate it — rewriting history does not unpublish
it.
