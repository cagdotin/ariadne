import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { AppLayout } from './app';
import { Dashboard } from './pages/dashboard';
import { Sessions } from './pages/sessions';
import { SessionDetailLayout } from './pages/session-detail-layout';
import { SessionDetailConversation } from './pages/session-detail-conversation';
import { SessionDetailTraces } from './pages/session-detail-traces';
import { SessionDetailRedirect } from './pages/session-detail-redirect';
import { UsageLayout, UsageRedirect, CostPage, ToolsPage, PatternsPage, FilesPage } from './pages/usage';
import { ToolDetail } from './pages/tool-detail';
import { QmdRedirect } from './pages/qmd-redirect';
import { Qmd } from './pages/qmd';
import { QmdCollection } from './pages/qmd-collection';
import { QmdLogs } from './pages/qmd-logs';

const root_route = createRootRoute({
  component: AppLayout,
});

const index_route = createRoute({
  getParentRoute: () => root_route,
  path: '/',
  component: Dashboard,
});

const sessions_route = createRoute({
  getParentRoute: () => root_route,
  path: '/sessions',
  component: Sessions,
});

// Session detail layout — shared data context + tab nav (Conversation / Traces)
const session_detail_layout_route = createRoute({
  getParentRoute: () => root_route,
  path: '/sessions/$id',
  component: SessionDetailLayout,
  validateSearch: (search: Record<string, unknown>): { panel?: string } => ({
    ...(typeof search.panel === 'string' ? { panel: search.panel } : {}),
  }),
});

// /sessions/$id → redirect to /sessions/$id/conversation
const session_detail_index_route = createRoute({
  getParentRoute: () => session_detail_layout_route,
  path: '/',
  component: SessionDetailRedirect,
});

const session_detail_conversation_route = createRoute({
  getParentRoute: () => session_detail_layout_route,
  path: '/conversation',
  component: SessionDetailConversation,
});

const session_detail_traces_route = createRoute({
  getParentRoute: () => session_detail_layout_route,
  path: '/traces',
  component: SessionDetailTraces,
});

// Usage layout — shared nav, range picker, and data context
const usage_layout_route = createRoute({
  getParentRoute: () => root_route,
  path: '/usage',
  component: UsageLayout,
});

// /usage → redirect to /usage/cost
const usage_index_route = createRoute({
  getParentRoute: () => usage_layout_route,
  path: '/',
  component: UsageRedirect,
});

const usage_cost_route = createRoute({
  getParentRoute: () => usage_layout_route,
  path: '/cost',
  component: CostPage,
});

const usage_tools_route = createRoute({
  getParentRoute: () => usage_layout_route,
  path: '/tools',
  component: ToolsPage,
});

const usage_tool_detail_route = createRoute({
  getParentRoute: () => usage_layout_route,
  path: '/tools/$tool_name',
  component: ToolDetail,
});

const usage_patterns_route = createRoute({
  getParentRoute: () => usage_layout_route,
  path: '/patterns',
  component: PatternsPage,
});

const usage_files_route = createRoute({
  getParentRoute: () => usage_layout_route,
  path: '/files',
  component: FilesPage,
});

const qmd_redirect_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd',
  component: QmdRedirect,
});

const qmd_logs_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd/logs',
  component: QmdLogs,
});

const qmd_index_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd/$index',
  component: Qmd,
});

const qmd_collection_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd/$index/$collection',
  component: QmdCollection,
});

const route_tree = root_route.addChildren([
  index_route,
  sessions_route,
  session_detail_layout_route.addChildren([
    session_detail_index_route,
    session_detail_conversation_route,
    session_detail_traces_route,
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

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
