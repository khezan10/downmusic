---
version: alpha
name: MZG Terminal — downloadin-ya
description: Dark terminal identity with a single lime signal, shared by link.mzg.my.id, tmail.mzg.my.id and downloadin-ya.
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
  lime-ghost: "#141A0A"
  error: "#FF6B6B"
  error-wash: "#23120F"
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
  body-lg:
    fontFamily: Space Mono
    fontSize: 0.95rem
    fontWeight: 400
    lineHeight: 1.7
  label-caps:
    fontFamily: Space Mono
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.32em"
  metadata:
    fontFamily: Space Mono
    fontSize: 0.78rem
    fontWeight: 400
    lineHeight: 1.6
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
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.lime-wash}"
    textColor: "{colors.tertiary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tertiary}"
  button-small:
    backgroundColor: "{colors.lime-faint}"
    textColor: "{colors.tertiary}"
    typography: "{typography.metadata}"
    rounded: "{rounded.md}"
    padding: 8px
    height: 44px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: 14px
  card-hover:
    backgroundColor: "{colors.lime-ghost}"
    textColor: "{colors.tertiary}"
  badge-active:
    backgroundColor: "{colors.lime-faint}"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.sm}"
    padding: 9px
  badge-soon:
    backgroundColor: "transparent"
    textColor: "{colors.neutral}"
    rounded: "{rounded.sm}"
    padding: 9px
  link-accent:
    backgroundColor: "transparent"
    textColor: "{colors.tertiary}"
    typography: "{typography.body-lg}"
  error:
    backgroundColor: "{colors.error-wash}"
    textColor: "{colors.error}"
    rounded: "{rounded.sm}"
    padding: 12px
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  eyebrow:
    backgroundColor: "transparent"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-caps}"
  title-display:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.display}"
  subtitle:
    backgroundColor: "transparent"
    textColor: "{colors.neutral}"
    typography: "{typography.body-lg}"
  footer-bar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    typography: "{typography.body-md}"
    height: 53px
---

## Overview

A shared terminal identity for the three public MZG tools: **link.mzg.my.id** (link
shortener), **tmail.mzg.my.id** (temporary email) and **downloadin-ya** (social video
downloader). All three are the same product family, so they share one palette, one type
pair, one spacing rhythm and one responsive contract. A visitor should be able to move
between them and feel no seam.

The voice is a working terminal: near-black canvas, phosphor-lime as the only signal
color, monospaced type, and the `▓▒░` ASCII strip that marks section eyebrows. Restraint
is the point — lime is reserved for things you can act on, so it never loses meaning.

**Reference implementation:** `link.mzg.my.id`. Where the three products differ, link's
treatment is the canonical one and the others follow it.

## Colors

