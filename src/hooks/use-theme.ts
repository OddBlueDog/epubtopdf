import { useEffect, useSyncExternalStore } from "react";

import { useLocalStorageState } from "@/hooks/use-local-storage-state";

export type ThemePreference = "light" | "dark" | "system";

const parseTheme = (value: unknown): ThemePreference =>
  value === "light" || value === "dark" ? value : "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const subscribeToSystemTheme = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
};

const systemPrefersDark = (): boolean => window.matchMedia(DARK_QUERY).matches;

export const useTheme = (): {
  readonly preference: ThemePreference;
  readonly resolved: "light" | "dark";
  readonly setPreference: (preference: ThemePreference) => void;
} => {
  const [preference, setPreference] = useLocalStorageState("epubtopdf:theme", parseTheme);
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  return { preference, resolved, setPreference };
};
