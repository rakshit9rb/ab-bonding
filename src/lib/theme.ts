export const THEME_COOKIE_NAME = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeName = "light" | "dark";

export function isTheme(value: string | null | undefined): value is ThemeName {
  return value === "light" || value === "dark";
}

export function getSystemTheme(): ThemeName {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getThemePreference(root: HTMLElement = document.documentElement): ThemeName | null {
  const theme = root.dataset.theme;
  return isTheme(theme) ? theme : null;
}

export function getResolvedTheme(root: HTMLElement = document.documentElement): ThemeName {
  return getThemePreference(root) ?? getSystemTheme();
}

export function setThemePreference(
  theme: ThemeName,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
