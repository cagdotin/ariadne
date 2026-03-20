import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { AppLayout } from './app';
import { Dashboard } from './pages/dashboard';
import { Projects } from './pages/projects';
import { ProjectDetail } from './pages/project-detail';
import { Sessions } from './pages/sessions';
import { Usage } from './pages/usage';
import { ToolDetail } from './pages/tool-detail';

const root_route = createRootRoute({
  component: AppLayout,
});

const index_route = createRoute({
  getParentRoute: () => root_route,
  path: '/',
  component: Dashboard,
});

const projects_route = createRoute({
  getParentRoute: () => root_route,
  path: '/projects',
  component: Projects,
});

const project_detail_route = createRoute({
  getParentRoute: () => root_route,
  path: '/projects/$name',
  component: ProjectDetail,
});

const sessions_route = createRoute({
  getParentRoute: () => root_route,
  path: '/sessions',
  component: Sessions,
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

const route_tree = root_route.addChildren([
  index_route,
  projects_route,
  project_detail_route,
  sessions_route,
  usage_route,
  tool_detail_route,
]);

export const router = createRouter({ routeTree: route_tree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
