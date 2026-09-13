# Design rules

A design system that follows the Omarchy contract: **themes are data, structure is law.**
A theme is a small set of named colors. Everything else — layout, type, spacing,
borders, motion — is fixed and shared by every theme.

Reference implementation: `index.html` in this repo.

---

## Layer 0 — The contract

1. A **theme** defines exactly the 12 role tokens below. Nothing else.
2. **Structure** (type, spacing, borders, radii, layout, motion) never varies per theme.
3. Components reference **roles only**. A raw hex value inside a component is a bug.

The test: swapping themes changes zero layout metrics. No reflow, no font change,
no element that only looks right in one palette.

## Layer 1 — The 12 role tokens

These mirror the roles an Omarchy theme file fills (terminal, bar, notifications):

| Token        | Role                                              |
|--------------|---------------------------------------------------|
| `--bg`       | The ground. Page background.                      |
| `--bg-alt`   | Raised surface: bars, tiles, code blocks.         |
| `--border`   | Inactive edges. 1px, always.                      |
| `--fg`       | Primary text. Contrast vs `--bg` ≥ 7:1.           |
| `--fg-muted` | Secondary text. Contrast ≥ 4.5:1.                 |
| `--fg-faint` | Tertiary: timestamps, hints, dividers with text.  |
| `--accent`   | The one loud thing: links, CTA, active border.    |
| `--accent-2` | Secondary hue for meta/labels. Used sparingly.    |
| `--ok`       | Positive state.                                   |
| `--warn`     | Caution state.                                    |
| `--err`      | Error state.                                      |
| `--sel`      | Text selection background.                        |

Derived values (hover tints, translucent fills) come from `color-mix()` on these
tokens — never from new hex values.

## Layer 2 — Structure rules

1. **One accent per view.** Accent means "interactive" or "active." If everything
   is orange, nothing is.
2. **Borders, not shadows. Corners are square.** Elevation = `--bg-alt` + 1px
   `--border`. Flat, like tiled windows. No drop shadows, no gradients, and
   `border-radius: 0` everywhere — rectangles are rectangles. Two intensities
   from one token (omarchy.org runs border-subtle/border-strong): window
   outlines use `--border`; internal panes and rows use the derived
   `--border-subtle: color-mix(in srgb, var(--border) 55%, transparent)`.
3. **Focus is the accent border; everything else steps back.** The
   hovered/focused window switches its border to `--accent` (the Hyprland
   active-window rule) and all other windows dim to opacity 0.85 (omarchy's
   `dim_inactive`, strength 0.15) — on hover-capable devices only, so touch
   never leaves a stuck dim. Border *color* changes; border *width* never
   does (zero layout shift).
4. **Hierarchy comes from type, not color — and type never shouts.** Size,
   weight, and case must carry the hierarchy so it survives every palette,
   including light ones. Headings stay modest: the page's largest type stays
   under ~2.5rem (omarchy.org's own hero H1 is 24–30px). Structure signals
   importance; display-size type is the marketing-page tell.
5. **Type is structure — and it is one monospace family.** Omarchy sets
   JetBrainsMono Nerd Font in every config (alacritty, ghostty, kitty); there
   is no display face anywhere in the system. Web build: JetBrains Mono only.
   Hierarchy comes from weight (400/500/700/800), size, and case — never from
   a second typeface. Themes cannot touch fonts.
6. **Fixed scales.** Spacing on one scale (`--s1…--s5`), one type scale. No
   ad-hoc margins; siblings space with flex/grid `gap`.
7. **State is color.** ok/warn/err speak through their tokens, plus a word.
   Never through layout changes.
8. **Keyboard first.** Every interactive element is focusable with a visible
   accent focus ring. The theme cycles on `T`, like omarchy.org.
9. **Snap, don't fade.** Theme changes apply instantly (an ≤80ms linear
   transition is the ceiling — no easing curves, no smooth scrolling). Respect
   `prefers-reduced-motion` on everything else.
10. **Text renders everywhere.** Prefer text and borders over images; anything
    drawn in text (like the ASCII portrait) inherits the theme for free.
