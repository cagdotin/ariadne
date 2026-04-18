import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

export type Breadcrumb = { label: string; href?: string };

export function use_breadcrumbs(): Breadcrumb[] {
	const { pathname } = useLocation();

	return useMemo(() => {
		const parts = pathname.split("/").filter(Boolean);

		if (parts.length === 0) return [{ label: "Overview" }];

		if (parts[0] === "sessions" && parts[1]) {
			const session_id_label = `${parts[1].slice(0, 12)}…`;
			if (parts[2] === "traces") {
				return [
					{ label: "Sessions", href: "/sessions" },
					{ label: session_id_label, href: `/sessions/${parts[1]}` },
					{ label: "Traces" },
				];
			}
			return [
				{ label: "Sessions", href: "/sessions" },
				{ label: session_id_label },
			];
		}
		if (parts[0] === "sessions") return [{ label: "Sessions" }];

		if (parts[0] === "explore") return [{ label: "Explore" }];

		if (parts[0] === "usage") {
			const tab_labels: Record<string, string> = {
				cost: "Cost",
				tools: "Tools",
				patterns: "Patterns",
				files: "Files",
			};
			const tab = parts[1];
			const tab_label = tab_labels[tab];

			if (tab === "tools" && parts[2]) {
				return [
					{ label: "Usage", href: "/usage" },
					{ label: "Tools", href: "/usage/tools" },
					{ label: decodeURIComponent(parts[2]) },
				];
			}
			if (tab_label) {
				return [{ label: "Usage", href: "/usage" }, { label: tab_label }];
			}
			return [{ label: "Usage" }];
		}

		if (parts[0] === "qmd" && parts[1] === "logs") {
			return [{ label: "QMD", href: "/qmd" }, { label: "Logs" }];
		}
		if (parts[0] === "qmd" && parts[1] && parts[2]) {
			return [
				{ label: "QMD", href: "/qmd" },
				{ label: parts[1], href: `/qmd/${parts[1]}` },
				{ label: decodeURIComponent(parts[2]) },
			];
		}
		if (parts[0] === "qmd" && parts[1]) {
			return [{ label: "QMD", href: "/qmd" }, { label: parts[1] }];
		}
		if (parts[0] === "qmd") return [{ label: "QMD" }];

		return [{ label: parts[0] }];
	}, [pathname]);
}
