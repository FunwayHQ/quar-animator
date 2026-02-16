/**
 * SVG Import/Export Module
 * Public API for importing and exporting SVG content in Quar Animator.
 */

export { importSvg, type SvgImportOptions, type SvgImportResult } from './svgImporter';
export { parseSvg, type ParsedSvg, type SvgDefs, type SvgElement } from './svgParser';
export { parseSvgPath, type ParsedSubpath } from './svgPathParser';
export {
  parseSvgColor,
  parseSvgTransform,
  parseSvgLength,
  resolveStyle,
  parseUrlRef,
  parseSvgPoints,
  type ResolvedStyle,
} from './svgUtils';
export {
  exportNodesToSvg,
  pathPointsToSvgD,
  fillToSvgAttrs,
  strokeToSvgAttrs,
  transformToSvgAttr,
  nodeToSvgElement,
} from './svgExporter';
