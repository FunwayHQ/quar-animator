/**
 * Font module exports for Quar Animator
 */

export { FontManager, getFontManager, WEB_SAFE_FONTS, GOOGLE_FONTS_CATALOG } from './FontManager';
export type { FontInfo, GoogleFontEntry } from './FontManager';
export { glyphPathToSubpaths, textToSubpaths, computeSubpathsBounds } from './glyphConverter';
export type { TextLayoutOptions, TextToSubpathsResult, GlyphSubpathGroup } from './glyphConverter';
export {
  getTextBounds,
  getTextNodeBounds,
  getTextNodeLines,
  getScaledMetrics,
} from './textMetrics';
export { breakTextLines, fontMeasure, getTextBox } from './textLayout';
export { getTextLocalBounds, keepTextInPlace } from './textPlacement';
export type { MeasureText, TextBox, TextLine } from './textLayout';
export { convertTextToPath, convertTextToPathGroup } from './textToShape';
export { getVisibleTextContent } from './textReveal';