- **Primary (#0A0B08):** The canvas. Every page starts here. Never used for text.
- **Secondary (#F5F5F5):** Primary text and headlines. Near-white, not pure white, so it
  sits on the black without vibrating.
- **Tertiary (#B4FF2B):** The single signal color — links, focus rings, the primary
  button, active states, eyebrow labels. If it is on screen, the user can act on it.
  Nothing decorative uses tertiary.
- **Neutral (#A8A8A8):** Supporting copy, metadata, timestamps, secondary labels.
- **Line (#262626):** Hairline borders on cards, inputs and dividers. A border, never
  a fill.
- **Surface (#060705):** Card and input fill, slightly lighter than the canvas so
  elevation reads without a shadow.

The translucent tints used in the code are listed here as their **composited**
equivalents over the primary canvas, so a consumer can render the tokens directly
and a contrast checker gets a true value:

| Token | CSS in the app | Composited |
|-------|----------------|------------|
| `lime-faint` | `rgba(180,255,43,0.07)` | `#161C0A` |
| `lime-ghost` | `rgba(180,255,43,0.06)` | `#141A0A` |
| `lime-wash` | `rgba(180,255,43,0.16)` | `#25320E` |
| `error-wash` | `rgba(255,80,80,0.10)` | `#23120F` |

## Typography

Two families, two jobs.

**DotGothic16** for display type — the product name, section headings, the blinking
caret. Pixel geometry carries the terminal identity. Used at `display` (3rem) and `title`
(2rem), always uppercase, always with `0.08em` tracking.

**Space Mono** for everything else — body copy, labels, inputs, links, metadata. It
matches the pixel display type without imitating it.

Scale rules:

- `label-caps` (0.75rem, 0.32em tracking) — eyebrows and section markers only
- `metadata` (0.78rem) — timestamps, platform tags, click counts, masked IPs
- `body-md` (0.9rem) — inputs, buttons, list rows
- `body-lg` (0.95rem) — the subtitle and short link text

**Metadata never drops below 0.78rem.** On a phone, 0.68rem renders at ~10.9px and
becomes unreadable; the floor is 0.78rem (~12.5px) on every viewport.

## Layout

Spacing is a 4px baseline: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32,
`section` 64.

Content is a single centered column. `link` caps at 560px, `tmail` at 760px,
`downloadin-ya` at 580px for the form and 920px for the activity log. The narrower
columns are intentional — a shortener has one job, a mail client has a list.

**Responsive contract — identical across all three projects:**

| Range | Name | Rules |
|---|---|---|
| ≤ 640px | mobile | Single column. Container padding 20px. All interactive elements ≥ 44px tall. Metadata floors apply. |
| 641–1024px | tablet | Container padding 32px. Display type scales with `clamp()` up to 3.4rem. |
| > 1024px | desktop | Container padding 24px, display type up to 3.6rem. |

Break at **640px and 1024px** in every project. A shared breakpoint means the same
component behaves the same way on all three tools.

## Elevation & Depth

No shadows for structure. Depth comes from fill and border: a surface fill one step
off the canvas, a 1px `--line` border, and a hover state that shifts the border to a
translucent lime.

The one exception is the breathing glow on `downloadin-ya`'s form card — a soft
`0 0 10-28px rgba(180,255,43,0.05-0.15)` that pulses on a 3s sine. It is an ambient
life signal, not a shadow.

## Shapes

- `sm` 6px — small badges, error blocks
- `md` 9px — the default for inputs, buttons and list cards
- `lg` 12px — the downloadin-ya result panel, the download card
- `xl` 16px — the downloadin-ya form card
- `full` 9999px — click-count pills only

Corners stay modest. Nothing is a pill except a count badge.

## Components

- `button-primary` — the single high-emphasis action per screen. Lime fill, ink text.
- `button-ghost` — everything else that acts: ghost buttons, the alias toggle, the
  secondary downloadin-ya action.
- `input` — near-black fill, hairline border, lime 2px focus outline at 1px offset.
- `card` — the default grouped surface: list rows in shortlink and tmail, recent
  downloads in downloadin-ya.
- `badge-active` / `badge-soon` — downloadin-ya's platform row. Active gets a lime
  border and fill; planned platforms are dimmed to 45% with a dashed border.
- `link-accent` — the URL itself, lime, underlined on hover.
- `error` — red-on-dark, 10% red fill, 30% red border. Never the lime treatment.
- `footer-bar` — fixed bottom bar. On mobile it stacks to two centered lines.

Every interactive element on mobile is at least **44px** tall. Where the visual label
must stay small (footer links, masked IPs), add padding rather than growing the text —
the hit area grows, the type does not.

## Motion

Motion is part of the identity, not decoration.

- **Entrance** — fade + 20px rise + 6-8px deblur over 0.6s, staggered 90ms per element.
  Driven by state, not an `IntersectionObserver`, so nothing can get stuck invisible.
- **Typewriter** — the hero subtitle types, holds ~4.2s, erases, and types the next
  line. It loops forever so the hero is never static.
- **Caret** — a blinking `▌` or `_` in lime, `steps(1)`, 0.9-1.1s.
- **Glitch** — the eyebrow splits RGB and skews for ~140ms every 5-9s.
- **Breathe** — the downloadin-ya form card pulses a lime glow on a 3s sine.
- **Hover hop** — title letters lift once on hover and settle back.

All of it pauses when the tab is hidden. `prefers-reduced-motion` removes movement but
**never removes content** — opacity stays, only `transform` and `filter` are dropped.

## Do's and Don'ts

- **Do** reach for `--lime` only when the user can act on the element.
- **Do** keep metadata at 0.78rem or larger, on every viewport.
- **Do** keep the 640/1024 breakpoints identical across all three projects.
- **Do** give anything a finger must hit a 44px minimum height on mobile.
- **Don't** add a second accent color. The palette is four neutrals and one signal.
- **Don't** use pure white (`#FFFFFF`) for text — `secondary` is `#F5F5F5` for a reason.
- **Don't** nest component variants. `button-primary-hover` is a sibling key, not a child.
- **Don't** re-type hex values in component definitions. Use `{colors.tertiary}` and
  friends so the palette stays single-source.
