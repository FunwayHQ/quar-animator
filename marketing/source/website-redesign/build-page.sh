#!/bin/sh
# Builds the Funway home page project from measure.mjs's output:
#   ./build-page.sh [out-dir]   (default ../out/website-redesign) -> <out-dir>/Funway.quar
# page.test.ts goes in the app's tests for the one run: it uses the editor's own
# types, SVG import, sequence compiler and .quar writer.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "${1:-$HERE/../out/website-redesign}" && pwd)
WEB=$HERE/../../../apps/web
cp "$HERE/page.test.ts" "$WEB/src/websiteRedesign.page.test.ts"
trap 'rm -f "$WEB/src/websiteRedesign.page.test.ts"' EXIT
cd "$WEB"
FUNWAY_DIR="$OUT" FUNWAY_OUT="$OUT/Funway.quar" npx vitest run src/websiteRedesign.page.test.ts
