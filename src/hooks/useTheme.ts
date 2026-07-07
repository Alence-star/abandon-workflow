import { useEffect } from "react";
import { useThemeStore } from "../stores/themeStore";

export function useTheme() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return theme;
}
