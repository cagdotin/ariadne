import type { QmdAvailability } from "@contracts/qmd/availability";
import { Link } from "@tanstack/react-router";
import {
	ExternalLink,
	LibraryBig,
	RefreshCw,
	Settings2,
	Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { QMD_INSTALL_URL } from "@/lib/qmd-feature";

interface QmdUnavailableStateProps {
	title?: string;
	description?: string;
	availability?: QmdAvailability | null;
	refreshing?: boolean;
	on_refresh?: () => void | Promise<void>;
}

export function QmdUnavailableState({
	title = "QMD requires a local installation",
	description = "Install qmd on this machine before enabling Ariadne's QMD workflows.",
	availability,
	refreshing = false,
	on_refresh,
}: QmdUnavailableStateProps) {
	return (
		<div className="mx-auto w-full max-w-3xl pt-10">
			<Card className="overflow-hidden border-border/80 bg-card/95">
				<CardHeader className="border-b border-border/70 bg-muted/30">
					<div className="flex flex-wrap items-start gap-3">
						<div className="flex size-11 items-center justify-center border border-border bg-background">
							<Terminal className="size-5 text-muted-foreground" />
						</div>
						<div className="min-w-0 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>{title}</CardTitle>
								<Badge variant="outline">dependency missing</Badge>
							</div>
							<CardDescription>{description}</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4 pt-4">
					<p className="text-xs text-muted-foreground">
						Ariadne can only show QMD indexes, collections, and logs when the
						qmd CLI is installed and available on this machine&apos;s PATH.
					</p>

					<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
						<Badge variant="outline">
							<LibraryBig className="size-3" />
							local CLI required
						</Badge>
						{availability?.version ? (
							<Badge variant="outline">{availability.version}</Badge>
						) : null}
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							onClick={() =>
								window.open(QMD_INSTALL_URL, "_blank", "noopener,noreferrer")
							}
						>
							<ExternalLink className="size-4" />
							View qmd on GitHub
						</Button>
						{on_refresh ? (
							<Button variant="ghost" onClick={() => void on_refresh()}>
								<RefreshCw
									className={`size-4 ${refreshing ? "animate-spin" : ""}`}
								/>
								Recheck installation
							</Button>
						) : null}
						<Button variant="ghost" render={<Link to="/settings" />}>
							<Settings2 className="size-4" />
							Open Settings
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
