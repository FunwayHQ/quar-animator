/**
 * SVG Import Module
 * Public API for importing SVG content into Quar Animator.
 */

export { importSvg, type SvgImportOptions, type SvgImportResult } from './svgImporter';
export { parseSvg, type ParsedSvg, type SvgDefs, type SvgElement } from './svgParser';
export { parseSvgPath, type ParsedSubpath } from './svgPathParser';
export {
  parseSvgColor, parseSvgTransform, parseSvgLength,
  resolveStyle, parseUrlRef, parseSvgPoints,
  type ResolvedStyle,
} from './svgUtils';
