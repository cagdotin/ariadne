# Documentation Maintenance Guide

Status: active  
Last updated: 2026-03-28

This document explains how to contribute to Ariadne's documentation and how to keep it clean over time.

## Purpose

Ariadne docs should reduce navigation cost, not compete with the code.

The code is the source of truth for implementation details. Documentation exists to provide:

- purpose and scope
- boundaries and major entry points
- non-obvious invariants
- design rationale and tradeoffs
- reading order and entry points
- status signals for planned, active, completed, and historical work

## Core Rules

### 1. Docs orient; code explains implementation

Prefer:

- what this subsystem is for
- where it lives
- what it depends on
- what must stay true
- what is surprising or non-obvious

Avoid:

- line-by-line restatements of the code
- file trees or folder inventories that an agent can derive with `find`/`ls`
- long component inventories that add no design insight
- step-by-step implementation narration that will drift quickly

If the code already teaches something clearly, the docs should usually point to it rather than duplicate it.

### 2. A stale map is worse than no map

A wrong map gives contributors false confidence.

If a documentation section cannot be kept trustworthy, either:

- simplify it
- reduce its level of detail
- move the detail closer to the code
- or mark it as historical

Never leave structurally confident but outdated guidance in a current doc.

### 3. Favor progressive disclosure

The intended path is:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DESIGN.md`
5. focused docs such as `docs/information-architecture.md` or `docs/knowledge/*.md`
6. source code

**When the task is documentation work, use this path instead:**

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/documentation-maintenance.md`
4. the owning doc you are changing (`docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/information-architecture.md`, `docs/knowledge/*.md`, specs, or exec plans)
5. source code and current file tree

Each layer should answer the next obvious question and point to the next place to look.

### 4. Keep one current story per topic

A current reference doc should not mix multiple generations of guidance unless older material is explicitly labeled as historical.

If a design changed:

- update the current section
- or move the old section under a clearly labeled historical heading
- or archive the old doc

Do not present superseded and current guidance as peers.

### 5. Status and directory placement are documentation

A file's location and status label are part of the navigation system.

That means:

- `active/` should contain active work
- queued but not yet started work should live in a clearly labeled place such as `pending/`
- completed plans should move out of `active/`
- shipped specs should not remain `Draft` without reason
- historical docs should be marked as historical or superseded

## What Each Doc Owns

| Doc | Owns | Update when |
|---|---|---|
| `AGENTS.md` | Entry-point rules and where to look next | onboarding path, repo-wide rules, primary references change |
| `docs/README.md` | Documentation map and reading order | docs are added, removed, renamed, or repurposed |
| `docs/ARCHITECTURE.md` | Bird's-eye view, subsystem map, boundaries, invariants | structure, subsystem boundaries, top-level layout, key invariants change |
| `docs/DESIGN.md` | Rationale, important data flows, non-obvious subsystem design | design decisions or important flows change |
| `docs/information-architecture.md` | Page structure, navigation, layout rules | routes, page hierarchy, page responsibilities, navigation change |
| `docs/knowledge/*.md` | External integration reference and current contract | integration behavior, protocol, schema, or operational model changes |
| `docs/specs/` | Feature intent, scope, and decision record | planning starts, scope changes, implementation ships |
| `docs/exec-plans/` | Work execution state | work starts, milestones land, work completes |

## If You Change X, Update Y

| Change type | Docs to check |
|---|---|
| Move or rename a major module/directory | `docs/ARCHITECTURE.md` |
| Add/remove a major route or page | `docs/information-architecture.md`, maybe `docs/ARCHITECTURE.md` |
| Change a global pattern or invariant | `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, maybe `AGENTS.md` |
| Change an important data flow or design decision | `docs/DESIGN.md` |
| Change a protocol or integration contract | matching file under `docs/knowledge/` |
| Add a new top-level doc | `docs/README.md`, maybe `README.md` |
| Ship a spec'd feature | spec status, matching exec plan location, any affected reference docs |
| Supersede an old plan/reference | mark old doc clearly or move it to archive/history |

## Contribution Recipe

Use this recipe for any code change that may affect documentation.

### Step 1 — Decide whether the change is navigational or historical

Ask:

- Will this change where someone should look?
- Will this change what is true at a system boundary?
- Will this make a current doc misleading?
- Did a planned feature become shipped or historical?

If the answer to any of these is yes, a doc update is required.

### Step 2 — Update the smallest responsible doc

Prefer updating the narrowest doc that owns the truth:

- route changes -> `docs/information-architecture.md`
- subsystem-map or major entry-point changes -> `docs/ARCHITECTURE.md`
- rationale changes -> `docs/DESIGN.md`
- integration changes -> `docs/knowledge/*.md`
- status changes -> specs / exec plans

Do not spread the same detail across multiple docs unless each doc needs its own version of that information.

### Step 3 — Prefer paths, boundaries, and invariants over reciting code

Good documentation language:

- “The session viewer lives in `src/components/session-viewer/`.”
- “Global analytics time range is managed by `analytics-time-range-provider.tsx`.”
- “The frontend never reads raw session files directly.”

Bad documentation language:

- paragraph-by-paragraph retellings of how a component renders
- enumerations of every helper file unless the list is itself the useful information

### Step 4 — Verify the doc against the code

Before finishing, check:

- every named path exists
- every route still exists
- every status label matches reality
- every “current” section is actually current
- no current doc contradicts another current doc

### Step 5 — Update discovery surfaces

If you add, rename, or repurpose a documentation file, update:

- `docs/README.md`
- `README.md` when the document matters to general contributors
- `AGENTS.md` when it changes the primary entry path or repo-wide rules

## How To Keep Docs Clean

### Keep them thin

When in doubt, shorten.

A small accurate map is better than a large drifting map.
A pointer to the right directory is often better than a copied tree of that directory.

### Keep them path-specific

Name real files and directories. Avoid vague references like “the session system” when you can name the module.

### Keep them current

A doc without freshness is a risk. Update docs during the same workstream as the code change whenever possible.

### Keep historical material obviously historical

Use one of these patterns:

- add a clear superseded banner
- move the file into a historical/archive location
- split the file into current vs historical sections

### Keep status metadata honest

If a feature shipped, the spec should not silently remain `Draft`.
If a plan completed, it should not sit in `active/`.
If a plan is only queued or ready for delegation, it should not sit in `active/` either.

## Recommended Review Questions

Before considering documentation work done, ask:

1. Does this help someone find the right place faster?
2. Does this explain something the code cannot explain on its own?
3. Is any part of this likely to drift quickly?
4. Should any of this be moved closer to the code instead?
5. Does this doc still tell one clear current story?
6. Did I update discovery and status surfaces too?

## Anti-Patterns

Avoid these:

- stale codemaps or architecture docs that duplicate `find` output
- contradictory current guidance
- completed work stored under `active/`
- unlabeled historical docs
- large design docs that duplicate code structure in detail
- adding a new doc without adding it to `docs/README.md`

## Suggested Superseded Banner

Use a short banner like this when a doc stays in place for historical value:

```md
> Status: superseded
> Superseded by: `docs/path/to/current-doc.md`
> Last reviewed: 2026-03-27
```

## Definition of Clean Documentation

Documentation is clean when:

- the entry path is obvious
- the architecture map is trustworthy
- current docs do not contradict each other
- historical docs are visibly historical
- status fields and directory placement match reality
- docs explain orientation, boundaries, and rationale better than the code can
