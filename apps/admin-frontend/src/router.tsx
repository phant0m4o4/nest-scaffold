import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  redirect,
} from '@tanstack/react-router';
import { Layout } from '@/components/layout';
import { defaultDemoSearch, demoSearchSchema } from '@/lib/demo-search';

const rootRoute = createRootRoute({
  component: Layout,
  notFoundComponent: () => (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <Link
        to="/demos"
        search={defaultDemoSearch}
        className="text-primary underline"
      >
        返回示例数据
      </Link>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () =>
    redirect({
      to: '/demos',
      search: defaultDemoSearch,
      throw: true,
    }),
});

const demoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/demos',
  validateSearch: (search) => demoSearchSchema.parse(search),
  component: lazyRouteComponent(() => import('@/pages/demo-page'), 'DemoPage'),
});

const newDemoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/demos/new',
  validateSearch: (search) => demoSearchSchema.parse(search),
  component: lazyRouteComponent(
    () => import('@/pages/demo-editor-page'),
    'NewDemoPage',
  ),
});

const demoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/demos/$demoId',
  validateSearch: (search) => demoSearchSchema.parse(search),
  component: lazyRouteComponent(
    () => import('@/pages/demo-detail-page'),
    'DemoDetailPage',
  ),
});

const editDemoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/demos/$demoId/edit',
  validateSearch: (search) => demoSearchSchema.parse(search),
  component: lazyRouteComponent(
    () => import('@/pages/demo-editor-page'),
    'EditDemoPage',
  ),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    demoRoute,
    newDemoRoute,
    demoDetailRoute,
    editDemoRoute,
  ]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
