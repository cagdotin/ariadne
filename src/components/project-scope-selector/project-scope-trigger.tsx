import { FolderGit2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ComboboxTrigger } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

interface ProjectScopeTriggerProps {
	loading: boolean;
	label: string;
	description: string;
	full_path: string | null;
}

export function ProjectScopeTrigger({
	loading,
	label,
	description,
	full_path,
}: ProjectScopeTriggerProps) {
	return (
		<ComboboxTrigger
			disabled={loading}
			title={full_path ?? "All projects"}
			className={cn(
				buttonVariants({ variant: "outline", size: "sm" }),
				"max-w-[22rem] gap-6 justify-between",
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate text-sm font-medium">
					{loading ? "Loading…" : label}
				</span>
			</div>
			<div className="flex items-center justify-center gap-1.5">
				<span className="hidden truncate text-xs leading-3 text-muted-foreground lg:block">
					{loading ? "" : description}
				</span>
			</div>
		</ComboboxTrigger>
	);
}
