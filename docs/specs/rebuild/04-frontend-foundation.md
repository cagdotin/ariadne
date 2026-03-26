# Ariadne — Rebuild Spec 04: Frontend Foundation

> React app shell, routing, layout, theme provider, and shared utilities.

## Entry Point (`src/main.tsx`)

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./styles/global.css";

// Keyboard shortcuts — macOS standard back/forward navigation
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key === '[') {
    e.preventDefault();
    window.history.back();
  }
  if (e.metaKey && e.key === ']') {
    e.preventDefault();
    window.history.forward();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
```

## Router (`src/router.tsx`)

Uses TanStack Router with type-safe route params.

### Route tree

| Path | Component | Description |
|---|---|---|
| `/` | `Dashboard` | Overview / landing page |
| `/projects` | `Projects` | All projects table |
| `/projects/$name` | `ProjectDetail` | Per-project drill-down |
| `/sessions` | `Sessions` | All sessions table |
| `/sessions/$id` | `SessionDetail` | Session replay viewer |
| `/usage` | `Usage` | Tool/model/cost analytics |
| `/tools/$tool_name` | `ToolDetail` | Per-tool drill-down |
| `/qmd` | `QmdRedirect` | Redirects to `/qmd/{last_index}` |
| `/qmd/$index` | `Qmd` | QMD index management |
| `/qmd/$index/$collection` | `QmdCollection` | QMD collection detail |

All routes share `AppLayout` as the root route component.

### Route registration pattern

```tsx
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';

const root_route = createRootRoute({ component: AppLayout });

const index_route = createRoute({
  getParentRoute: () => root_route,
  path: '/',
  component: Dashboard,
});

// ... one createRoute per page ...

const route_tree = root_route.addChildren([
  index_route, projects_route, project_detail_route,
  sessions_route, session_detail_route,
  usage_route, tool_detail_route,
  qmd_redirect_route, qmd_index_route, qmd_collection_route,
]);

export const router = createRouter({ routeTree: route_tree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

## App Layout (`src/app.tsx`)

The root layout wraps all pages with:

1. **ThemeProvider** — dark/light mode via localStorage key `ariadne-ui-theme`, default dark
2. **SidebarProvider** — shadcn/ui sidebar with collapsible="icon"
3. **Sidebar** — 5 navigation items:
   - Overview (`/`) — `LayoutDashboard` icon
   - Projects (`/projects`) — `FolderOpen` icon
   - Sessions (`/sessions`) — `List` icon
   - Usage (`/usage`) — `BarChart3` icon
   - QMD (`/qmd`) — `LibraryBig` icon
4. **Header bar** — SidebarTrigger + breadcrumbs (left) + Sync button + ModeToggle (right)
5. **Content area** — `<Outlet />` renders the current page

### Sidebar header

Shows the Ariadne labyrinth logo SVG + "Ariadne" text. When collapsed to icon mode, only shows the logo.

### Breadcrumb logic

Dynamic breadcrumbs computed from `location.pathname`:
- `/` → "Overview"
- `/projects` → "Projects"
- `/projects/$name` → "Projects" (link) / `$name`
- `/sessions` → "Sessions"
- `/sessions/$id` → "Sessions" (link) / `$id` (truncated to 12 chars + "…")
- `/tools/$tool_name` → "Usage" (link) / `$tool_name`
- `/usage` → "Usage"
- `/qmd/$index/$collection` → "QMD" (link) / `$index` (link) / `$collection`
- `/qmd/$index` → "QMD" (link) / `$index`

### Sync button behavior

1. Set `is_syncing = true` (shows spinning RefreshCw icon)
2. Call `resync_sessions()` (Tauri command that re-parses all JSONL files)
3. On success: `window.location.reload()` to refresh all pages
4. On failure: `alert("Failed to sync sessions")`

### Session detail special handling

When on a session detail page (`/sessions/:id`), the content area uses `overflow-hidden` instead of `overflow-y-auto` because the session viewer manages its own scrolling.

## Theme Provider (`src/components/theme-provider.tsx`)

Standard dark/light/system theme provider:
- Stores preference in localStorage under configurable key
- Applies `.dark` class to `<html>` element
- Default theme: `"dark"`

## Mode Toggle (`src/components/mode-toggle.tsx`)

Dropdown menu with Sun/Moon icon that toggles between light, dark, and system themes.

## Page Header (`src/components/page-header.tsx`)

Renders breadcrumb navigation using shadcn `Breadcrumb` components. Accepts `items: { label: string; href?: string }[]`.

## Labyrinth Logo (`src/components/labyrinth-logo.tsx`)

Custom SVG logo — a labyrinth/maze design. Accepts `className` for sizing.

## Utility Functions

### `src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function error_message(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  return fallback;
}
```

### `src/lib/format.ts`

| Function | Input | Output |
|---|---|---|
| `format_cost(cost)` | `0.005` | `"$0.0050"` |
| `format_cost(cost)` | `0.50` | `"$0.50"` |
| `format_cost(cost)` | `12.34` | `"$12.34"` |
| `format_tokens(tokens)` | `1500000` | `"1.5M"` |
| `format_tokens(tokens)` | `45000` | `"45.0K"` |
| `format_tokens(tokens)` | `500` | `"500"` |
| `format_duration(seconds)` | `null` | `"—"` |
| `format_duration(seconds)` | `3750` | `"1h 2m"` |
| `format_duration(seconds)` | `120` | `"2m"` |
| `format_duration(seconds)` | `30` | `"30s"` |
| `format_date(iso)` | ISO string | `"Mar 26, 2026"` |
| `format_date_short(iso)` | ISO string | `"Mar 26"` |
| `format_date_relative(iso)` | ISO string | `"5m ago"`, `"3h ago"`, `"2d ago"`, or date |
| `format_file_size(bytes)` | `1500000` | `"1.4 MB"` |
| `format_number(n)` | `12345` | `"12,345"` |

## Custom Hooks

### `src/hooks/use-mobile.ts`

Returns `boolean` indicating if viewport is below mobile breakpoint. Uses `matchMedia("(max-width: 768px)")`.

### `src/hooks/use-qmd-operation.ts`

Manages loading state for QMD operations:
- `is_running: boolean`
- `run(fn): Promise<void>` — sets loading, runs fn, catches errors, alerts on failure, resets loading
