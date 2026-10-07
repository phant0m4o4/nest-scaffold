import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IPreferences {
  theme: 'light' | 'dark';
  isSidebarCollapsed: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
}

// 仅保存界面偏好；请求数据由 Query 管理，认证凭据不应进入此存储。
export const usePreferences = create<IPreferences>()(
  persist(
    (set) => ({
      theme: 'light',
      isSidebarCollapsed: false,
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    { name: 'nest-scaffold-admin-preferences' },
  ),
);
