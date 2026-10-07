import { useEffect } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/stores/preferences';
import { defaultDemoSearch } from '@/lib/demo-search';

export function Layout() {
  const { theme, isSidebarCollapsed, toggleTheme, toggleSidebar } =
    usePreferences();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-background focus:p-3"
      >
        跳转到主内容
      </a>
      <header className="flex h-18 items-center justify-between border-b border-border px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground"
          >
            N
          </div>
          <span className="font-semibold tracking-wide">管理控制台</span>
        </div>
        <Button
          variant="outline"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
        >
          {theme === 'light' ? '深色模式' : '浅色模式'}
        </Button>
      </header>
      <div className="flex min-h-[calc(100vh-4.5rem)]">
        <aside
          className={`${isSidebarCollapsed ? 'w-20' : 'w-56'} hidden shrink-0 flex-col border-r border-border p-4 transition-[width] md:flex`}
        >
          <p className="mb-5 px-2 text-xs font-medium tracking-wider text-muted-foreground">
            {isSidebarCollapsed ? '导航' : '工作空间'}
          </p>
          <nav aria-label="主导航">
            <Link
              to="/demos"
              search={defaultDemoSearch}
              className="flex h-11 items-center gap-3 rounded-md bg-muted px-3 text-sm font-medium"
              title="示例数据"
            >
              <span aria-hidden="true">▤</span>
              {!isSidebarCollapsed && <span>示例数据</span>}
              {isSidebarCollapsed && <span className="sr-only">示例数据</span>}
            </Link>
          </nav>
          <Button
            variant="outline"
            className="mt-auto px-2"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {isSidebarCollapsed ? '›' : '‹ 收起侧栏'}
          </Button>
        </aside>
        <main
          id="main"
          className="mx-auto w-full min-w-0 max-w-7xl p-5 sm:p-8 lg:p-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
