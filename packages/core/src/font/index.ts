/**
 * Font module exports for Quar Animator
 */

export { FontManager, getFontManager, WEB_SAFE_FONTS, GOOGLE_FONTS_CATALOG } from './FontManager';
export type { FontInfo, GoogleFontEntry } from './FontManager';
export { glyphPathToSubpaths, textToSubpaths, computeSubpathsBounds } from './glyphConverter';
export type { TextLayoutOptions, TextToSubpathsResult, GlyphSubpathGroup } from './glyphConverter';
export { getTextBounds, getScaledMetrics } from './textMetrics';
export { convertTextToPath, convertTextToPathGroup } from './textToShape';
