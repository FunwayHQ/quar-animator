/**
 * Recent Fonts
 * The font families last picked in the font picker, newest first. Kept in
 * this browser only (a convenience: the picker works without it).
 */

export const RECENT_FONTS_KEY = 'quar-recent-fonts';
export const MAX_RECENT_FONTS = 6;

/** The families picked lately, newest first. */
export function getRecentFonts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((family): family is string => typeof family === 'string' && family.length > 0)
      .filter((family) => family.length <= 200)
      .slice(0, MAX_RECENT_FONTS);
  } catch {
    return [];
  }
}

/** Put a family first among the recent ones. */
export function addRecentFont(family: string): void {
  if (!family) return;
  const recent = [family, ...getRecentFonts().filter((other) => other !== family)];
  try {
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_FONTS)));
  } catch {
    // Storage unavailable: the list just isn't remembered
  }
}
