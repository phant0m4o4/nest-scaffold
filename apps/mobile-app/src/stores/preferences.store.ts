import { create } from 'zustand';

interface IPreferencesState {
  isCompact: boolean;
  setCompact: (isCompact: boolean) => void;
}

// 仅管理展示偏好；接口数据交给 Query，当前偏好随应用重启重置。
export const usePreferencesStore = create<IPreferencesState>((set) => ({
  isCompact: false,
  setCompact: (isCompact) => set({ isCompact }),
}));
