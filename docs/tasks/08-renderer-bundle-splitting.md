# Task: Reduce the renderer bundle with route/component-level code splitting

**Status:** Ready  
**Priority:** P3  
**Goal:** Shrink the initial renderer bundle by lazy-loading the heaviest routes and supporting libraries.

## Why this matters

Current production build output shows a very large main bundle:

- `dist/assets/index-*.js` is currently about 2.3 MB before gzip
- Vite emits a chunk-size warning
- likely heavy areas include QMD pages, session replay, markdown/highlighting, and chart-heavy views

This is not an architecture blocker, but it is a real UX/performance follow-up.

## Current code to inspect first

- `src/router.tsx`
- `src/pages/qmd.tsx`
- `src/pages/qmd-collection.tsx`
- `src/pages/qmd-logs.tsx`
- `src/pages/session-detail.tsx`
- `src/components/session-viewer/`
- `src/components/qmd-search-modal.tsx`
- `vite.config.ts`

Also inspect current build output:

```bash
bun run build
```

## Required outcome

After this task:

1. the initial renderer bundle is meaningfully smaller
2. heavy routes/components load lazily
3. runtime behavior remains unchanged from the user's point of view
4. build still passes cleanly

## Implementation requirements

Focus on route- and feature-level splits first.

Recommended targets:

- QMD route family
- session detail / session viewer
- heavy markdown/highlighting dependencies
- large chart-heavy or modal-heavy features if they are not needed on first paint

You may also add bundle inspection tooling if it helps, but keep the final setup lightweight.

## Constraints

- do not redesign page information architecture
- do not break route behavior or deep links
- do not introduce loading jank without fallback UI
- prefer a few high-value splits over excessive micro-chunking

## Validation

Run:

```bash
bun run build
bun run typecheck
```

Then compare before vs after:

- main renderer chunk size
- whether Vite still emits the large chunk warning

Manual sanity check:

1. open Overview
2. navigate to Sessions detail
3. open QMD pages
4. open QMD search modal
5. confirm lazy-loaded surfaces still work correctly

## Acceptance

- initial renderer bundle is smaller than the current baseline
- at least the heaviest non-startup surfaces are lazy-loaded
- no route regressions are introduced
- build/typecheck continue to pass
