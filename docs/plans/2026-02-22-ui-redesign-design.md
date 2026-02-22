# UI Redesign: Deep Focus

**Date**: 2026-02-22
**Status**: Approved
**Approach**: Deep Focus — dark atmosphere with motion-driven personality, CSS-only

## Summary

Transform the app from generic white corporate UI to an immersive dark "night-owl workspace" aesthetic. Personality comes through micro-interactions and motion (hover lifts, smooth transitions, animated progress) — all CSS, no animation libraries. The live session pages go deeper/bluer; management pages use a softer dark slate.

## Structural Changes

- **Home page**: Change from Dashboard (`/`) to Recall Sets. Dashboard moves to `/dashboard`.
- **Nav order**: Recall Sets (home) → Sessions → Dashboard (renamed "Stats" or kept as "Dashboard")
- **Nav icons**: Replace emojis with Lucide SVG icons (`BookOpen`, `Clock`, `BarChart3`)

## Color System

### Management Pages (Recall Sets, Sessions, Set Detail, Create Set)

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Page background | `slate-900` | `#0f172a` | Base background |
| Card surface | `slate-800/60` | `#1e293b` at 60% | Card backgrounds |
| Card border | `slate-700/50` | `#334155` at 50% | Default card borders |
| Card hover border | `clarity-500/30` | `#0ea5e9` at 30% | Hover state |
| Heading text | `slate-50` | `#f8fafc` | Primary headings |
| Body text | `slate-300` | `#cbd5e1` | Paragraphs, descriptions |
| Muted text | `slate-500` | `#64748b` | Labels, secondary info |
| Accent | `clarity-500` | `#0ea5e9` | Interactive, active, progress |
| Accent hover | `clarity-400` | `#38bdf8` | Hover states on accent |
| Due/warning | `amber-400` | `#fbbf24` | Due points, attention |
| Success | `emerald-400` | `#34d399` | Caught up, positive |
| Error | `red-400` | `#f87171` | Errors, destructive |

### Session Pages (Live Session, Start Session)

| Role | Value | Usage |
|------|-------|-------|
| Background start | `slate-950` / `#020617` | Gradient from |
| Background end | `#0c1929` | Gradient to (deep navy) |
| Surfaces | More transparent than management | Closer to current approach |

### Sidebar

| Role | Value | Usage |
|------|-------|-------|
| Background | `slate-950` / `#020617` | Darker than page content |
| Border | `slate-800/50` | Subtle right divider |
| Active text | `white` | Active nav item |
| Inactive text | `slate-400` | Inactive nav items |
| Hover text | `slate-200` | Hover on inactive |
| Active indicator | `clarity-500` left border (3px) | Active state |

## Sidebar Design

- **Logo**: Clean typography — "Contextual" in white, "Clarity" in `clarity-500`. No background square.
- **Icons**: Lucide SVG icons, consistent 20px size, `stroke-width: 1.5`
- **Active state**: 3px left border in `clarity-500` + white text. `transition-all duration-200`.
- **Hover**: Text brightens `slate-400` → `slate-200`, subtle `bg-slate-800/50` background. `transition-colors duration-150`.
- **Footer**: Version in `slate-600`.
- **Mobile**: Same overlay behavior, dark backdrop, close button.

## Recall Sets Page (New Home `/`)

- **Header**: "Recall Sets" in white `text-2xl font-semibold`, subtitle in `slate-400`, "+ New Set" button accent-colored
- **Filter bar**: Horizontal pills. Active: `clarity-500` text + bottom border. Inactive: `slate-400`.
- **Card grid**: 1/2/3 cols responsive. `bg-slate-800/60 border border-slate-700/50 rounded-xl`.
- **Card hover**: `translateY(-2px)` + border → `clarity-500/30`. `transition-all duration-200`.
- **Card content**: Name in white, description in `slate-400`, stats row (due in `amber-400`), full-width "Start Session" button.
- **Ordering**: Due sets first (sorted by `duePoints` desc), then caught-up sets below with a `slate-600` divider label.

## Motion System (All CSS)

### Page-level
- Route changes: Content fades in `opacity 0→1` + `translateY(8px→0)` over 300ms. Uses existing `animate-fade-in`.

### Cards
- Hover: `translateY(-2px)` + border-color transition. `transition-all duration-200 ease-out`.
- Active/click: `scale(0.98)` — press feedback.

### Buttons
- Hover: Background shift + `translateY(-1px)`.
- Active: `scale(0.97)` snap.

### Progress bars
- Fill: `transition-all duration-700 ease-out` on width. Gradient fill `clarity-500` → `clarity-400`.

### Sidebar nav
- Active border: `transition-all duration-200`.
- Hover text: `transition-colors duration-150`.

### Toasts
- Slide in: `translateX(100%)→0` + `opacity 0→1`.

## Page-by-Page Treatment

### Dashboard (`/dashboard`)
- Same dark management treatment
- StatCards: `bg-slate-800/60` with colored accent top bars
- Charts (recharts): Dark theme — `slate-700` grid, `clarity-400` data, dark tooltips

### Recall Set Detail (`/recall-sets/:id`)
- Dark card surfaces for stats, point list, session history
- Table: Dark even-row striping `slate-800/40`
- Inline forms: `bg-slate-800 border-slate-700 text-white`

### Sessions (`/sessions`)
- Dark surface cards
- Recall rate badges: green > 80%, amber 50-80%, red < 50%

### Session Replay (`/sessions/:id`)
- Dark background, transcript styled like live session
- Colored borders for evaluation markers (green correct, red incorrect)
- `clarity-500` rabbithole markers

### Create Recall Set (`/recall-sets/new`)
- Dark form inputs: `bg-slate-800 border-slate-700 text-white placeholder:text-slate-500`
- Focus: `ring-clarity-500`

### Live Session (mostly unchanged)
- Keep existing dark gradient, animations, phase transitions
- Adjust to deeper palette if needed for consistency

### Not Found
- Dark, centered. Large `slate-600` "404", `slate-400` message.

## Typography

- System font stack (keep — fast, familiar)
- Weight contrast: `font-semibold` (600) for headings in white, `font-normal` (400) body in `slate-300`
- Aggressive de-emphasis: secondary text in `slate-500`
- `leading-relaxed` for body text (breathing room on dark backgrounds)

## What's NOT Changing

- Component architecture (same components, same props)
- Data fetching, hooks, API layer
- Responsive breakpoints and mobile behavior
- Accessibility (focus rings, touch targets, aria labels)
- Live session interaction model (single-exchange view, voice input, phases)
