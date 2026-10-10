# The Value Study — styling handoff

- **World:** The Value Study
- **Product:** Crafting Constellations
- **Locked:** 2026-10-10
- **Status:** reference only — user paused before HTML/CSS
- **North-star stills:** `.impeccable/references/value-study.webp` (comp) and `.impeccable/references/swatch-sheet.jpg` (source sheet)

If a still and this file disagree, the still wins. Sample pixels; do not guess cream or charcoal.

> Build note (2026-10-10): sampled values live in `samples/shared/tokens.css`. The comp's Payne's entry is darker than the hex below (`#21252d` core, `#323b48` entry body); the tokens follow the still.

## 1. One-sentence law

The interface is a watercolor value study: pigment, paper, and handwritten notes. Color is value, not hue. Unpainted paper is a designed cell. One wash owns each first viewport. Everything else orbits as annotation.

This is a therapeutic outreach network for people whose families have cancer — they need to reach friends and community who want to help. Dignity over engagement. Handmade, not clinical, not wellness.

## 2. Three composition raises (non-optional)

- **Paper-gap law.** Unpainted paper is a designed cell. The tooth between washes does half the work. Do not flood the ground with a tinted wash to "warm it up."
- **Single-wash command.** One pigment field owns the first viewport (about 50–60% of the fold). Type and notes only orbit it. No competing hero, card grid, or wordmark at the same scale.
- **Stroke path.** The opening wash enters on a real brush trajectory (diagonal, dense at entry, granulating as it dies). The product name sits in a ruled caption box, lettered like a pigment name, not a logo lockup.

## 3. Palette (sampled)

Tokens below are interior-patch averages. Washes are gradients; use both ends.

### Page ground

| Token | Hex | Sampled from |
| --- | --- | --- |
| `--paper` | `#f6f3ec` | Comp, upper-right paper |
| `--paper-warm` | `#f0ece6` | Comp, gap under the hero wash |
| `--paper-swatch` | `#e0dfdb` | Source sheet paper (slightly dirtier; use for nested sheets) |

Default page ground is `--paper`. Never `#ffffff`. Never cream `#f6f1e8` as a wellness field. Never sage.

### Hero wash (Payne's / the commanding field)

| Token | Hex | Role |
| --- | --- | --- |
| `--wash-entry` | `#585e65` | Dense start of the stroke |
| `--wash-mid` | `#787f8a` | Body of the wash |
| `--wash-fade` | `#b6b6b6` | Where pigment dies into paper |
| `--wash-deep` | `#343338` | Almost-black fresco mass, used sparingly for ink / focus |

The hero is a soft stop gradient along the stroke, not a flat fill and not a CSS orb.

### Pigment rail (from the source sheet)

Use these as named swatches. Each is a left-dense → right-paper fade.

| Name | Dense | Mid | Character |
| --- | --- | --- | --- |
| Grey Titanium | `#675f56` | `#c7bba7` | Warm, semitransparent |
| Graphite Gray | `#42413f` | `#a7a19c` | Opaque, nongranulating |
| Payne's Blue Gray | `#706d6a` | `#848a8b` | Cool, slightly blue |
| Payne's Gray | `#4e4c4e` | `#9e9a96` | Neutral-cool, granulating |
| Alvaro's Fresco Grey | `#343338` | `#887e82` | Cool violet-gray |
| Alvaro's Caliente Gray | `#aca297` | `#817668` | Warm brown-gray, medium staining |
| Neutral Gray | `#8f8981` | `#b3a99f` | Low-stain granite |
| Cool Gray | `#797570` | `#8b8889` | Cool, granulating |
| Warm Gray | `#d4cabd` | `#877876` | Warm, granulating |

Committed roles for UI (do not invent a fourth chromatic accent):

