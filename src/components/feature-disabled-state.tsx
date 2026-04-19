import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface FeatureDisabledStateProps {
	icon: LucideIcon;
	title: string;
	description: string;
}

export function FeatureDisabledState({
	icon: Icon,
	title,
	description,
}: FeatureDisabledStateProps) {
	return (
		<div className="mx-auto w-full max-w-3xl pt-10">
			<Card className="overflow-hidden border-border/80 bg-card/95">
				<CardHeader className="border-b border-border/70 bg-muted/30">
					<div className="flex flex-wrap items-center gap-3">
						<div className="flex size-11 items-center justify-center border border-border bg-background">
							<Icon className="size-5 text-muted-foreground" />
						</div>
						<div className="min-w-0 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>{title} is disabled</CardTitle>
								<Badge variant="outline">experimental</Badge>
							</div>
							<CardDescription>{description}</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4 pt-4">
					<p className="text-xs text-muted-foreground">
						This feature is currently turned off for this machine. Enable it in
						Settings to load the related UI and data paths again.
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Button render={<Link to="/settings" />}>
							<Settings2 className="size-4" />
							Open Settings
						</Button>
						<Badge variant="secondary">stored locally only</Badge>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
