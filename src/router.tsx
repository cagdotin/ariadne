import {
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppLayout } from "./app";
import { RouteFallback } from "./components/route-fallback";

// Lightweight redirects — keep eagerly loaded (tiny modules)
import { QmdRedirect } from "./pages/qmd-redirect";
import { SessionDetailRedirect } from "./pages/session-detail-redirect";

// ---------------------------------------------------------------------------
// Lazy-loaded route components
// ---------------------------------------------------------------------------

const LazyDashboard = lazy(() =>
	import("./pages/dashboard").then((m) => ({ default: m.Dashboard })),
);

const LazySessions = lazy(() =>
	import("./pages/sessions").then((m) => ({ default: m.Sessions })),
);

const LazySessionDetailLayout = lazy(() =>
	import("./pages/session-detail-layout").then((m) => ({
		default: m.SessionDetailLayout,
	})),
);

const LazySessionDetailConversation = lazy(() =>
	import("./pages/session-detail-conversation").then((m) => ({
		default: m.SessionDetailConversation,
	})),
);

const LazySessionDetailTraces = lazy(() =>
	import("./pages/session-detail-traces").then((m) => ({
		default: m.SessionDetailTraces,
	})),
);

const LazySessionDetailExploration = lazy(() =>
	import("./pages/session-detail-exploration").then((m) => ({
		default: m.SessionDetailExploration,
	})),
);

const LazyUsageLayout = lazy(() =>
	import("./pages/usage").then((m) => ({ default: m.UsageLayout })),
);

const LazyUsageRedirect = lazy(() =>
	import("./pages/usage").then((m) => ({ default: m.UsageRedirect })),
);

const LazyCostPage = lazy(() =>
	import("./pages/usage").then((m) => ({ default: m.CostPage })),
);

const LazyToolsPage = lazy(() =>
	import("./pages/usage").then((m) => ({ default: m.ToolsPage })),
);

const LazyPatternsPage = lazy(() =>
	import("./pages/usage").then((m) => ({ default: m.PatternsPage })),
);

const LazyFilesPage = lazy(() =>
	import("./pages/usage").then((m) => ({ default: m.FilesPage })),
);

const LazyToolDetail = lazy(() =>
	import("./pages/tool-detail").then((m) => ({ default: m.ToolDetail })),
);

const LazyQmd = lazy(() =>
	import("./pages/qmd").then((m) => ({ default: m.Qmd })),
);

const LazyQmdCollection = lazy(() =>
	import("./pages/qmd-collection").then((m) => ({
		default: m.QmdCollection,
	})),
);

const LazyQmdLogs = lazy(() =>
	import("./pages/qmd-logs").then((m) => ({ default: m.QmdLogs })),
);

const LazyExploreLayout = lazy(() =>
	import("./pages/explore").then((m) => ({ default: m.ExploreLayout })),
);

// ---------------------------------------------------------------------------
// Suspense wrapper — provides a loading fallback for lazy components
// ---------------------------------------------------------------------------

function with_suspense(Component: React.ComponentType) {
	return function SuspenseWrapper() {
		return (
			<Suspense fallback={<RouteFallback />}>
				<Component />
			</Suspense>
		);
	};
}

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------

const root_route = createRootRoute({
	component: AppLayout,
});

const index_route = createRoute({
	getParentRoute: () => root_route,
	path: "/",
	component: with_suspense(LazyDashboard),
});

const sessions_route = createRoute({
	getParentRoute: () => root_route,
	path: "/sessions",
	component: with_suspense(LazySessions),
});

// Session detail layout — shared data context + tab nav (Conversation / Traces)
const session_detail_layout_route = createRoute({
	getParentRoute: () => root_route,
	path: "/sessions/$id",
	component: with_suspense(LazySessionDetailLayout),
	validateSearch: (search: Record<string, unknown>): { panel?: string } => ({
		...(typeof search.panel === "string" ? { panel: search.panel } : {}),
	}),
});

// /sessions/$id → redirect to /sessions/$id/conversation
const session_detail_index_route = createRoute({
	getParentRoute: () => session_detail_layout_route,
	path: "/",
	component: SessionDetailRedirect,
});

const session_detail_conversation_route = createRoute({
	getParentRoute: () => session_detail_layout_route,
	path: "/conversation",
	component: with_suspense(LazySessionDetailConversation),
});

const session_detail_traces_route = createRoute({
	getParentRoute: () => session_detail_layout_route,
	path: "/traces",
	component: with_suspense(LazySessionDetailTraces),
});

const session_detail_exploration_route = createRoute({
	getParentRoute: () => session_detail_layout_route,
	path: "/exploration",
	component: with_suspense(LazySessionDetailExploration),
});

// Usage layout — shared nav, range picker, and data context
const usage_layout_route = createRoute({
	getParentRoute: () => root_route,
	path: "/usage",
	component: with_suspense(LazyUsageLayout),
});

// /usage → redirect to /usage/cost
const usage_index_route = createRoute({
	getParentRoute: () => usage_layout_route,
	path: "/",
	component: with_suspense(LazyUsageRedirect),
});

const usage_cost_route = createRoute({
	getParentRoute: () => usage_layout_route,
	path: "/cost",
	component: with_suspense(LazyCostPage),
});

const usage_tools_route = createRoute({
	getParentRoute: () => usage_layout_route,
	path: "/tools",
	component: with_suspense(LazyToolsPage),
});

const usage_tool_detail_route = createRoute({
	getParentRoute: () => usage_layout_route,
	path: "/tools/$tool_name",
	component: with_suspense(LazyToolDetail),
});

const usage_patterns_route = createRoute({
	getParentRoute: () => usage_layout_route,
	path: "/patterns",
	component: with_suspense(LazyPatternsPage),
});

const usage_files_route = createRoute({
	getParentRoute: () => usage_layout_route,
	path: "/files",
	component: with_suspense(LazyFilesPage),
});

const explore_route = createRoute({
	getParentRoute: () => root_route,
	path: "/explore",
	component: with_suspense(LazyExploreLayout),
	validateSearch: (
		search: Record<string, unknown>,
	): { path?: string } => ({
		...(typeof search.path === "string" && search.path
			? { path: search.path }
			: {}),
	}),
});

const qmd_redirect_route = createRoute({
	getParentRoute: () => root_route,
	path: "/qmd",
	component: QmdRedirect,
});

const qmd_logs_route = createRoute({
	getParentRoute: () => root_route,
	path: "/qmd/logs",
	component: with_suspense(LazyQmdLogs),
});

const qmd_index_route = createRoute({
	getParentRoute: () => root_route,
	path: "/qmd/$index",
	component: with_suspense(LazyQmd),
});

const qmd_collection_route = createRoute({
	getParentRoute: () => root_route,
	path: "/qmd/$index/$collection",
	component: with_suspense(LazyQmdCollection),
});

const route_tree = root_route.addChildren([
	index_route,
	sessions_route,
	explore_route,
	session_detail_layout_route.addChildren([
		session_detail_index_route,
		session_detail_conversation_route,
		session_detail_traces_route,
		session_detail_exploration_route,
	]),
	usage_layout_route.addChildren([
		usage_index_route,
		usage_cost_route,
		usage_tools_route,
		usage_tool_detail_route,
		usage_patterns_route,
		usage_files_route,
	]),
	qmd_redirect_route,
	qmd_logs_route,
	qmd_index_route,
	qmd_collection_route,
]);

export const router = createRouter({ routeTree: route_tree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
