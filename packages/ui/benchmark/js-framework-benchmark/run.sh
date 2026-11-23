#!/usr/bin/env bash
# Runs krausest/js-framework-benchmark for Effect UI (built from this checkout), Foldkit, React, Vue,
# Svelte, Solid and vanilla JS. See README.md.
#
# Run from the repository root, inside `nix develop`:
#
#   packages/ui/benchmark/js-framework-benchmark/run.sh <dir> [--count <n>] [--benchmark <prefix>...]
#
# <dir> is where the harness is cloned, outside the repository. The browser is $CHROMIUM, else
# `chromium` on PATH. Extra arguments go to each of the harness's `npm run bench`. Results are written to
# <dir>/webdriver-ts/results and summarized by summarize.mjs.
set -euo pipefail

HARNESS_REV=0f4e78932bf85ed60b163b801bbdbd720fdda54f
FRAMEWORKS=(vanillajs effect-ui foldkit react-hooks vue svelte solid)

mkdir -p "$1"
dir=$(cd "$1" && pwd)
shift
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
chromium=$(readlink -f "${CHROMIUM:-$(command -v chromium)}")

if [ ! -d "$dir/.git" ]; then
  git clone --filter=blob:none --sparse https://github.com/krausest/js-framework-benchmark.git "$dir"
fi
cd "$dir"
git checkout --quiet "$HARNESS_REV"
sparse=('/*' '!/frameworks/')
for f in "${FRAMEWORKS[@]}"; do sparse+=("/frameworks/keyed/$f/"); done
git sparse-checkout set --no-cone "${sparse[@]}"

# The root package.json only holds lint tools, whose peer ranges conflict.
npm ci --legacy-peer-deps
(cd server && npm ci)
(cd webdriver-ts && npm ci && npm run compile)
(cd webdriver-ts-results && npm ci)

# Effect UI: a tarball of packages/ui as `pnpm publish` would pack it, versioned with the commit.
(cd "$repo" && pnpm build)
entry="$dir/frameworks/keyed/effect-ui"
rm -rf "$entry" && mkdir -p "$entry"
cp -r "$here/effect-ui/." "$entry/"
(cd "$repo/packages/ui" && pnpm pack --pack-destination "$entry")
version="0.0.0-$(git -C "$repo" rev-parse --short=7 HEAD)"
(cd "$entry" && node -e '
  const fs = require("node:fs")
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
  pkg["js-framework-benchmark"].frameworkVersion = process.argv[1]
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n")
' "$version")

# Foldkit: the harness entry, moved to the latest Foldkit and the Effect that Effect UI uses.
(cd frameworks/keyed/foldkit && npm install --save-exact foldkit@0.171.0 effect@4.1.5 @effect/platform-browser@4.1.5)

for f in "${FRAMEWORKS[@]}"; do
  (cd "frameworks/keyed/$f" && if [ "$f" = effect-ui ]; then npm install; else npm ci; fi && npm run build-prod)
done

# In its own process group, so that stopping it stops npm's children too.
setsid bash -c 'cd server && exec npm start' &
server=$!
trap 'kill -- -$server' EXIT
until curl -sf localhost:8080/ls > /dev/null; do sleep 1; done

keyed=()
for f in "${FRAMEWORKS[@]}"; do keyed+=("keyed/$f"); done
cd webdriver-ts
npm run isKeyed -- --headless --chromeBinary "$chromium" "${keyed[@]}"
rm -rf results
# One framework at a time, in FRAMEWORKS order: given several, the harness sorts them by name.
for f in "${keyed[@]}"; do
  npm run bench -- --headless --chromeBinary "$chromium" "$@" --framework "$f"
done
node "$here/summarize.mjs" results