- Ground: `--paper`
- Ink / primary text: Graphite dense `#42413f` or Fresco `#343338`
- Quiet text / meta: Payne's mid `#9e9a96`
- Hairlines: `#d7d5cf` (comp caption rule)
- Warm tension (the only "accent"): Caliente mid `#817668` — used as a second value, never as brand orange
- Cool depth: Payne's Blue mid `#848a8b`

No sage `#7d8b6f`. No terracotta `#c17f59`. No LED red. No cobalt. No pink-ribbon pink.

## 4. Materials

Build so a screenshot still reads as these materials with the type removed:

- **Cold-press paper** — visible tooth. A fine paper-grain texture on the ground, low contrast, not a dirty overlay. If you cannot ship a texture, leave paper plain; do not fake it with a beige gradient.
- **Granulating wash** — pigment breaks into mineral speckle as it fades. SVG/CSS gradients alone are not enough for the hero; composite a wash raster (or canvas) for the commanding field. Smaller swatch bars may be CSS gradients plus a grain filter.
- **Pencil annotation** — thin, slightly irregular, low contrast. Hairline boxes. No marker, no brush-lettering, no calligraphy.

Washes fade. They do not have hard rectangle edges unless they are a cut swatch bar (rounded only as a wet-brush cap, never `border-radius: 12px` cards).

## 5. Type

Two voices only. No high-contrast editorial serif. No Inter / DM Sans / Space Grotesk / Plus Jakarta / Syne display.

### A. Pigment code (structure)

Small, tracked, technical. Used for metadata, section labels, pigment indexes (`PB29`, `PBk6`, `low staining`).

- Face: a condensed or normal grotesque with tabular-ish figures. Acceptable: Source Sans 3, News Gothic-like, Akzidenz-adjacent. Not Inter-as-display.
- Size: 11–13px equivalent
- Weight: 400
- Tracking: `0.06–0.12em`
- Case: as written on a paint tube — mixed, not shouty all-caps hero
- Color: Graphite `#42413f`

### B. Pencil italic (annotation)

The product name, notes, captions, and human language.

- Character: thin handwriting that looks like a sharp pencil or fine ballpoint on paper. Adult. Tired. Studio. Not cute journal, not wedding script, not comic print.
- Default italic / slanted
- Low thick-thin contrast
- Size: name in the caption box ~22–32px; notes ~14–16px
- Color: near-graphite, not 100% black

If a webfont is required, pick one that still looks like pencil at 14px. Reject any face that bounces, bubbles, or flourishes. A quiet real italic of a humanist text face is safer than a novelty hand if the hand looks cute.

Wordmark rule: "Crafting Constellations" is lettered like a pigment name inside a ruled box. It is not a logo. It may sit above a pigment line: `PB29 / PBk6 — low staining — semitransparent — granulating`.

## 6. Layout grammar

### First viewport

Landscape sheet. Roughly:

| Region | Width | Contents |
| --- | --- | --- |
| Commanding wash | ~55–60% left | One stroke, diagonal entry, fade to paper. No type on the wash unless it is a faint wet edge. |
| Caption plate | top-right | Hairline rectangle. Name + pigment line. |
| Annotation rail | right column | 4–6 horizontal mini-washes with handwritten notes. |
| System notes | under the rail | Three short lines max. Example voice: `Type: pencil italic` / `Color: value not hue` / `Outreach: write once, others can act.` |

Paper margins are generous. The wash does not kiss all four edges. The gap under and beside the wash is intentional.

### Later sections (when building product UI)

Inherit the same grammar. Do not switch to cards-on-gray.

- Sections are sheets or swatch rows, not cards.
- Hierarchy is value (darker wash = more important), not color.
- Navigation is an annotation rail or a pigment index, not a frosted top bar.
- Lists read like labeled swatches or ruled fields (Need / Who can act / When).
- Empty space is paper. Do not fill it.

### Spacing

- More space above a heading than below it.
- Swatch rows: tight within a family, loose between families.
- Caption box padding is small and even, like a drawn rectangle around existing text — the box is drawn after the words, not a padded chip.

