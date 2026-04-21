export const THEME_COOKIE_NAME = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeName = "light" | "dark";

function getThemeRoot(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

export function isTheme(value: string | null | undefined): value is ThemeName {
  return value === "light" || value === "dark";
}

export function getSystemTheme(): ThemeName {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getThemePreference(
  root: HTMLElement | null = getThemeRoot(),
): ThemeName | null {
  if (!root) return null;
  const theme = root.dataset.theme;
  return isTheme(theme) ? theme : null;
}

export function getResolvedTheme(
  root: HTMLElement | null = getThemeRoot(),
): ThemeName {
  return getThemePreference(root) ?? getSystemTheme();
}

export function setThemePreference(
  theme: ThemeName,
  root: HTMLElement | null = getThemeRoot(),
): void {
  if (!root || typeof document === "undefined") return;
  root.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
