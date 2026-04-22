import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const getSystemTheme = (): "light" | "dark" =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const applyTheme = (resolved: "light" | "dark") => {
  document.documentElement.classList.toggle("dark", resolved === "dark");
};

const resolve = (theme: Theme): "light" | "dark" =>
  theme === "system" ? getSystemTheme() : theme;

const stored = (localStorage.getItem("lilo-theme") as Theme | null) ?? "system";
const initialResolved = resolve(stored);
applyTheme(initialResolved);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: stored,
  resolved: initialResolved,
  setTheme: (theme) => {
    localStorage.setItem("lilo-theme", theme);
    const resolved = resolve(theme);
    applyTheme(resolved);
    set({ theme, resolved });
  },
}));

// Listen for system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme, setTheme } = useThemeStore.getState();
  if (theme === "system") {
    setTheme("system");
  }
});
