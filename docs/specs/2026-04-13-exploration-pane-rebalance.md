# Exploration Pane Rebalance — narrative-left, artifact-first map

Status: Implemented
Date: 2026-04-13
Execution plan: [[docs/exec-plans/active/2026-04-13-exploration-pane-rebalance.md]]
Related specs and plans:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]

## 1. Problem statement

The Exploration route now has the right semantic foundation, but its current pane ownership still creates unnecessary duplication.

Today the route asks the user to read the same story in multiple places:
- a dedicated session-framing strip sits above the workspace
- the left pane already shows turns, prompts, and tool activity
- the map still renders prompts, discovery items, and framing nodes as first-class lane content
- turns start expanded, which makes larger sessions feel long and scroll-heavy before the user has asked any question

This works, but it is not yet the clearest expression of the product.

The route should make each pane own a different job:
- **left pane** = the narrative spine of the session
- **map** = the artifact and neighborhood view
- **inspector** = the explanation of the current selection

This spec rebalances the Exploration route around that ownership model.

The key product change is:
- move session framing into the top of the left narrative pane
- collapse turns by default
- make the map artifact-first by default
- only reintroduce prompts, tools, discovery, or framing into the map when they are needed to explain the active selection

## 2. Goals and non-goals

### 2.1 Goals
- Make the left pane the single primary narrative surface for:
  - session framing
  - turns
  - prompts
  - tool activity
- Move the current top-level session-framing row into the top of the left pane
- Collapse all turns by default so larger sessions are scannable immediately
- Make the map artifact-first by default, emphasizing:
  - docs
  - source files
  - edited/written outputs
  - adjacent unexplored context
- Allow the map to show prompt/tool/framing scaffolding only when needed to explain the active selection
- Preserve the graph-first truth model and availability/provenance distinctions
- Keep existing focus modes, question-oriented actions, and inspector behavior conceptually intact while adapting them to the new pane ownership
- Prefer renderer-side changes over backend or contract changes

### 2.2 Non-goals
- Changing `SessionGraphPayload` semantics or adding backend derivation work
- Removing prompts, tools, or framing from the product entirely
- Replacing the split-view Exploration route with a different navigation model
- Reopening symbol-graph, snapshot, or replay-scrubbing scope
- Building a full freeform graph canvas
- Hiding causality; this change reduces duplication, not explanation

## 3. System context

### Affected renderer surfaces
- `src/components/exploration/exploration-view.tsx` — route composition and pane ownership
- `src/components/exploration/exploration-path.tsx` — left-pane narrative composition and default expansion behavior
- `src/components/exploration/exploration-framing.tsx` — current dedicated framing strip to be folded into the path experience or reduced to an internal subcomponent
- `src/components/exploration/exploration-map.tsx` — artifact-first default map rendering
- `src/components/exploration/exploration-inspector-v2.tsx` — must continue to explain selected framing/tool/prompt/artifact nodes coherently
- `src/lib/exploration-path-view-model.ts` — turn-level narrative derivation
- `src/lib/exploration-graph-view-model.ts` — map visibility, lane assignment, and selection-subgraph behavior
- `src/lib/exploration-question-actions.ts` — curated actions must still lead to meaningful views after map simplification
- `tests/unit/lib/exploration-graph-view-model.test.ts`
- `tests/unit/lib/exploration-path-view-model.test.ts`
- `tests/unit/lib/exploration-question-actions.test.ts`

### Documentation surfaces to update when shipped
- `docs/information-architecture.md` — session-detail Exploration description should reflect the new pane responsibilities
- this spec and its execution plan — status and completion notes

### Architectural constraint
This is a **renderer-first layout and visibility refinement**. If implementation discovers a need for graph-contract or backend changes, that should be treated as a scope break and reviewed explicitly rather than folded in casually.

## 4. Conventions and style

### 4.1 Pane ownership must be explicit
The same node family should not appear as co-equal primary content in multiple panes unless the duplication is intentional and necessary.

Preferred ownership:
- left pane owns chronology and investigation flow
- map owns artifact topology and nearby context
- inspector owns provenance and explanation

### 4.2 Default state should optimize for scanning
A user opening a long session should not be dropped into an infinitely expanded narrative or a map full of explanatory scaffolding before they select anything.

Default state should favor:
- collapse
- summarization
- artifact emphasis
- deferred explanation until selection

