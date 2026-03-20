import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Terminal } from "lucide-react";

type BannerState =
  | { kind: "not_installed" }
  | { kind: "needs_embedding"; count: number; onEmbed: () => void }
  | { kind: "stale"; days: number; onReindex: () => void };

interface QmdHealthBannerProps {
  state: BannerState;
}

export function QmdHealthBanner({ state }: QmdHealthBannerProps) {
  if (state.kind === "not_installed") {
    return (
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardContent className="pt-4 pb-4 px-4 flex items-start gap-3">
          <Terminal className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">QMD is not installed</p>
            <p className="text-sm text-muted-foreground">
              Install it with:{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                npm install -g @tobilu/qmd
              </code>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "needs_embedding") {
    return (
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardContent className="pt-4 pb-4 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            <p className="text-sm text-foreground">
              <span className="font-medium">{state.count.toLocaleString()}</span> documents need embedding
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={state.onEmbed}>
            Embed All
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "stale") {
    return (
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardContent className="pt-4 pb-4 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            <p className="text-sm text-foreground">
              Index hasn't been updated in{" "}
              <span className="font-medium">{state.days} days</span>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={state.onReindex}>
            Re-index
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
