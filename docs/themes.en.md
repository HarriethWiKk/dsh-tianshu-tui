# Themes

16 built-in palettes, switchable anytime with `/theme` (no args opens the picker with the current theme marked ●) or `/theme <name>`. Custom themes: `/theme custom:<name>`.

## Built-in Themes

| Theme | Background | Description |
|---|---|---|
| `pastel` | dark | Gentle pastels. Anime-inspired, high-contrast, low-saturation multicolor cards. |
| `cyberpunk` | dark | Cyberpunk. Neon, extreme contrast, flashy. |
| `observatory` | dark | Five-element stars. Traditional Chinese five-element palette on a dark star-lord base. |
| `midnight` | dark | GitHub dark. Minimal neutral grays, crisp. |
| `starfield` | dark | Constellations. Rivet-native star-map aesthetics: sky-blue primary with nebula-purple accents. |
| `tianshu` | dark | Ink-black night. 95% ink gray with star-gold primary and cinnabar user accents; restrained. |
| `claude` | dark | Port of the official Claude Code TUI palette. Classic orange. |
| `ziwei` | dark | Ziwei star emperor. Cinnabar-red markers on imperial-purple accents, classical Chinese star-map aesthetics. |
| `slate` | dark | Calm slate gray. A single cool Teal primary, achromatic structure, low glare for long sessions. |
| `dawn` | dark | Dawn star morning. Cyan-blue borders, warm-gold titles, fog-gray body, close to the Tianshu splash. |
| `antigravity` | dark | Codex style. Cool cyan accent, bright gray structural text, modern and restrained. |
| `cobalt` | dark | Cobalt cool neutral (default style). oklch-blended with a crisp lightness ramp. |
| `graphite` | dark | Graphite ice-cyan (professional default). Neutral grays + a single ice-cyan accent; low-saturation semantic colors for long coding sessions. |
| `gemini` | dark | Gemini style. Nebula glow gradient (cool indigo + nebula purple) with aurora mint. |
| `paper` | light | Paper white. For light terminals; semantic colors deepened and brightened, indigo accent. |
| `light-ansi` | light | Light ANSI. A clean 16-color build that follows the terminal's own palette; light-background friendly. |

## Terminal Detection & Degradation

- **Auto detection**: on startup, dark/light background is chosen via auto theme detection.
- **16-color degradation**: terminals without truecolor automatically fall back to an ANSI 16-color mapping of the semantic colors.
- **ASCII degradation**: on legacy terminals, emoji icons (`📁` etc.) degrade to ASCII (`~`) for stable width.
- No rendering breaks at any terminal width: narrow widths drop minor segments progressively; extreme narrow truncates the model segment.

## Custom Themes

`/theme custom:<name>` uses a custom palette. Definitions live in `src/theme-palettes.ts` (semantic tokens → color values + background + description). `description` is the single source of truth for the `/theme` picker — new themes must carry one.

## Themes & Readability

- Semantic colors (primary/secondary/success/warning/error/dim/muted, etc.) keep tool cards, red/green diffs, approval cards, and panels readable under any theme.
- Dim-level information (reasoning channels, turn summaries, subagent terminal lines) stays legible on light themes too.
