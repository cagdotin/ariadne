import type { LucideIcon } from "lucide-react";
import {
	ExternalLink,
	FlaskConical,
	Gauge,
	HardDrive,
	LibraryBig,
	MonitorCog,
	Moon,
	RotateCcw,
	Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	use_app_settings,
	use_provider_enabled,
	use_qmd_enabled,
} from "@/components/app-settings-provider";
import { type Theme, use_theme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { QMD_INSTALL_URL } from "@/lib/qmd-feature";

interface BooleanTogglePillProps {
	enabled: boolean;
	on_change: (enabled: boolean) => void;
}

function BooleanTogglePill({ enabled, on_change }: BooleanTogglePillProps) {
	return (
		<div className="inline-flex items-center border border-border bg-background">
			<Button
				variant={enabled ? "default" : "ghost"}
				size="sm"
				onClick={() => on_change(true)}
				aria-pressed={enabled}
			>
				Enabled
			</Button>
			<Button
				variant={enabled ? "ghost" : "outline"}
				size="sm"
				onClick={() => on_change(false)}
				aria-pressed={!enabled}
			>
				Disabled
			</Button>
		</div>
	);
}

function ThemeTogglePill({
	theme,
	on_change,
}: {
	theme: Theme;
	on_change: (theme: Theme) => void;
}) {
	const options: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
		{ value: "light", label: "Light", icon: Sun },
		{ value: "dark", label: "Dark", icon: Moon },
		{ value: "system", label: "System", icon: MonitorCog },
	];

	return (
		<div className="inline-flex flex-wrap items-center border border-border bg-background">
			{options.map(({ value, label, icon: Icon }) => (
				<Button
					key={value}
					variant={theme === value ? "default" : "ghost"}
					size="sm"
					onClick={() => on_change(value)}
					aria-pressed={theme === value}
				>
					<Icon className="size-3.5" />
					{label}
				</Button>
			))}
		</div>
	);
}

interface ExperimentalFeatureCardProps {
	icon: LucideIcon;
	title: string;
	description: string;
	note: string;
	enabled: boolean;
	on_change: (enabled: boolean) => void;
	footer: string;
	extra?: ReactNode;
}

function ExperimentalFeatureCard({
	icon: Icon,
	title,
	description,
	note,
	enabled,
	on_change,
	footer,
	extra,
}: ExperimentalFeatureCardProps) {
	return (
		<Card className="h-full border-border/80 bg-card/95">
			<CardHeader className="border-b border-border/70 bg-muted/20">
				<div className="flex items-start justify-between gap-4">
					<div className="flex min-w-0 items-start gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center border border-border bg-background">
							<Icon className="size-4 text-muted-foreground" />
						</div>
						<div className="min-w-0 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>{title}</CardTitle>
								<Badge variant="outline">experimental</Badge>
								<Badge variant={enabled ? "secondary" : "outline"}>
									{enabled ? "on" : "off"}
								</Badge>
							</div>
							<CardDescription>{description}</CardDescription>
						</div>
					</div>
					<BooleanTogglePill enabled={enabled} on_change={on_change} />
				</div>
			</CardHeader>
			<CardContent className="space-y-3 pt-4">
				<p className="text-xs text-foreground/90">{note}</p>
				{extra}
				<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
					<Badge variant="outline">loads only when enabled</Badge>
					<Badge variant="outline">local machine setting</Badge>
				</div>
			</CardContent>
			<CardFooter className="border-border/70 text-[11px] text-muted-foreground">
				{footer}
			</CardFooter>
		</Card>
	);
}

