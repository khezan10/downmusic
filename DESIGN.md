---
version: alpha
name: MZG Terminal — downmusic
description: Dark terminal identity with a single lime signal, shared by downmusic, downloadin-ya, link.mzg.my.id and tmail.mzg.my.id.
colors:
  primary: "#0A0B08"
  secondary: "#F5F5F5"
  tertiary: "#B4FF2B"
  neutral: "#A8A8A8"
  line: "#262626"
  surface: "#060705"
  on-primary: "#F5F5F5"
  on-tertiary: "#0A0B08"
  lime-faint: "#161C0A"
  lime-wash: "#25320E"
  error: "#FF6B6B"
typography:
  display:
    fontFamily: DotGothic16
    fontSize: 3rem
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.08em"
  title:
    fontFamily: DotGothic16
    fontSize: 2rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.08em"
  body-md:
    fontFamily: Space Mono
    fontSize: 0.9rem
    fontWeight: 400
    lineHeight: 1.7
  label-caps:
    fontFamily: Space Mono
    fontSize: 0.75rem
    fontWeight: 400
    letterSpacing: "0.32em"
  metadata:
    fontFamily: Space Mono
    fontSize: 0.78rem
    fontWeight: 400
rounded:
  sm: 6px
  md: 9px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 64px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "body-md"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.lime-wash}"
    textColor: "{colors.tertiary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral}"
    border: "1px solid {colors.line}"
  card:
    backgroundColor: "rgba(6, 7, 5, 0.82)"
    border: "1px solid {colors.line}"
    rounded: "{rounded.lg}"
    padding: 18px
motion:
  entrance:
    keyframes: "opacity 0 -> 1, translateY 26px -> 0, blur 8px -> 0"
    duration: 0.6s
    easing: "cubic-bezier(0.23, 1, 0.32, 1)"
    stagger: 90ms per element
    implementation: "CSS animation with animation-delay from --reveal-delay"
  caret:
    keyframes: "opacity 1 -> 0 at 50%"
    duration: 1.1s
    easing: steps(1)
  breathe:
    keyframes: "lime box-shadow 10px -> 28px"
    duration: 3s
    easing: ease-in-out
  reduced-motion:
    rule: "keep the fade, drop translateY/blur; never hide content"
---

# DownMusic design notes

The shared MZG Terminal language above is the whole visual system; this file only
records the decisions that are specific to this site.

## Layout

- Dot grid (`radial-gradient`, 32px) fixed behind everything, lime at 8% alpha.
- Hero centred, `min-height: 78vh`, eyebrow → title → typewriter → badges → form.
- Two content sections below the hero: `RECENT DOWNLOADS_` and
  `UPSTREAM STATUS_`, each `max-width: 920px`.
- Fixed footer with the project name, GitHub and Health links; `body` reserves
  64px (88px on mobile) so the footer never covers the last card.

## Distinctive elements

- **Per-character title.** `DOWNMUSIC` is split into `.ch` spans so a letter can
  hop on hover, with `aria-label` carrying the real word.
- **Typewriter subtitle.** The line in the brief — *download your playlist
  spotif\*ck anything anywhere anytime* — is verbatim, and it is also rendered in
  a screen-reader-only span.
- **Collection rows.** A four-column grid: index (34px), title + artist
  (`minmax(0,1fr)`), runtime (58px), action button. On mobile the index and
  runtime are dropped so the title keeps a usable width.
- **Result card.** 96px cover, title/artist stack, and a facts row that states
  the output format, because "what am I getting" is the visitor's first question.

## Motion

The entrance is a **CSS animation**, not a JS-driven class. This is deliberate:
an earlier version flipped a class from `useEffect` after
`requestAnimationFrame`, and in a background tab `rAF` never fires — every
element stayed at `opacity: 0` and the site looked blank. A CSS animation cannot
be broken by a JavaScript failure, and it needs no state at all.

The stagger comes from `--reveal-delay` set inline per element (90ms apart). The
idle animations (eyebrow glitch, card breathe, title hop) are ported from the
Zanara landing page and pause when the tab is hidden.

Reduced motion removes the movement, never the content: the keyframe becomes a
plain fade.

## Copy rules

- UI text is English.
- The site never claims to be Spotify, and the footer says it is open source.
- A failure states what happened ("the converter returned no audio stream") and
  offers the next step; it never shows a button that cannot work.