## 7. Component language

Rebuild every control in this vocabulary. Do not drop in default buttons.

| Thing | How it looks |
| --- | --- |
| Primary action | A small ruled caption box, or a short dense wash chip with pencil label. Never a saturated pill. |
| Secondary action | Hairline box, paper fill, graphite text. |
| Input | A baseline rule, like a line on paper. Label sits above in pigment-code tracking. Focus = a slightly denser graphite rule, 2px, plus a visible focus ring for keyboard (`#42413f`). |
| Chip / tag | Mini horizontal wash, fade to paper, label to the right in pencil italic. |
| Divider | Paper gap, or a `#d7d5cf` hairline. Not a 1px `#e5e7eb` UI rule. |
| Card | Forbidden as a default. If a grouping is required, it is a sheet with a hairline, no shadow, no 16px radius. |
| Shadow | None. Depth is wash overlap and misregistration, not drop-shadow. |
| Radius | Wet-brush caps on swatch bars only (~999px on the short ends of a bar). Boxes are sharp or barely 1–2px. |
| Icon | Pencil-line, 1px, open. No medical crosses, no ribbons, no heart-hands, no sparkles. |
| Avatar | A small wash blot, not a photo circle. |
| Image | Authored wash, paper scan, or clearly synthetic illustration. No stock clasped-hands. No iPhone mock. |

## 8. Motion

Native motion of the world: a loaded brush touching paper.

- Hero wash enters along the stroke path and settles. 600–1200ms, ease-out, once.
- Granulation can tick in, never shimmer forever.
- Hover on a swatch: the fade extends a few pixels, or the note darkens. No lift, no scale-1.04, no glow.
- Page transitions: a new wash pulling across paper, not a fade-to-black and not a slide-up card.
- Respect `prefers-reduced-motion`: show the settled wash immediately.

## 9. Voice (on-surface copy)

- Therapeutic, not clinical. Social, not performative.
- Short. Assume the reader is exhausted.
- No "You've got this." No "You are not alone." No streak / points / community-count flex.
- No invented outcomes, prices, or testimonials.
- Demonstration content must be labeled synthetic if it could be mistaken for a real family.
- Outreach language is practical: a need, who can act, when. Example (synthetic): "Tuesday dinner — leave food on the porch."

## 10. Absolute bans

- Wellness costume: cream + sage + terracotta + soft serif + clasped hands
- Hospital / patient-portal chrome, medical icons, caduceus, awareness ribbons
- Feed / streak / badge gamification
- Glassmorphism, glow edges, neon, dark-mode-as-default
- Bento grids of equal cards
- Gradient text, underline-as-accent rainbows
- Fake reviews, fake user counts, fake clinical claims
- A second identity (stars, constellations-as-clipart, night-sky stock) unless it is literally a pigment note

Dark UI is not the default. The physical scene is a studio sheet in daylight / desk lamp. Paper is light. Night can appear as a single deep wash, not a dark theme.

## 11. Accessibility

Users may be depleted or interrupted.

- Body text contrast against `--paper` must hold at Graphite `#42413f` or darker. Do not set notes in `#b6b6b6` on paper.
- Do not rely on granulation or wash hue to signal state.
- Focus must be visible (graphite ring), even if the aesthetic focus is a darker rule.
- Motion is optional. Content is visible in the first frame.
- Do not assume one household type in imagery or copy.

## 12. How to start a surface

- Read `PRODUCT.md`.
- Open `.impeccable/references/value-study.webp` and `.impeccable/references/swatch-sheet.jpg`.
- Put one wash on the fold at real scale. Letter the name in a ruled box. Annotate. Stop. If that frame could be swapped for a generic wellness moodboard, it is wrong.
- Stack is static HTML/CSS unless the user changes it.
- Do not write `DESIGN.md` until a surface has actually been built; this file is the pre-build reference.

Seed key (for Impeccable continuity only): `ea52837f`. Mode of the original board: Experience.