### 4.3 Selection should reintroduce explanation, not permanent clutter
Prompts, discovery nodes, tool calls, and framing nodes are still important, but they should usually appear in the map as **selection-driven scaffolding** rather than default background clutter.

### 4.4 Truthfulness rules remain unchanged
Observed / ambient / inferred / unavailable distinctions stay intact across the path, map, and inspector.

## 5. Domain model

This phase does not change the graph IR. It changes how the existing graph is sliced into UI surfaces.

### 5.1 Narrative nodes
Narrative nodes are primarily owned by the left pane:
- `session_framing`
- `runtime_context`
- `system_prompt`
- `developer_prompt`
- `agents_doc`
- `instruction_source`
- `user_prompt`
- `assistant_turn`
- `tool_call`
- `search_query`

These nodes explain the story of the investigation.

### 5.2 Artifact nodes
Artifact nodes are primarily owned by the map:
- `doc_file`
- `doc_section`
- `source_file`
- adjacent unexplored file/doc context where available

These nodes explain what the session touched and what was nearby.

### 5.3 Selection-driven scaffolding
Selection-driven scaffolding is the temporary reappearance of narrative nodes inside the map when they are required to answer the active question.

Examples:
- a selected file may pull in the minimal upstream doc/instruction/turn/tool chain needed to explain arrival
- a selected turn may show one turn anchor plus the artifacts explored from it
- a selected framing source may show itself plus the artifacts it constrained or influenced

The invariant is:
> the map is artifact-first by default, explanation-first only when the user has asked for explanation through selection or a curated action.

## 6. Detailed design

### 6.1 High-level page structure
The Exploration route should be structured as:
1. **top controls strip** — focus modes, summary chips, visibility toggles
2. **left narrative pane** — framing + collapsible turns + action list
3. **right map pane** — artifact-first context map
4. **inspector** — selection explanation

The dedicated full-width framing row above the workspace should be removed.

### 6.2 Framing becomes the first section of the left pane
Session framing should move into the top of the left pane as the first collapsible section.

Required behavior:
- it appears above the turn list
- it remains collapsible
- it preserves the current ability to inspect runtime context, instruction sources, and prompt-availability states
- selecting a framing item still drives map highlighting and inspector state

The user experience should read as:
- what shaped the session
- then what happened turn by turn

not as two disconnected surfaces.

### 6.3 Turns collapse by default
All turns and prompts should be collapsed on initial render.

Required behavior:
- the default first-load state is collapsed for every turn
- selecting a turn or a child action should expand the owning turn automatically
- manual expansion/collapse should still work normally after first render
- turn summary chips remain visible in the collapsed state so the user can scan without expanding everything

The route should optimize for:
- short scanning passes on large sessions
- opening only the turn that matters

### 6.4 Map baseline becomes artifact-first
In the default unselected state, the map should prioritize artifact topology and artifact context.

Default primary map content:
- explored docs and doc sections
- explored source files
- edited/written outputs
- adjacent unexplored neighbors, subject to visibility toggles
- structural or influence edges among those artifacts where they help explain the explored neighborhood

Default hidden or strongly suppressed map content:
- session framing cluster
- runtime context nodes
- system/developer prompt availability nodes
- prompt/turn anchors
- discovery/search nodes
- generic tool-call nodes

This does not remove those nodes from the route. It removes them from the map’s default baseline.

### 6.5 Selection-driven scaffolding rules for the map
The map may reintroduce non-artifact nodes, but only when they materially answer the active question.

#### Selected turn or prompt
The map should primarily show:
- artifacts explored in that turn
- edited/written outputs reached from that turn
- optional minimal turn anchor if it improves interpretation

The map should not expand into a dense prompt/tool lane just because a turn is selected.

#### Selected file or edited output
The map should primarily show:
- the file
- upstream docs/instructions if they exist
- nearby unexplored neighbors when the active lens asks for them
- only the minimal prompt/tool/discovery scaffolding needed to explain arrival

#### Selected doc or instruction source
The map should primarily show:
- the selected doc/instruction node
- downstream files and outputs it influenced
- explicit vs ambient vs inferred influence distinctions
- minimal scaffolding only when needed to connect the influence story

#### Selected framing or runtime node
The map may show the selected framing source and its influenced artifacts, but it should still avoid restoring the old full framing lane as default background content.

#### Cleared selection
When selection is cleared, the map should return to the artifact-first baseline.

### 6.6 Focus-mode behavior under the new ownership model
The existing focus modes remain useful, but their outputs should respect artifact-first defaults.

