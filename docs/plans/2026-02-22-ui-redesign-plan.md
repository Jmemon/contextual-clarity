# UI Redesign: Deep Focus — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the app from generic white corporate UI to an immersive dark "night-owl workspace" with motion-driven personality.

**Architecture:** Pure CSS/Tailwind reskin — no new animation libraries. Update Tailwind config with dark palette tokens, reskin all UI primitives (Button, Card, Badge, etc.), update layout and all pages. Install `lucide-react` for SVG nav icons. Change home route from Dashboard to Recall Sets.

**Tech Stack:** Tailwind CSS, React, lucide-react (new dep for icons)

**Design doc:** `docs/plans/2026-02-22-ui-redesign-design.md`

---

## Task 1: Install lucide-react and update Tailwind config

**Files:**
- Modify: `web/package.json` (via bun add)
- Modify: `web/tailwind.config.js`
- Modify: `web/src/index.css`

**Step 1: Install lucide-react**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity/web && bun add lucide-react`

**Step 2: Update tailwind.config.js — add dark palette tokens and enhanced animations**

Replace the entire `theme.extend` block in `web/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],

  theme: {
    extend: {
      colors: {
        clarity: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'user-flash': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '50%': { opacity: '0.7', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-16px)' },
        },
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 300ms ease-out',
        'user-flash': 'user-flash 400ms ease-out forwards',
        'cursor-blink': 'cursor-blink 1s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};
```

Note: The color palette stays the same — the dark theme comes from using `slate-*` Tailwind defaults directly in components, not from custom tokens. This keeps things simple.

**Step 3: Update index.css — dark body defaults**

Replace the `@layer base` section in `web/src/index.css`:

```css
@layer base {
  html {
    scroll-behavior: smooth;
  }

  body {
    @apply antialiased bg-slate-900 text-slate-300;
  }
}
```

Update `@layer components` for dark button variants:

```css
@layer components {
  .btn {
    @apply px-4 py-2 rounded-lg font-medium transition-all duration-200;
  }

  .btn-primary {
    @apply btn bg-clarity-600 text-white hover:bg-clarity-500;
  }

  .btn-secondary {
    @apply btn bg-slate-700 text-slate-200 hover:bg-slate-600;
  }
}
```

**Step 4: Verify the app still loads**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity/web && bun run dev &` — open in browser, confirm dark background appears.

**Step 5: Commit**

```bash
git add web/package.json web/bun.lockb web/tailwind.config.js web/src/index.css
git commit -m "feat: dark theme foundation — Tailwind config, dark body, lucide-react"
```

---

## Task 2: Reskin core UI primitives — Button, Card, Badge, Spinner, Progress

**Files:**
- Modify: `web/src/components/ui/Button.tsx`
- Modify: `web/src/components/ui/Card.tsx`
- Modify: `web/src/components/ui/Badge.tsx`
- Modify: `web/src/components/ui/Spinner.tsx`
- Modify: `web/src/components/ui/Progress.tsx`

**Step 1: Update Button.tsx variant classes**

Replace the `variantClasses` object:

```ts
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-clarity-600 text-white hover:bg-clarity-500 hover:-translate-y-px focus:ring-clarity-500 disabled:bg-clarity-600/40 disabled:text-white/50',
  secondary:
    'bg-slate-700 text-slate-200 hover:bg-slate-600 hover:-translate-y-px focus:ring-slate-500 border border-slate-600 disabled:bg-slate-800 disabled:text-slate-500',
  danger:
    'bg-red-600 text-white hover:bg-red-500 hover:-translate-y-px focus:ring-red-500 disabled:bg-red-600/40 disabled:text-white/50',
  ghost:
    'bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus:ring-slate-500 disabled:text-slate-600',
};
```

Also in Button.tsx, change `transition-all duration-150` to `transition-all duration-200` in the button className, and change `active:scale-[0.98]` to `active:scale-[0.97]`.

**Step 2: Update Card.tsx for dark surfaces**

Replace Card component classes:

```tsx
// Card container
className={`
  bg-slate-800/60
  rounded-xl
  border border-slate-700/50
  overflow-hidden
  transition-all duration-200
  ${className}
`.trim()}
```

Replace CardHeader classes:

```tsx
className={`
  px-4 sm:px-6 py-3 sm:py-4
  border-b border-slate-700/50
  font-semibold text-slate-100
  ${className}
`.trim()}
```

Replace CardBody — no change needed (just padding, no colors).

Replace CardFooter classes:

```tsx
className={`
  px-4 sm:px-6 py-3 sm:py-4
  border-t border-slate-700/50
  ${className}
`.trim()}
```

**Step 3: Update Badge.tsx for dark variants**

Replace `statusClasses`:

```ts
const statusClasses: Record<BadgeStatus, string> = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};
```

**Step 4: Update Spinner.tsx for dark theme**

In Spinner component, change:
- `border-clarity-200` → `border-slate-700`
- `border-t-clarity-600` → `border-t-clarity-400`

**Step 5: Update Progress.tsx for dark theme**

Replace `variantClasses`:

```ts
const variantClasses: Record<ProgressVariant, string> = {
  primary: 'bg-gradient-to-r from-clarity-600 to-clarity-400',
  success: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
  warning: 'bg-gradient-to-r from-amber-600 to-amber-400',
  error: 'bg-gradient-to-r from-red-600 to-red-400',
};
```

Change the track `bg-gray-200` → `bg-slate-700`.
Change label `text-gray-700` → `text-slate-300`.
Change value `text-gray-500` → `text-slate-400`.
Change `transition-all duration-300` → `transition-all duration-700 ease-out`.

**Step 6: Commit**

```bash
git add web/src/components/ui/Button.tsx web/src/components/ui/Card.tsx web/src/components/ui/Badge.tsx web/src/components/ui/Spinner.tsx web/src/components/ui/Progress.tsx
git commit -m "feat: dark theme UI primitives — Button, Card, Badge, Spinner, Progress"
```

---

## Task 3: Reskin remaining UI primitives — Input, Select, Textarea, Table, Modal, Toast

**Files:**
- Modify: `web/src/components/ui/Input.tsx`
- Modify: `web/src/components/ui/Select.tsx`
- Modify: `web/src/components/ui/Textarea.tsx`
- Modify: `web/src/components/ui/Table.tsx`
- Modify: `web/src/components/ui/Modal.tsx`
- Modify: `web/src/components/ui/Toast.tsx`

**Step 1: Update Input.tsx**

Replace all light-theme classes:
- Label: `text-gray-700` → `text-slate-300`
- Input normal: `text-gray-900` → `text-white`, `placeholder-gray-400` → `placeholder-slate-500`
- Add to input: `bg-slate-800`
- Border normal: `border-gray-300` → `border-slate-600`
- Focus normal: `focus:border-clarity-500 focus:ring-clarity-200` → `focus:border-clarity-500 focus:ring-clarity-500/20`
- Error border/ring: `border-red-500 focus:ring-red-200` → `border-red-500 focus:ring-red-500/20`
- Disabled: `disabled:bg-gray-100 disabled:text-gray-500` → `disabled:bg-slate-900 disabled:text-slate-600`
- Error text: `text-red-600` → `text-red-400`
- Helper text: `text-gray-500` → `text-slate-500`

**Step 2: Update Select.tsx**

Same pattern as Input:
- Label: `text-gray-700` → `text-slate-300`
- Select: `text-gray-900` → `text-white`, add `bg-slate-800`
- Remove `bg-white`
- Border: `border-gray-300` → `border-slate-600`
- Focus: `focus:ring-clarity-200` → `focus:ring-clarity-500/20`
- Error: `focus:ring-red-200` → `focus:ring-red-500/20`
- Disabled: `disabled:bg-gray-100 disabled:text-gray-500` → `disabled:bg-slate-900 disabled:text-slate-600`
- Arrow icon: `text-gray-400` → `text-slate-500`
- Error text: `text-red-600` → `text-red-400`
- Helper text: `text-gray-500` → `text-slate-500`

**Step 3: Update Textarea.tsx**

Same pattern as Input:
- Label: `text-gray-700` → `text-slate-300`
- Textarea: `text-gray-900` → `text-white`, `placeholder-gray-400` → `placeholder-slate-500`, add `bg-slate-800`
- Border: `border-gray-300` → `border-slate-600`
- Focus: `focus:ring-clarity-200` → `focus:ring-clarity-500/20`
- Error focus: `focus:ring-red-200` → `focus:ring-red-500/20`
- Disabled: `disabled:bg-gray-100 disabled:text-gray-500` → `disabled:bg-slate-900 disabled:text-slate-600`
- Error text: `text-red-600` → `text-red-400`
- Helper text: `text-gray-500` → `text-slate-500`

**Step 4: Update Table.tsx**

- Scrollbar: `scrollbar-thumb-gray-300 scrollbar-track-gray-100` → `scrollbar-thumb-slate-600 scrollbar-track-slate-800`
- TableHeader: `bg-gray-50 border-b border-gray-200` → `bg-slate-800/80 border-b border-slate-700/50`
- TableBody: `divide-gray-200` → `divide-slate-700/50`
- TableRow hover: `hover:bg-gray-50` → `hover:bg-slate-800/50`
- TableHead: `text-gray-600` → `text-slate-400`
- TableCell: `text-gray-900` → `text-slate-200`

**Step 5: Update Modal.tsx**

- Overlay: `bg-black/50` → `bg-black/70` (darker for contrast against dark bg)
- Dialog: `bg-white` → `bg-slate-800`
- Header border: `border-gray-200` → `border-slate-700/50`
- Title: `text-gray-900` → `text-slate-100`
- Close button: `text-gray-400 hover:text-gray-600` → `text-slate-500 hover:text-slate-300`
- `hover:bg-black/5` → `hover:bg-slate-700/50`

**Step 6: Update Toast.tsx**

Replace `typeStyles`:

```ts
const typeStyles: Record<ToastType, string> = {
  success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  error: 'bg-red-500/20 border-red-500/30 text-red-300',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
  info: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
};
```

Replace `iconColors`:

```ts
const iconColors: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};
```

Change dismiss button: `hover:bg-black/5` → `hover:bg-white/10`.

**Step 7: Commit**

```bash
git add web/src/components/ui/Input.tsx web/src/components/ui/Select.tsx web/src/components/ui/Textarea.tsx web/src/components/ui/Table.tsx web/src/components/ui/Modal.tsx web/src/components/ui/Toast.tsx
git commit -m "feat: dark theme forms, table, modal, toast"
```

---

## Task 4: Reskin utility UI — StatCard, EmptyState, ErrorState, LoadingState

**Files:**
- Modify: `web/src/components/ui/StatCard.tsx`
- Modify: `web/src/components/ui/EmptyState.tsx`
- Modify: `web/src/components/ui/ErrorState.tsx` (if it exists standalone)
- Modify: `web/src/components/ui/LoadingState.tsx` (if it exists standalone)

**Step 1: Update StatCard.tsx**

Replace container classes:
- `bg-white` → `bg-slate-800/60`
- `border-gray-200` → `border-slate-700/50`
- `shadow-md` → remove (dark surfaces don't need shadow)
- `hover:shadow-lg` → `hover:border-slate-600 hover:-translate-y-0.5`

Replace text classes:
- Label: `text-gray-500` → `text-slate-400`
- Value: `text-gray-900` → `text-slate-50`
- Trend up: `text-green-600` → `text-emerald-400`
- Trend down: `text-red-600` → `text-red-400`
- Trend neutral: `text-gray-500` → `text-slate-500`
- Icon bg: `bg-clarity-100 text-clarity-600` → `bg-clarity-500/20 text-clarity-400`

**Step 2: Update EmptyState.tsx**

- Icon: `text-gray-400` → `text-slate-600`
- Title: `text-gray-900` → `text-slate-200`
- Description: `text-gray-500` → `text-slate-400`

**Step 3: Update ErrorState.tsx**

Read the file first, then apply same pattern:
- Red icon stays red but lighter shade: `text-red-500` → `text-red-400`
- Title: `text-gray-900` → `text-slate-200`
- Message: `text-gray-500` → `text-slate-400`

**Step 4: Update LoadingState.tsx**

- Message: `text-gray-500` → `text-slate-400`

**Step 5: Commit**

```bash
git add web/src/components/ui/StatCard.tsx web/src/components/ui/EmptyState.tsx web/src/components/ui/ErrorState.tsx web/src/components/ui/LoadingState.tsx
git commit -m "feat: dark theme StatCard, EmptyState, ErrorState, LoadingState"
```

---

## Task 5: Redesign MainLayout and sidebar

**Files:**
- Modify: `web/src/layouts/MainLayout.tsx`

**Step 1: Replace emoji nav with Lucide icons and reorder**

Add imports at the top:

```tsx
import { BookOpen, Clock, BarChart3 } from 'lucide-react';
```

Replace `NAV_ITEMS` with new order and Lucide icon components:

```tsx
const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Recall Sets', icon: 'book-open' },
  { path: '/sessions', label: 'Sessions', icon: 'clock' },
  { path: '/dashboard', label: 'Dashboard', icon: 'bar-chart' },
];
```

Update the `NavItem` type — `icon` changes from emoji string to an icon key. Or simpler: store the component reference:

```tsx
import { BookOpen, Clock, BarChart3, type LucideIcon } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  Icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Recall Sets', Icon: BookOpen },
  { path: '/sessions', label: 'Sessions', Icon: Clock },
  { path: '/dashboard', label: 'Dashboard', Icon: BarChart3 },
];
```

**Step 2: Update NavItemLink to use Lucide icons + dark styling**

```tsx
function NavItemLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-all duration-200 min-h-[44px] ${
          isActive
            ? 'text-white border-l-[3px] border-clarity-500 bg-slate-800/50 ml-0 pl-[13px]'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        } focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-inset`
      }
    >
      <item.Icon className="w-5 h-5" strokeWidth={1.5} />
      <span>{item.label}</span>
    </NavLink>
  );
}
```

**Step 3: Update Logo component for dark theme**

```tsx
function Logo() {
  return (
    <div className="flex items-center gap-3 px-4 py-6 border-b border-slate-800/50">
      <div>
        <h1 className="text-lg font-semibold text-white">
          Contextual
        </h1>
        <p className="text-sm text-clarity-400 -mt-1">
          Clarity
        </p>
      </div>
    </div>
  );
}
```

**Step 4: Update MobileHeader for dark theme**

```tsx
function MobileHeader({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-950 border-b border-slate-800/50 px-4 py-3 flex items-center justify-between">
      <button
        type="button"
        onClick={onMenuToggle}
        className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-offset-2 focus:ring-offset-slate-950 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Open navigation menu"
      >
        <HamburgerIcon />
      </button>

      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">Contextual</span>
        <span className="font-semibold text-clarity-400">Clarity</span>
      </div>

      <div className="w-[44px]" aria-hidden="true" />
    </header>
  );
}
```

**Step 5: Update main layout container and sidebar colors**

In the `MainLayout` return:

- Root div: `bg-clarity-50` → `bg-slate-900`
- Backdrop: keep `bg-black/50` (fine for dark)
- Sidebar aside: `bg-white border-r border-clarity-200` → `bg-slate-950 border-r border-slate-800/50`
- Close button: `text-clarity-600 hover:bg-clarity-50 hover:text-clarity-800` → `text-slate-400 hover:bg-slate-800 hover:text-slate-200`
- Footer: `border-clarity-200` → `border-slate-800/50`, `text-clarity-400` → `text-slate-600`

**Step 6: Commit**

```bash
git add web/src/layouts/MainLayout.tsx
git commit -m "feat: dark sidebar with Lucide icons, reordered nav"
```

---

## Task 6: Update router — Recall Sets as home, Dashboard at /dashboard

**Files:**
- Modify: `web/src/router.tsx`

**Step 1: Swap routes**

Change the route config so:
- `/` renders `<RecallSets />` (was `<Dashboard />`)
- `/dashboard` renders `<Dashboard />` (new route)
- Keep `/recall-sets` as a redirect or second path to RecallSets (or remove it — users access sets from `/`)

Actually the simplest approach: just swap which component renders at `/`:

```tsx
const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      {
        path: '/',
        element: <RecallSets />,
      },
      {
        path: '/dashboard',
        element: <Dashboard />,
      },
      {
        path: '/recall-sets/new',
        element: <CreateRecallSet />,
      },
      {
        path: '/recall-sets/:id',
        element: <RecallSetDetail />,
      },
      {
        path: '/sessions',
        element: <Sessions />,
      },
      {
        path: '/sessions/:id',
        element: <SessionReplay />,
      },
    ],
  },
  {
    path: '/session',
    element: <LiveSession />,
  },
  {
    path: '/session/:id',
    element: <LiveSession />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);
