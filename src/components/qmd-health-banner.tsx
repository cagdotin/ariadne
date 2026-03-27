import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";
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
      <Alert variant="warning">
        <Terminal className="size-4" />
        <AlertTitle>QMD is not installed</AlertTitle>
        <AlertDescription>
          Install it with:{" "}
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            npm install -g @tobilu/qmd
          </code>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.kind === "needs_embedding") {
    return (
      <Alert variant="warning">
        <AlertTriangle className="size-4" />
        <AlertTitle>
          <span className="font-medium">{state.count.toLocaleString()}</span> documents need embedding
        </AlertTitle>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={state.onEmbed}>
            Embed All
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  if (state.kind === "stale") {
    return (
      <Alert variant="warning">
        <AlertTriangle className="size-4" />
        <AlertTitle>
          Index hasn't been updated in{" "}
          <span className="font-medium">{state.days} days</span>
        </AlertTitle>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={state.onReindex}>
            Re-index
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  return null;
}
