---
description: Design tokens, accessibility and markup conventions for the stylesheet and the renderer
paths:
  - "site/**"
  - "scripts/render.mjs"
---

# Stylesheet and renderer

- **Colour literals appear only in `site/board.css`'s `:root` block.** Everywhere else — the rest of
  the stylesheet and every line of `render.mjs` — refers to a custom property by name. A step's gate
  greps for a stray `#hex` outside `:root` and fails on it.
- **Colour never carries meaning alone.** Every stage state renders three things: a glyph
  (`✓` done, `●` in progress, `■` blocked, `○` not started), the stage label, and the state word.
  Remove any of the three and the page stops being WCAG 2.2 AA.
- **`--good` (`#01db8c`), `--warn` (`#ffb800`) and `--bad` (`#f41d1d`) are decorative marks only.**
  They measure 1.7–2.0:1 against their soft backgrounds. State *text* uses `--good-text` `#017b4f`,
  `--warn-text` `#8f6800`, `--bad-text` `#c61818`.
- **`--accent-text` (`#296ccf`) is used only on `--surface` (`#ffffff`).** On the page background it
  measures 4.44:1 and fails AA; there, emphasis text is `--deep` (`#2868c7`, 4.72:1).
- **The focus ring is `outline: 3px solid var(--accent); outline-offset: 2px` on `:focus-visible`.**
  Never `outline: none` without a replacement.
- **Dates print verbatim as `YYYY-MM-DD`, exactly as the report wrote them.** Never
  `toLocaleDateString`, `Intl.DateTimeFormat` or any relative-time phrasing: their output depends on
  the runtime's ICU data, which would make the page differ between machines and break the tests.
- **Every dynamic string is HTML-escaped** (`&`, `<`, `>`, `"`, `'`) before it reaches the output. A
  unit repository is a semi-trusted input source: a report containing `<script>` must render as text.
- **Structure is fixed:** `<html lang="en">`, one `<h1>`, a skip link to `#main`, a non-empty
  `<title>`, `<header>` / `<main id="main">` / `<footer>`, headings `h1 → h2 → h3 → h4` with no level
  skipped, the unit list as `<ul>` and each stepper as `<ol>`.
- **Every `<svg>` is either `aria-hidden="true"` or carries a `<title>`.** The ring and the portfolio
  bar are hidden from assistive technology because their values are also printed as text beside them —
  "5 of 10 tasks", "3 of 7 stages".
- **No client JavaScript.** The page ships zero `<script>` tags. If interactivity is ever added it is
  progressive enhancement over already-rendered content, never a requirement for reading the page.
- **Two stylesheets, in this order:** the OE UI Kit at
  `https://oegit.github.io/oe-ui-kit/v1/base.css`, then `./board.css`. Ours is second so it wins, and
  so the page is complete and compliant even if the kit URL 404s.
- **Mobile-first.** The base rules are the 360px layout; the two breakpoints (720px, 1080px) only add
  columns. Nothing has a fixed height, so 200% zoom at 320 CSS px reflows without horizontal scroll.
