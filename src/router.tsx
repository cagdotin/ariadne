import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { AppLayout } from './app';
import { Dashboard } from './pages/dashboard';
import { Sessions } from './pages/sessions';
import { SessionDetail } from './pages/session-detail';
import { Usage } from './pages/usage';
import { ToolDetail } from './pages/tool-detail';
import { QmdRedirect } from './pages/qmd-redirect';
import { Qmd } from './pages/qmd';
import { QmdCollection } from './pages/qmd-collection';

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

const session_detail_route = createRoute({
  getParentRoute: () => root_route,
  path: '/sessions/$id',
  component: SessionDetail,
});

const usage_route = createRoute({
  getParentRoute: () => root_route,
  path: '/usage',
  component: Usage,
});

const tool_detail_route = createRoute({
  getParentRoute: () => root_route,
  path: '/tools/$tool_name',
  component: ToolDetail,
});

const qmd_redirect_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd',
  component: QmdRedirect,
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
  session_detail_route,
  usage_route,
  tool_detail_route,
  qmd_redirect_route,
  qmd_index_route,
  qmd_collection_route,
]);

export const router = createRouter({ routeTree: route_tree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