```

Remove the separate `/recall-sets` route (it's now `/`). Keep `/recall-sets/:id` and `/recall-sets/new`.

**Step 2: Update any internal links that reference `/recall-sets`**

Search all files for `to="/recall-sets"` or `href="/recall-sets"` and change to `to="/"`. Key files:
- `web/src/pages/NotFound.tsx` — "Recall Sets" link
- `web/src/components/dashboard/UpcomingReviewsCard.tsx` — if it links to recall sets
- Any other navigation references

Keep links to `/recall-sets/:id` and `/recall-sets/new` — those are still valid.

**Step 3: Commit**

```bash
git add web/src/router.tsx
git commit -m "feat: Recall Sets as home page, Dashboard moved to /dashboard"
```

---

## Task 7: Reskin Recall Sets page (now home `/`) and RecallSetCard

**Files:**
- Modify: `web/src/pages/RecallSets.tsx`
- Modify: `web/src/components/recall-sets/RecallSetCard.tsx`
- Modify: `web/src/components/recall-sets/RecallSetFilters.tsx`

**Step 1: Update RecallSets.tsx page**

All `text-clarity-800` → `text-white`, `text-clarity-600` → `text-slate-400`.

Loading/error states: already use Spinner/EmptyState/Button which are now dark.

Page wrapper: keep `p-4 sm:p-6 lg:p-8` (the `bg-slate-900` comes from body/MainLayout).

**Step 2: Add due-first ordering**

In the `filteredSets` useMemo, after filtering, sort by due points descending:

```ts
const filteredSets = useMemo(() => {
  if (!recallSets) return [];

  const filtered = filter === 'all'
    ? recallSets
    : recallSets.filter((set) => set.status === filter);

  // Sort: sets with due points first (desc), then by name
  return [...filtered].sort((a, b) => {
    const aDue = a.summary.duePoints;
    const bDue = b.summary.duePoints;
    if (aDue > 0 && bDue === 0) return -1;
    if (aDue === 0 && bDue > 0) return 1;
    if (aDue > 0 && bDue > 0) return bDue - aDue;
    return a.name.localeCompare(b.name);
  });
}, [recallSets, filter]);
```

**Step 3: Update RecallSetFilters.tsx**

- Container: `bg-gray-100` → `bg-slate-800/60`
- Selected tab: `bg-white text-clarity-700 shadow-sm` → `bg-slate-700 text-white`
- Unselected: `text-gray-600 hover:text-gray-900 hover:bg-gray-50` → `text-slate-400 hover:text-slate-200 hover:bg-slate-700/50`
- Count badge selected: `bg-clarity-100 text-clarity-700` → `bg-clarity-500/20 text-clarity-400`
- Count badge unselected: `bg-gray-200 text-gray-600` → `bg-slate-700 text-slate-400`

**Step 4: Update RecallSetCard.tsx**

Since RecallSetCard uses Card (now dark), it inherits dark surface. Update text colors:
- Title: `text-gray-900` → `text-slate-100`, hover: `group-hover:text-clarity-700` → `group-hover:text-clarity-400`
- Description: `text-gray-600` → `text-slate-400`
- Stats labels: `text-gray-500` → `text-slate-500`
- Stats values: `text-gray-900` → `text-slate-200`
- Due points: `text-amber-600` → `text-amber-400`
- New points: `text-blue-600` → `text-blue-400`
- Card hover: `group-hover:border-clarity-400 group-hover:shadow-lg group-hover:-translate-y-0.5` → `group-hover:border-clarity-500/30 group-hover:-translate-y-0.5`
- Focus ring offset: add `focus:ring-offset-slate-900`

**Step 5: Commit**

```bash
git add web/src/pages/RecallSets.tsx web/src/components/recall-sets/RecallSetCard.tsx web/src/components/recall-sets/RecallSetFilters.tsx
git commit -m "feat: dark Recall Sets home page with due-first ordering"
```

---

## Task 8: Reskin Dashboard page and its components

**Files:**
- Modify: `web/src/pages/Dashboard.tsx`
- Modify: `web/src/components/dashboard/OverviewStats.tsx`
- Modify: `web/src/components/dashboard/StreakDisplay.tsx`
- Modify: `web/src/components/dashboard/DuePointsCard.tsx`
- Modify: `web/src/components/dashboard/RecentSessionsList.tsx`
- Modify: `web/src/components/dashboard/UpcomingReviewsCard.tsx`

**Step 1: Update Dashboard.tsx**

- Heading: `text-clarity-800` → `text-white`
- Subtitle: `text-clarity-600` → `text-slate-400`
- Section heading: `text-clarity-700` → `text-slate-200`
- Error icon bg: `bg-red-100` → `bg-red-500/20`
- Error icon: `text-red-600` → `text-red-400`
- Error title: `text-gray-900` → `text-slate-200`
- Error message: `text-gray-500` → `text-slate-400`
- Loading text: `text-gray-500` → `text-slate-400`

**Step 2: Update each dashboard component**

For each file, apply the dark theme pattern. Read each file and replace:
- `bg-white` → remove (parent Card handles it) or use `bg-slate-800/60`
- `text-gray-900` → `text-slate-100` or `text-white`
- `text-gray-700` → `text-slate-300`
- `text-gray-600` → `text-slate-400`
- `text-gray-500` → `text-slate-400` or `text-slate-500`
- `text-gray-400` → `text-slate-500`
- `text-gray-300` → `text-slate-600`
- `border-gray-200` → `border-slate-700/50`
- `border-gray-100` → `border-slate-800/50`
- `hover:bg-gray-50` → `hover:bg-slate-800/50`
- `text-green-600` → `text-emerald-400`
- `text-amber-600` → `text-amber-400`
- `text-red-600` → `text-red-400`
- `text-blue-600` → `text-blue-400`
- `text-orange-500` → `text-orange-400`
- `text-clarity-600` → `text-clarity-400`
- `hover:text-clarity-700` → `hover:text-clarity-300`

**Step 3: Commit**

```bash
git add web/src/pages/Dashboard.tsx web/src/components/dashboard/
git commit -m "feat: dark Dashboard and all dashboard components"
```

---

## Task 9: Reskin Sessions page, SessionReplay, and session components

**Files:**
- Modify: `web/src/pages/Sessions.tsx`
- Modify: `web/src/pages/SessionReplay.tsx`
- Modify: `web/src/components/sessions/SessionFilters.tsx`
- Modify: `web/src/components/sessions/SessionTable.tsx`
- Modify: `web/src/components/session-replay/TranscriptMessage.tsx`
- Modify: `web/src/components/session-replay/EvaluationMarker.tsx` (if exists)
- Modify: `web/src/components/session-replay/RabbitholeMarker.tsx` (if exists)
- Modify: `web/src/components/session-replay/SessionSummary.tsx` (if exists)

**Step 1: Update Sessions.tsx**

Apply same dark pattern:
- `text-gray-800` → `text-white`
- `text-gray-600` → `text-slate-400`
- All pagination text: `text-gray-600` → `text-slate-400`
- Font medium spans stay

**Step 2: Update SessionFilters.tsx**

Read the file, then apply:
- Same filter pill pattern as RecallSetFilters dark treatment
- Input backgrounds: dark
- Labels: `text-slate-300`

**Step 3: Update SessionTable.tsx**

Read the file. It likely uses Table component (already dark). Update any remaining:
- Recall rate colors: `text-green-600` → `text-emerald-400`, `text-amber-600` → `text-amber-400`, `text-red-600` → `text-red-400`
- Text: `text-gray-*` → `text-slate-*` pattern

**Step 4: Update SessionReplay page and components**

Read `SessionReplay.tsx` and each replay component. Apply dark pattern:
- TranscriptMessage: User bubble `bg-blue-500` stays. Assistant bubble `bg-gray-200 text-gray-900` → `bg-slate-800 text-slate-200`. System: `bg-gray-100 text-gray-600` → `bg-slate-800/50 text-slate-400`. Timestamps similarly.
- EvaluationMarker/RabbitholeMarker: Update any gray references.
- SessionSummary: Same dark pattern.

**Step 5: Commit**

```bash
git add web/src/pages/Sessions.tsx web/src/pages/SessionReplay.tsx web/src/components/sessions/ web/src/components/session-replay/
git commit -m "feat: dark Sessions, SessionReplay, and all session components"
```

---

## Task 10: Reskin RecallSetDetail page and its components

**Files:**
- Modify: `web/src/pages/RecallSetDetail.tsx`
- Modify: `web/src/components/recall-set-detail/SetHeader.tsx`
- Modify: `web/src/components/recall-set-detail/StatsOverview.tsx`
- Modify: `web/src/components/recall-set-detail/PointStatusBreakdown.tsx`
- Modify: `web/src/components/recall-set-detail/RecallRateChart.tsx`
- Modify: `web/src/components/recall-set-detail/PointsList.tsx`
- Modify: `web/src/components/recall-set-detail/SessionHistoryTable.tsx`

**Step 1: Update RecallSetDetail.tsx page**

Read the file. Apply dark pattern to all text/background references.

**Step 2: Update each detail component**

For each file, read and apply the dark mapping. Key specifics:
- Charts (recharts): Set `stroke` colors to `slate-700` for grid, `clarity-400` for data lines, tooltips with `bg-slate-800 text-slate-200 border-slate-700`
- PointsList: Table rows with dark striping. Inline edit forms use dark inputs.
- SetHeader: Title `text-white`, description `text-slate-400`

**Step 3: Commit**

```bash
git add web/src/pages/RecallSetDetail.tsx web/src/components/recall-set-detail/
git commit -m "feat: dark RecallSetDetail and all detail components"
```

---

## Task 11: Reskin CreateRecallSet page and form components

**Files:**
- Modify: `web/src/pages/CreateRecallSet.tsx`
- Modify: `web/src/components/forms/RecallSetForm.tsx` (if exists)
- Modify: `web/src/components/forms/RecallPointForm.tsx` (if exists)
- Modify: `web/src/components/forms/DeleteConfirmModal.tsx` (if exists)

**Step 1: Update CreateRecallSet.tsx**

Read the file. Apply dark pattern to page wrapper and any direct styling.

**Step 2: Update form components**

Read each form file. They likely use Input/Textarea/Select/Button which are already dark. Just update any remaining text color references:
- Labels and headers: use `text-slate-200` or `text-white`
- Descriptions: `text-slate-400`

**Step 3: Commit**

```bash
git add web/src/pages/CreateRecallSet.tsx web/src/components/forms/
git commit -m "feat: dark CreateRecallSet and form components"
```

---

## Task 12: Reskin LiveSession page and components (touch-ups)

**Files:**
- Modify: `web/src/pages/LiveSession.tsx` (minor — already dark)
- Modify: `web/src/components/live-session/SessionContainer.tsx` (verify alignment)
- Modify: `web/src/components/live-session/VoiceInput.tsx` (verify)
- Modify: `web/src/components/live-session/SessionProgress.tsx` (verify)
- Other live-session components as needed

**Step 1: Review LiveSession.tsx**

The start session screen and live session already use dark gradients (`clarity-800` to `clarity-900`). Update to match the design doc's deeper palette:
- `from-clarity-800 to-clarity-900` → `from-slate-950 to-[#0c1929]`
- Header: `bg-clarity-900/50` → `bg-slate-950/70`
- Cards within: `bg-clarity-700/50` → `bg-slate-800/60`

**Step 2: Review SessionContainer.tsx**

Read the file and verify all color references align with the session dark palette. Main changes:
- Any `clarity-700/50` backgrounds → `slate-800/60`
- Any `clarity-900/50` → `slate-950/70`
- Buttons and accent colors keep `clarity-600/500`

**Step 3: Quick scan all live-session components**

Read each file in `web/src/components/live-session/` and update any remaining light-theme references. Most should already be dark.

**Step 4: Commit**

```bash
git add web/src/pages/LiveSession.tsx web/src/components/live-session/
git commit -m "feat: align LiveSession with deeper dark palette"
```

---

## Task 13: Reskin NotFound page and update stale links

**Files:**
- Modify: `web/src/pages/NotFound.tsx`

**Step 1: Update NotFound.tsx**

```tsx
export function NotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-9xl font-bold text-slate-800 mb-4">
          404
        </div>

        <h1 className="text-2xl font-bold text-white mb-4">
          Page Not Found
        </h1>

        <p className="text-slate-400 mb-2">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <p className="text-sm text-slate-500 mb-8">
          Attempted path: <code className="bg-slate-800 px-2 py-1 rounded text-slate-300">{location.pathname}</code>
        </p>

        <div className="space-y-4">
          <Link
            to="/"
            className="block w-full px-6 py-3 bg-clarity-600 text-white rounded-lg hover:bg-clarity-500 transition-all duration-200 font-medium"
          >
            Go Home
          </Link>

          <div className="flex justify-center gap-4 text-sm">
            <Link
              to="/sessions"
              className="text-clarity-400 hover:text-clarity-300 transition-colors"
            >
              Sessions
            </Link>
            <span className="text-slate-700">|</span>
            <Link
              to="/dashboard"
              className="text-clarity-400 hover:text-clarity-300 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-600">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/pages/NotFound.tsx
git commit -m "feat: dark NotFound page"
```

---

## Task 14: Visual QA pass — verify all pages in browser

**Step 1: Start dev server**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity/web && bun run dev`

**Step 2: Check each route visually**

Open each route in the browser and verify:
- `/` — Recall Sets (dark cards, due-first ordering, filter pills, hover effects)
- `/recall-sets/new` — Create form (dark inputs, labels in slate-300)
- `/recall-sets/:id` — Detail page (dark stats, dark charts, dark table)
- `/dashboard` — Dashboard (dark stat cards, dark components)
- `/sessions` — Sessions list (dark table, dark filters, dark pagination)
- `/sessions/:id` — Session replay (dark transcript)
- `/session` — Start session screen (deep dark gradient)
- `/session/:id` — Live session (verify alignment)
- `/nonexistent` — 404 page (dark)

**Step 3: Check sidebar**

- Lucide icons render correctly
- Active indicator (left border) works on correct route
- Hover states animate smoothly
- Mobile hamburger menu works
- Logo renders correctly (no blue square)

**Step 4: Check for any remaining white/light-theme artifacts**

Search for any remaining light-theme classes that got missed:

Run: `cd /Users/johnmemon/Desktop/contextual-clarity/web && grep -rn "bg-white\|bg-gray-50\|bg-gray-100\|text-gray-900\|border-gray-200\|border-gray-300" src/ --include="*.tsx" | grep -v node_modules`

Fix any remaining instances.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: visual QA — clean up remaining light-theme artifacts"
```

---

## Task 15: Motion verification — test all micro-interactions

**Step 1: Verify card hovers**

On `/` (Recall Sets), hover over cards. Confirm:
- Card lifts slightly (`-translate-y-0.5` or `-translate-y-0.5`)
- Border color transitions to `clarity-500/30`
- Transition is smooth (200ms)

**Step 2: Verify button interactions**

Click buttons. Confirm:
- Hover: subtle lift
- Active press: `scale(0.97)` snap
- Disabled: muted colors, no hover

**Step 3: Verify progress bars**

Navigate to a recall set detail or dashboard. Confirm:
- Progress bar fills smoothly (`duration-700 ease-out`)
- Gradient fill visible (`clarity-600` → `clarity-400`)

**Step 4: Verify page transitions**

Navigate between routes. Confirm:
- Content fades in with `animate-fade-in` (300ms, translateY 8px→0)

**Step 5: Verify sidebar**

Click between nav items. Confirm:
- Left border appears/disappears with `transition-all duration-200`
- Text color shifts from `slate-400` → white smoothly

**Step 6: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: motion tuning from QA pass"
```
