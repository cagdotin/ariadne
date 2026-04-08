import { useState, useEffect, useRef, useCallback } from "react";
import { subscribe, unsubscribe } from "@/platform/events";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { qmd_search } from "@/api/qmd";
import { error_message } from "@/lib/utils";
import {
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Zap,
  FileText,
} from "lucide-react";
import type { QmdCollection, QmdSearchResult, QmdSearchHit, QmdExpandedQuery } from "@contracts/qmd";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QmdSearchModalProps {
  open: boolean;
  on_close: () => void;
  index_name: string;
  collections: QmdCollection[];
}

interface SearchProgress {
  stage: "expanding" | "expanded" | "searching" | "complete";
  queries?: QmdExpandedQuery[];
  elapsed_ms?: number;
}

// ─── Score Helpers ──────────────────────────────────────────────────────────

function score_color(score: number): string {
  if (score >= 0.7) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (score >= 0.4) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

function format_ms(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function query_type_color(type: string): string {
  switch (type) {
    case "lex": return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "vec": return "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
    case "hyde": return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Expanded Query Pills ───────────────────────────────────────────────────

function ExpandedQueryPills({ queries }: { queries: QmdExpandedQuery[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {queries.map((q, i) => (
        <Badge key={i} variant="outline" className={`font-mono ${query_type_color(q.type)}`}>
          <span className="font-semibold">{q.type}:</span>
          <span className="truncate max-w-[240px]">{q.query}</span>
        </Badge>
      ))}
    </div>
  );
}

// ─── Progress Display ───────────────────────────────────────────────────────

function SearchProgressDisplay({ progress, timing }: {
  progress: SearchProgress | null;
  timing?: QmdSearchResult["timing"];
}) {
  if (!progress && !timing) return null;

  // After search completes, show the timing summary
  if (timing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Zap className="h-3 w-3" />
        <span>
          Expanded ({format_ms(timing.expand_ms)})
          {" → "}
          Searched ({format_ms(timing.search_ms)})
          {" → "}
          Total {format_ms(timing.total_ms)}
        </span>
      </div>
    );
  }

  // During search, show the current stage
  const stage_text = (() => {
    switch (progress?.stage) {
      case "expanding": return "Expanding query...";
      case "expanded": return "Query expanded, searching...";
      case "searching": return "Searching and reranking...";
      default: return "Preparing...";
    }
  })();

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{stage_text}</span>
    </div>
  );
}

// ─── Collection Filter Pills ────────────────────────────────────────────────

function CollectionFilter({ collections, selected, on_toggle }: {
  collections: QmdCollection[];
  selected: Set<string>;
  on_toggle: (name: string) => void;
}) {
  if (collections.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">Collections:</span>
      {collections.map((col) => {
        const is_selected = selected.has(col.name);
        return (
          <Badge
            key={col.name}
            variant={is_selected ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => on_toggle(col.name)}
          >
            {col.name}
          </Badge>
        );
      })}
    </div>
  );
}

// ─── Score Breakdown (expandable) ───────────────────────────────────────────

function ScoreBreakdown({ hit }: { hit: QmdSearchHit }) {
  const explain = hit.explain;
  if (!explain) return <p className="text-xs text-muted-foreground italic">No explain data available.</p>;

  return (
    <div className="space-y-3">
      {/* Score summary */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">RRF Score</div>
          <div className="font-mono font-semibold">{explain.rrf.totalScore.toFixed(4)}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Rerank Score</div>
          <div className="font-mono font-semibold">{explain.rerankScore.toFixed(4)}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Blended Score</div>
          <div className="font-mono font-semibold">{explain.blendedScore.toFixed(4)}</div>
        </div>
      </div>

      {/* RRF Contributions */}
      {explain.rrf.contributions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">RRF Contributions</div>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">Query</th>
                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">Rank</th>
                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">Score</th>
                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">RRF</th>
                </tr>
              </thead>
              <tbody>
                {explain.rrf.contributions.map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-2 py-1 font-mono">{c.source}</td>
                    <td className="px-2 py-1">
                      <span className={`rounded px-1 py-0.5 ${query_type_color(c.queryType)}`}>
                        {c.queryType}
                      </span>
                    </td>
                    <td className="px-2 py-1 truncate max-w-[200px]" title={c.query}>{c.query}</td>
                    <td className="px-2 py-1 text-right font-mono">{c.rank}</td>
                    <td className="px-2 py-1 text-right font-mono">{c.backendScore.toFixed(3)}</td>
                    <td className="px-2 py-1 text-right font-mono">{c.rrfContribution.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single Result Card ─────────────────────────────────────────────────────

function ResultCard({ hit, is_expanded, on_toggle }: {
  hit: QmdSearchHit;
  is_expanded: boolean;
  on_toggle: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card">
      {/* Result header */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          {/* Score badge */}
          <Badge variant="secondary" className={`shrink-0 font-mono font-semibold ${score_color(hit.score)}`}>
            {hit.score.toFixed(2)}
          </Badge>

          <div className="flex-1 min-w-0">
            {/* Title + docid */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{hit.title}</span>
              <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted rounded px-1">
                #{hit.docid}
              </span>
            </div>

            {/* Path */}
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {hit.displayPath}
            </div>

            {/* Context annotation */}
            {hit.context && (
              <div className="text-xs italic text-muted-foreground/70 mt-0.5 truncate">
                {hit.context}
              </div>
            )}
          </div>
        </div>

        {/* Best chunk */}
        <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-hidden whitespace-pre-wrap break-words max-h-[120px] leading-relaxed">
          {hit.bestChunk}
        </pre>
      </div>

      {/* Expand toggle */}
      <div className="border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={on_toggle}
          className="w-full justify-start rounded-none"
        >
          {is_expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {is_expanded ? "Hide details" : "Show details"}
        </Button>
      </div>

      {/* Expanded detail */}
      {is_expanded && (
        <div className="border-t p-3 space-y-3">
          <ScoreBreakdown hit={hit} />

          {/* Full body preview */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <FileText className="h-3 w-3" />
              Full document
            </div>
            <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto max-h-[300px] whitespace-pre-wrap break-words leading-relaxed">
              {hit.body}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

export function QmdSearchModal({
  open,
  on_close,
  index_name,
  collections,
}: QmdSearchModalProps) {
  const [query, set_query] = useState("");
  const [selected_collections, set_selected_collections] = useState<Set<string>>(
    () => new Set(collections.map((c) => c.name))
  );
  const [searching, set_searching] = useState(false);
  const [search_result, set_search_result] = useState<QmdSearchResult | null>(null);
  const [search_progress, set_search_progress] = useState<SearchProgress | null>(null);
  const [expanded_queries, set_expanded_queries] = useState<QmdExpandedQuery[] | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [expanded_results, set_expanded_results] = useState<Set<string>>(new Set());
  const [copied, set_copied] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);

  // Reset collection selection when collections change
  useEffect(() => {
    set_selected_collections(new Set(collections.map((c) => c.name)));
  }, [collections]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure the modal is rendered
      const timer = setTimeout(() => input_ref.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Listen for search progress events
  useEffect(() => {
    if (!open) return;

    const sub_id = subscribe("qmd:search-progress", (raw) => {
      const payload = raw as SearchProgress;
      set_search_progress(payload);
      // Capture expanded queries when they arrive
      if (payload.stage === "expanded" && payload.queries) {
        set_expanded_queries(payload.queries);
      }
    });

    return () => { unsubscribe(sub_id); };
  }, [open]);

  const toggle_collection = useCallback((name: string) => {
    set_selected_collections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handle_search = useCallback(async () => {
    if (!query.trim() || searching) return;
    set_searching(true);
    set_error(null);
    set_search_result(null);
    set_search_progress(null);
    set_expanded_queries(null);
    set_expanded_results(new Set());

    try {
      const filter = selected_collections.size === collections.length
        ? undefined
        : Array.from(selected_collections);
      const result = await qmd_search(index_name, query.trim(), filter);
      set_search_result(result);
    } catch (err) {
      set_error(error_message(err, "Search failed"));
    } finally {
      set_searching(false);
    }
  }, [query, searching, selected_collections, collections.length, index_name]);

  const toggle_result = useCallback((docid: string) => {
    set_expanded_results((prev) => {
      const next = new Set(prev);
      if (next.has(docid)) {
        next.delete(docid);
      } else {
        next.add(docid);
      }
      return next;
    });
  }, []);

  const handle_copy = useCallback(() => {
    if (!search_result) return;
    navigator.clipboard.writeText(JSON.stringify(search_result, null, 2));
    set_copied(true);
    setTimeout(() => set_copied(false), 2000);
  }, [search_result]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) on_close(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[82vh] flex flex-col overflow-hidden p-0" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-0">
          <Search className="size-4 text-muted-foreground" />
          <DialogTitle>Search — {index_name}</DialogTitle>
        </div>

        {/* Input + collection filter */}
        <div className="px-4 py-3 border-b space-y-2.5 shrink-0">
          <div className="flex gap-2">
            <Input
              ref={input_ref}
              placeholder="Search this index..."
              value={query}
              onChange={(e) => set_query(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handle_search();
                }
              }}
              disabled={searching}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              onClick={handle_search}
              disabled={!query.trim() || searching}
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>

          <CollectionFilter
            collections={collections}
            selected={selected_collections}
            on_toggle={toggle_collection}
          />
        </div>

        {/* Scrollable results area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Progress / expanded queries */}
          {(searching || search_result) && (
            <div className="space-y-2">
              <SearchProgressDisplay
                progress={searching ? search_progress : null}
                timing={search_result?.timing}
              />
              {(expanded_queries ?? search_result?.expanded_queries) && (
                <ExpandedQueryPills queries={(expanded_queries ?? search_result?.expanded_queries)!} />
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2"
                  onClick={() => { set_error(null); handle_search(); }}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Loading skeleton */}
          {searching && !search_result && !error && (
            <div className="space-y-3 pt-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-16" />
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {search_result && search_result.results.length > 0 && (
            <div className="space-y-2">
              {search_result.results.map((hit) => (
                <ResultCard
                  key={hit.docid}
                  hit={hit}
                  is_expanded={expanded_results.has(hit.docid)}
                  on_toggle={() => toggle_result(hit.docid)}
                />
              ))}
            </div>
          )}

          {/* Empty results */}
          {search_result && search_result.results.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">No results found.</p>
              <p className="text-xs text-muted-foreground">
                Try different search terms or check your collection filter.
              </p>
            </div>
          )}

          {/* Initial empty state */}
          {!searching && !search_result && !error && (
            <div className="text-center py-12 space-y-2">
              <Search className="size-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Type a query and press Enter to search.
              </p>
              <p className="text-xs text-muted-foreground">
                Uses hybrid search: BM25 + vector expansion + LLM reranking.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {search_result && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/30 shrink-0">
            <span className="text-xs text-muted-foreground">
              {search_result.results.length} result{search_result.results.length !== 1 ? "s" : ""}
              {" · "}
              {format_ms(search_result.timing.total_ms)}
            </span>
            <Button size="sm" variant="ghost" onClick={handle_copy}>
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
