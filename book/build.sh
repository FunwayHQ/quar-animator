#!/usr/bin/env bash
# Build script for "How to Code a Graphic Editor"
# Requires: pandoc 3.x
set -euo pipefail

cd "$(dirname "$0")"

OUTPUT_BASE="../How-to-Code-a-Graphic-Editor"

# Chapter ordering with part dividers
FILES=(
  00-introduction.md

  # Part I: Foundation (Ch 1-5)
  part1.md
  01-project-architecture.md
  02-design-system-editor-shell.md
  03-the-scene-graph.md
  04-coordinate-systems-and-camera.md
  05-state-management-for-editors.md

  # Part II: Rendering (Ch 6-10)
  part2.md
  06-webgl2-from-scratch.md
  07-shape-rendering-pipeline.md
  08-the-infinite-grid.md
  09-texture-and-image-rendering.md
  10-visual-effects-and-compositing.md

  # Part III: Interaction (Ch 11-18)
  part3.md
  11-the-tool-system.md
  12-shape-tools.md
  13-the-pen-tool.md
  14-brush-and-eraser-tools.md
  15-selection-and-transform.md
  16-direct-selection-and-path-editing.md
  17-group-selection.md
  18-undo-redo.md

  # Part IV: Properties & Panels (Ch 19-22)
  part4.md
  19-the-properties-panel.md
  20-the-layer-panel.md
  21-the-toolbar.md
  22-the-menu-bar.md

  # Part V: Text & Typography (Ch 23-24)
  part5.md
  23-the-text-tool-and-font-pipeline.md
  24-text-to-path-and-outline-stroke.md

  # Part VI: Boolean Operations & SVG (Ch 25-26)
  part6.md
  25-non-destructive-boolean-operations.md
  26-svg-import-and-export.md

  # Part VII: Pages, Symbols & Organization (Ch 27-29)
  part7.md
  27-multi-page-projects.md
  28-symbols-reusable-components.md
  29-artboards.md

  # Part VIII: Export & File Format (Ch 30-31)
  part8.md
  30-the-binary-file-format.md
  31-selected-element-export.md

  # Part IX: Editor Polish (Ch 32-35)
  part9.md
  32-keyboard-shortcuts.md
  33-canvas-rulers-and-guides.md
  34-context-menus-and-clipboard.md
  35-drag-and-drop-import.md

  # Part X: Lessons Learned (Ch 36-39)
  part10.md
  36-webgl-pitfalls-and-solutions.md
  37-react-in-real-time-applications.md
  38-testing-graphic-editors.md
  39-architecture-decisions.md

  # Appendices
  part-appendices.md
  appendix-a-keyboard-shortcuts.md
  appendix-b-node-types.md
  appendix-c-shader-source.md
  appendix-d-file-format-spec.md
  appendix-e-project-setup.md
)

COMMON_ARGS=(
  --metadata-file=metadata.yaml
  --toc
  --toc-depth=2
  --top-level-division=chapter
)

echo "Building EPUB..."
pandoc "${COMMON_ARGS[@]}" \
  --css=epub.css \
  --split-level=1 \
  "${FILES[@]}" \
  -o "${OUTPUT_BASE}.epub"
echo "  -> ${OUTPUT_BASE}.epub"

echo "Building HTML..."
pandoc "${COMMON_ARGS[@]}" \
  --standalone \
  --css=epub.css \
  "${FILES[@]}" \
  -o "${OUTPUT_BASE}.html"
echo "  -> ${OUTPUT_BASE}.html"

echo "Done."