#### Path
- default mode
- emphasizes artifact progression through the session
- may temporarily show minimal narrative scaffolding when needed to explain arrival or downstream flow

#### Influence
- emphasizes upstream/downstream influence among artifacts
- doc and instruction influence becomes more visible here
- prompt/tool scaffolding appears only if it clarifies influence and cannot be replaced by artifact-level explanation alone

#### Neighborhood
- emphasizes one-hop local artifact context
- should normally avoid reintroducing prompts/tools/discovery into the map
- best answers “what was around this?” rather than “what happened over the whole session?”

### 6.7 Visual hierarchy
The visual hierarchy should change in favor of artifacts.

Recommended hierarchy:
- edited/written outputs = strongest destinations
- explored docs/files = primary content
- adjacent unexplored neighbors = visible but subordinate
- prompt/tool/framing scaffolding = compact, subordinate, selection-scoped
- unrelated background context = aggressively faded when something is selected

Prompts/tools/framing should not consume equal lane weight with artifacts in the default view.

### 6.8 Inspector and question actions
The inspector remains the primary explanation surface for selected nodes.

Required behavior:
- prompt/tool/framing nodes remain fully inspectable
- quick actions continue to work, but should now drive the artifact-first map model rather than restoring permanent clutter
- summary sentences should align with the new surface ownership, for example:
  - “This file was edited after 2 searches, 3 reads, and 1 doc consultation.”
  - “This prompt led to 8 explored artifacts and 1 edit.”

## 7. Error handling and failure modes

- If a session has little or no artifact context, the left narrative pane must still remain useful; the map may show a reduced or empty state rather than fabricating artifact topology.
- If a selected node has no meaningful artifact neighborhood, the map may show the selected node with minimal context instead of repopulating the old full prompt/discovery/framing lanes.
- If selection-driven scaffolding would produce visual noise disproportionate to its explanatory value, it is better to keep that explanation in the inspector than to overpopulate the map.
- If auto-expanding the selected turn introduces unstable UI state, favor deterministic behavior over remembering too much transient expansion state.

## 8. Security and safety considerations

No new security surface is introduced.

This phase remains:
- renderer-side
- read-only
- graph-first
- truthful about unavailable prompt/framing context

## 9. Testing strategy

### 9.1 Unit tests
Add or update pure-function tests for:
- artifact-first map visibility in the default unselected state
- selection-driven reintroduction of prompt/tool/framing scaffolding only when needed
- lane assignment or map-node filtering that suppresses narrative lanes by default
- quick-action behavior under the new visibility rules
- turn-expansion state helpers if extracted into a pure helper

### 9.2 Renderer/component behavior tests
If the current test harness supports it, add focused tests for:
- framing rendering inside the left narrative pane rather than as a separate top row
- turns collapsed by default
- selected turn auto-expands
- clearing selection returns the map to the artifact-first baseline

If component-test infrastructure is too heavy for this pass, cover the logic in pure helpers and validate the DOM behavior manually.

### 9.3 Manual validation
Validate on real sessions that:
- the page opens in a compact, scannable state
- framing appears at the top of the left narrative pane
- turns are collapsed by default
- the map reads as docs/files/outputs/context first
- selecting a file still explains arrival clearly
- selecting a prompt still answers “what happened after this?” without turning the map back into a duplicate narrative pane

## 10. Implementation checklist
- [ ] Move session framing from the dedicated top row into the left narrative pane
- [ ] Preserve framing selection and inspector behavior after that move
- [ ] Change initial turn state to collapsed by default
- [ ] Auto-expand the selected turn when a turn or child action is selected
- [ ] Redefine default map visibility around artifacts, outputs, and adjacent context
- [ ] Suppress prompt/tool/framing/discovery map content by default
- [ ] Reintroduce minimal explanatory scaffolding in the map only for active selections and quick actions
- [ ] Keep Path / Influence / Neighborhood behavior meaningful under the new map rules
- [ ] Update tests for map visibility, turn state, and curated actions
- [ ] Update `docs/information-architecture.md` when implementation ships

## 11. Open questions

1. Should a selected turn appear in the map as a compact anchor chip, or should turn selection stay entirely artifact-only unless the inspector needs to explain the prompt text?
2. Should auto-expanded turns collapse again automatically when selection clears, or should expansion remain under user control after the first automatic reveal?
3. If a selected file has a long causal chain, should the map show a single minimal narrative chain or prefer artifact-only connectors plus inspector explanation?
