import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: false,
  toggle: () =>
    set((state) => {
      const next = !state.isDark;
      document.documentElement.classList.toggle("dark", next);
      return { isDark: next };
    }),
}));