11. **Seams, not air.** Regions separate two legal ways, both thin — and a
    page picks exactly one mode:
    - **Band mode (sites and documents):** sections are full-bleed bands
      split by a 1px `--border` hairline with alternating surface depth
      (`--bg` ↔ `--bg-alt`); content inside sits in a centered measure.
      This is omarchy.org's own model.
    - **Tile mode (apps and dashboards):** windows separated by one uniform
      12px gap, like `gaps_in`/`gaps_out`, on the `--bg` wallpaper.
    Wide margins are never a separator in either mode.
12. **Objects get borders; prose sits on the band.** Anything object-like —
    a figure, card, terminal, chart — is a bordered surface whose background
    flips depth against its band (`--bg` band → `--bg-alt` surface, and the
    reverse on a deep band). Prose and lists sit directly on the band, rows
    divided by `--border-subtle`. Section headers are unboxed strips: path
    label left (`~/builds`), one fact right, subtle hairline underneath.
13. **Tight outside, roomy inside.** Density belongs to the seams; comfort
    belongs to the content. Band and card padding is generous and fixed,
    reading text keeps line-height ≥ 1.6 and measure ≤ 65ch, and neither may
    be compressed to fit more in. A page that feels cramped broke this rule
    inside the band; a page that feels airy broke rule 11 between them.
14. **Reserve, don't reflow.** Chrome is a grid of fixed slots; data changes
    inside a slot, slots never move. Any element whose content varies at
    runtime (theme name, counts, dates, status words) gets a slot sized to the
    **widest legal value in its data registry** — `min-width` in `ch` (exact in
    a mono face), fixed grid tracks, `tabular-nums` for digits — and the size
    derives from the registry, not from whatever value happens to be showing.
    Variable-length text without a reserved slot may only sit flush against a
    row's free edge; it never sits between two fixed elements. Test: render
    every registered value in the slot; fixed chrome must not move a pixel.

15. **Choices are rows of text, not rows of buttons.** A settings or menu window
    is a label column and text options. The active option carries a filled
    square (■) and the foreground color; the others carry an empty square (□)
    and step back to faint. Actions are plain text that turns accent on hover.
    Bordered buttons are for the one or two primary actions in a view, never
    for a list of choices. Rows separate with `--border-subtle` hairlines.

## Layer 3 — Adding a theme

A new theme is one CSS block. It cannot touch anything else:

```css
:root[data-palette="my-theme"] {
  --bg: #______;  --bg-alt: #______;  --border: #______;
  --fg: #______;  --fg-muted: #______;  --fg-faint: #______;
  --accent: #______;  --accent-2: #______;
  --ok: #______;  --warn: #______;  --err: #______;
  --sel: color-mix(in srgb, var(--accent) 30%, transparent);
}
```

Then register its name in the `THEMES` array so `T` and the swatch bar pick it up.

**Acceptance checklist for any new theme:**
- [ ] All 12 tokens defined; no component CSS edited.
- [ ] `--fg` on `--bg` ≥ 7:1; `--fg-muted` ≥ 4.5:1; `--accent` ≥ 3:1.
- [ ] Accent reads as a link color on this ground.
- [ ] Cycle through with `T`: nothing moves, only colors change.

## Cross-checked against omarchy.org

The OS and its website agree, and this system matches both (verified against
the `basecamp/omarchy` repo and omarchy.org's shipped CSS):

- `body { font-family: var(--font-mono) }` — the whole site runs on
  JetBrains Mono, like the OS. One family, no display face.
- Tokens are two-layered: component roles (`--color-bg`, `--color-brand`)
  map to a theme data layer (`--t-bg`, `--t-brand`). Same contract as our
  12 roles ← theme blocks.
- Sections divide with 1px hairlines and alternating surface depth — never
  with wide margins.
- Pressing `T` cycles themes on the site, exactly as in the OS menu.
- The hero graphic is text/pixel cells in the brand color (their pixel-art
  logo, our ASCII portrait) so it re-skins with the theme for free.
- Headings stay under ~2rem even on the marketing homepage.

## Shipped themes

`tokyo-night` (default), `heymitch` (a cassette-futurism palette),
`gruvbox`, `catppuccin`, `nord`, `everforest`, `rose-pine`, `latte` (light).
All but the first are palettes Omarchy actually ships, so they're already
proven for contrast and mood.
