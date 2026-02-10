/**
 * Font module exports for Quar Animator
 */

export { FontManager, getFontManager, WEB_SAFE_FONTS } from './FontManager';
export type { FontInfo } from './FontManager';
export { glyphPathToSubpaths, textToSubpaths, computeSubpathsBounds } from './glyphConverter';
export type { TextLayoutOptions, TextToSubpathsResult } from './glyphConverter';
export { getTextBounds, getScaledMetrics } from './textMetrics';
export { convertTextToPath } from './textToShape';
