#!/usr/bin/env bash
# Exports one variant as Hermes bytecode and as minified JS, and prints sizes.
# Usage: scripts/measure.sh <name> [ENV=value ...]
set -euo pipefail
name=$1; shift
out=../../../out/$name
env "$@" npx expo export --platform android --output-dir "$out" >/dev/null 2>&1
env "$@" npx expo export --no-bytecode --platform android --output-dir "$out-js" --source-maps >/dev/null 2>&1
hbc=$(ls "$out"/_expo/static/js/android/*.hbc)
js=$(ls "$out-js"/_expo/static/js/android/*.js)
printf '%-22s hbc %8d  hbc.gz %7d  js %8d  js.gz %7d\n' "$name" \
  "$(stat -c %s "$hbc")" "$(gzip -9c "$hbc" | wc -c)" "$(stat -c %s "$js")" "$(gzip -9c "$js" | wc -c)"
