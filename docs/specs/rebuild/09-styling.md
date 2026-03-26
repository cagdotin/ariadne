# Ariadne — Rebuild Spec 09: Styling & Theme System

> Complete CSS, design tokens, theme system, and visual design language.

## Technology

- **Tailwind CSS v4** — utility-first styling with `@tailwindcss/vite` plugin
- **shadcn/ui** — component library providing base components
- **CSS custom properties** — for theme tokens (light/dark mode)
- **Geist font** — `@fontsource-variable/geist` as primary sans-serif
- **tw-animate-css** — animation utilities

## Global CSS (`src/styles/global.css`)

### Imports

```css
@import "@fontsource-variable/geist";
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
```

### Light Theme (`:root`)

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --success: oklch(0.5962 0.1459 145.97);
  --success-foreground: oklch(1 0 0);
  --warning: oklch(0.7687 0.1588 70.08);
  --warning-foreground: oklch(0.2178 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
  --font-sans: "Geist Variable", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: "JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace;
  --radius: 0.625rem;
}
```

### Dark Theme (`.dark`)

```css
.dark {
  --background: oklch(0.16 0.003 260);
  --foreground: oklch(0.90 0.003 260);
  --card: oklch(0.19 0.003 260);
  --card-foreground: oklch(0.90 0.003 260);
  --popover: oklch(0.18 0.003 260);
  --popover-foreground: oklch(0.90 0.003 260);
  --primary: oklch(0.90 0.003 260);
  --primary-foreground: oklch(0.15 0.003 260);
  --secondary: oklch(0.21 0.003 260);
  --secondary-foreground: oklch(0.88 0.003 260);
  --muted: oklch(0.20 0.003 260);
  --muted-foreground: oklch(0.55 0.005 260);
  --accent: oklch(0.21 0.003 260);
  --accent-foreground: oklch(0.88 0.003 260);
  --destructive: oklch(0.6368 0.2078 25.3313);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.25 0.004 260);
  --input: oklch(0.14 0.003 260);
  --ring: oklch(0.48 0.005 260);
  --chart-1: oklch(0.6333 0.0309 154.9039);
  --chart-2: oklch(0.7209 0.0489 120.9474);
  --chart-3: oklch(0.6744 0.0427 136.011);
  --chart-4: oklch(0.551 0.0234 264.3637);
  --chart-5: oklch(0.5096 0.0289 152.346);
  --sidebar: oklch(0.15 0.003 260);
  --sidebar-foreground: oklch(0.88 0.003 260);
  --sidebar-primary: oklch(0.88 0.003 260);
  --sidebar-primary-foreground: oklch(0.15 0.003 260);
  --sidebar-accent: oklch(0.21 0.003 260);
  --sidebar-accent-foreground: oklch(0.88 0.003 260);
  --sidebar-border: oklch(0.25 0.004 260);
  --sidebar-ring: oklch(0.48 0.005 260);
  --radius: 0.3rem;
}
```

**Key design notes:**
- Dark mode uses a cool blue-gray hue (oklch hue 260)
- Dark mode has smaller border radius (0.3rem vs 0.625rem)
- Dark mode has subtler shadows (lower opacity)
- Chart colors in dark mode are muted greens/teals (not bright colors)

### Theme inline block

Maps CSS custom properties to Tailwind `@theme` tokens:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  /* ... all colors, fonts, radii, shadows ... */
}
```

### Base layer

```css
@layer base {
  * { @apply border-border outline-ring/50; }
  body {
    @apply bg-background text-foreground;
    letter-spacing: -0.01em;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  html, body, #root {
    height: 100%;
    width: 100%;
  }
}
```

### Session Viewer Prose Styles

Custom `.prose-session` class for markdown rendering in the session viewer:

```css
.prose-session {
  font-size: 0.8125rem;          /* 13px — compact for code-heavy content */
  line-height: 1.65;
  color: var(--foreground);
}
```

Heading styles: all same size (~1em), semibold, tight margins.
Lists: tight spacing, muted markers.
Code blocks: handled by syntax highlighter, just margin.
Blockquotes: left border, italic, muted.

### Scrollbar Styling

Slim 6px scrollbars matching the dark theme:

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(0.26 0.003 260); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: oklch(0.34 0.004 260); }
::-webkit-scrollbar-corner { background: transparent; }
```

---

## Shadow System

### Light mode shadows
Prominent with `hsl(0 0% 20% / 0.15)` base color:
```
--shadow-sm: 0px 2px 0px 0px hsl(...), 0px 1px 2px -1px hsl(...)
```

### Dark mode shadows
Very subtle with `#000000` base and 0.04 opacity:
```
--shadow-sm: 0px 1px 2px 0px hsl(0 0% 0% / 0.04), ...
```

---

## Layout Patterns

### Content area padding
```
p-4 md:p-6 lg:p-8
```

### Section spacing
```
gap-4 (between sections in a page)
gap-6 (between major sections)
```

### Grid layouts
- Stat cards: `grid grid-cols-2 sm:grid-cols-4 gap-4`
- Chart sections: `grid grid-cols-1 lg:grid-cols-2 gap-4`
- Tool detail cards: `grid grid-cols-1 sm:grid-cols-2 gap-4`

### Card pattern
Every chart/visualization is wrapped in a `Card`:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* chart or content */}
  </CardContent>
</Card>
```

---

## Typography

| Element | Size | Weight | Color |
|---|---|---|---|
| Page heading | `text-lg` | `font-semibold` | `foreground` |
| Card title | `text-sm` | `font-medium` | `foreground` |
| Stat card value | `text-2xl` | `font-bold` | `foreground` |
| Stat card label | `text-xs` | `font-medium` | `muted-foreground` |
| Table header | `text-xs` | `font-medium` | `muted-foreground` |
| Table cell | `text-sm` | normal | `foreground` |
| Badge | `text-xs` | `font-medium` | varies |
| Session viewer prose | `text-[13px]` | normal | `foreground` |
| Session viewer code | `text-xs` | normal | mono font |

---

## Color Usage

| Purpose | Token |
|---|---|
| Primary text | `foreground` |
| Secondary text | `muted-foreground` |
| Backgrounds | `background`, `card`, `secondary` |
| Borders | `border` |
| Interactive elements | `primary` |
| Hover states | `accent` |
| Errors | `destructive` |
| Success | `success` (custom) |
| Warnings | `warning` (custom) |
| Charts | `chart-1` through `chart-5` |

---

## Theme Provider

```tsx
type Theme = "dark" | "light" | "system";

const ThemeProvider = ({ children, default_theme, storage_key }) => {
  // Reads from localStorage[storage_key]
  // Applies .dark class to <html>
  // Listens for system preference changes
};
```

Storage key: `"ariadne-ui-theme"`
Default: `"dark"`
