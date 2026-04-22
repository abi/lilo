# Lunar Architect — Design System

## Fonts
- **Headings/Display:** Space Grotesk (300–700)
- **Body/UI:** Manrope (300–700)

## Border Radius
`0px` — no exceptions.

## Colors

### Light Mode (default)
| Token | Value |
|---|---|
| `surface` | `#fbf9f6` |
| `surface-container-low` | `#f1eeea` |
| `surface-container` | `#e9e6e2` |
| `surface-container-high` | `#dfdcd8` |
| `surface-container-highest` | `#d2cfcb` |
| `surface-bright` | `#cac7c3` |
| `primary` | `#2e5bff` |
| `primary-container` | `#2e5bff` |
| `on-primary-container` | `#ffffff` |
| `secondary-container` | `#343d96` |
| `tertiary` | `#0e8fa3` |
| `on-surface` | `#1a1c20` |
| `on-surface-variant` | `#44464f` |
| `outline` | `#74767e` |
| `outline-variant` | `rgba(116,118,126,0.18)` |

### Dark Mode
| Token | Value |
|---|---|
| `surface` | `#10141a` |
| `surface-container-low` | `#181c22` |
| `surface-container` | `#1c2026` |
| `surface-container-high` | `#262a30` |
| `surface-container-highest` | `#31353c` |
| `surface-bright` | `#353940` |
| `primary` | `#7da1ff` |
| `primary-container` | `#2e5bff` |
| `on-primary-container` | `#efefff` |
| `on-primary-fixed-variant` | `#0035be` |
| `secondary-container` | `#343d96` |
| `tertiary` | `#44d8f1` |
| `on-surface` | `#dfe2eb` |
| `on-surface-variant` | `#c4c5d9` |
| `outline` | `#8e9099` |
| `outline-variant` | `rgba(142,144,153,0.15)` |

## Spacing (8px grid)
`4 · 8 · 16 · 24 · 32 · 48 · 64 · 80 · 128`

## Rules
- **No borders** for sectioning — use tonal stepping (shift between surface tiers)
- **No dividers** — use gaps (24/32/48px) or background color changes
- **Ghost borders** for inputs only: `outline-variant`, felt not seen
- **Primary CTAs:** `linear-gradient(45deg, primary-container, secondary-container)`
- **Shadows:** rare, cobalt-tinted (`#0035be` at 8% opacity, 24px blur)
- **Overlays:** 12px backdrop-blur + `surface-container` at 80% opacity
- **Hover (lists/cards):** instant (0ms) background shift to `surface-bright`
- **Transitions:** 150–200ms, ease-in-out (mechanical)
- **Labels:** use `tertiary` for telemetry/data feel
- **Body text:** `on-surface-variant` for secondary; `on-surface` for active reading