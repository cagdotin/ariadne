import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { qmd_list_indexes } from "@/api/qmd";
import { use_qmd_enabled } from "@/components/app-settings-provider";
import { Skeleton } from "@/components/ui/skeleton";

const LAST_INDEX_KEY = "ariadne:qmd:last-index";

export function QmdRedirect() {
	const navigate = useNavigate();
	const is_qmd_enabled = use_qmd_enabled();

	useEffect(() => {
		const redirect = async () => {
			if (!is_qmd_enabled) {
				navigate({ to: "/settings", replace: true });
				return;
			}
			try {
				const last_index = localStorage.getItem(LAST_INDEX_KEY);
				if (last_index) {
					// Verify the index still exists
					const indexes = await qmd_list_indexes();
					const exists = indexes.some((idx) => idx.name === last_index);
					if (exists) {
						navigate({
							to: "/qmd/$index",
							params: { index: last_index },
							replace: true,
						});
						return;
					}
				}
				// Fall back to default
				navigate({
					to: "/qmd/$index",
					params: { index: "default" },
					replace: true,
				});
			} catch {
				// If listing fails, just go to default
				navigate({
					to: "/qmd/$index",
					params: { index: "default" },
					replace: true,
				});
			}
		};
		void redirect();
	}, [is_qmd_enabled, navigate]);

	return (
		<div className="space-y-6">
			<Skeleton className="h-7 w-24" />
			<Skeleton className="h-14 w-full" />
		</div>
	);
}