export function Settings() {
	const { reset_settings, set_provider_enabled, set_qmd_enabled } =
		use_app_settings();
	const is_qmd_enabled = use_qmd_enabled();
	const codex_provider_enabled = use_provider_enabled("codex");
	const { theme, set_theme } = use_theme();

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<Card className="border-border/80 bg-card/95">
				<CardHeader className="border-b border-border/70 bg-muted/20">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>Settings</CardTitle>
								<Badge variant="secondary">local only</Badge>
							</div>
							<CardDescription>
								Configure machine-local behavior for Ariadne. These settings are
								saved in browser storage inside the desktop app — no backend, no
								database, and no sync yet.
							</CardDescription>
						</div>
						<Button variant="outline" size="sm" onClick={reset_settings}>
							<RotateCcw className="size-4" />
							Reset defaults
						</Button>
					</div>
				</CardHeader>
				<CardContent className="grid gap-4 pt-4 md:grid-cols-[1.1fr_0.9fr]">
					<div className="space-y-3 text-xs text-muted-foreground">
						<p>
							For now, <span className="text-foreground">local storage</span> is
							the right fit. We already use it for theme, project scope, and
							time range, so experimental flags can follow the same pattern
							until we introduce a real app config layer.
						</p>
						<p>
							Using <span className="text-foreground">localhost</span> would not
							solve persistence by itself — it only gives the renderer an
							origin. The actual persistence here still comes from local
							storage.
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
						<div className="border border-border bg-background p-3">
							<div className="mb-1 flex items-center gap-2 text-foreground">
								<HardDrive className="size-3.5" />
								<span>Persistence</span>
							</div>
							<p className="text-[11px] text-muted-foreground">
								Machine-local only. No sync across installs.
							</p>
						</div>
						<div className="border border-border bg-background p-3">
							<div className="mb-1 flex items-center gap-2 text-foreground">
								<FlaskConical className="size-3.5" />
								<span>Experimental gates</span>
							</div>
							<p className="text-[11px] text-muted-foreground">
								Disabled features stop loading their UI entry points and related
								data paths.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="border-border/80 bg-card/95">
				<CardHeader className="border-b border-border/70 bg-muted/20">
					<div className="flex items-start justify-between gap-4">
						<div className="flex min-w-0 items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center border border-border bg-background">
								<Sun className="size-4 text-muted-foreground" />
							</div>
							<div className="min-w-0 space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<CardTitle>Appearance</CardTitle>
									<Badge variant="outline">theme</Badge>
								</div>
								<CardDescription>
									Choose the app theme for this machine.
								</CardDescription>
							</div>
						</div>
						<ThemeTogglePill theme={theme} on_change={set_theme} />
					</div>
				</CardHeader>
				<CardContent className="space-y-3 pt-4">
					<p className="text-xs text-foreground/90">
						Theme now lives in Settings instead of the titlebar action area. Use{" "}
						<span className="text-foreground">System</span> to follow the
						current OS appearance automatically.
					</p>
					<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
						<Badge variant="outline">saved locally</Badge>
						<Badge variant="outline">applies immediately</Badge>
					</div>
				</CardContent>
			</Card>

			<div className="flex items-center gap-3 pt-2">
				<span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
					Experimental features
				</span>
				<Separator className="flex-1" />
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<ExperimentalFeatureCard
					icon={LibraryBig}
					title="QMD"
					description="Index management, collection controls, and QMD log observability."
					note="This setting exposes the QMD navigation and routes. The underlying qmd CLI still needs to be installed locally for the feature to work."
					enabled={is_qmd_enabled}
					on_change={set_qmd_enabled}
					extra={
						<div>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									window.open(QMD_INSTALL_URL, "_blank", "noopener,noreferrer")
								}
							>
								<ExternalLink className="size-3.5" />
								Open qmd on GitHub
							</Button>
						</div>
					}
					footer="If qmd is missing, Ariadne will show an install-required message on the QMD pages instead of loading data."
				/>
				<ExperimentalFeatureCard
					icon={Gauge}
					title="Provider limits · Codex"
					description="Live quota snapshots for provider limits."
					note="Right now this only controls the Codex-backed limits flow. When disabled, the global provider-limits poller stops and the dashboard/sidebar cards disappear."
					enabled={codex_provider_enabled}
					on_change={(enabled) => set_provider_enabled("codex", enabled)}
					footer="Current provider support: Codex only. Future providers can plug into the same section."
				/>
			</div>
		</div>
	);
}
