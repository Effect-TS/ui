// The keyed-table benchmark (js-framework-benchmark's operations) for @effect/ui, and the same table
// on React as a baseline, in headless Chromium: rendering times and JS heap sizes.
//
// Run from the repository root:
//
//   node packages/ui/benchmark/rows/run.mjs [--rounds 5] [--ops create1k,swap] [--variants plain]
//     [--memory-only | --time-only | --ssr-only] [--profile plain:replace1k] [--chromium <path>]
//
// The browser is --chromium, else $CHROMIUM, else `chromium` on PATH, else the Chromium that the
// `playwright` dev dependency installed. entry.ts is bundled with esbuild (minified IIFE, es2023,
// production) straight from packages/ui/src, so it measures the working tree. The bundle goes to
// scratchpad/rows.bundle.js; delete it when done.
//
// Variants, rendering the same table (see harness.ts): @effect/ui's `plain` (one component), `lazy`
// (`plain` with each row behind `h.lazy`), `component` (a child component per row) and `titled` (`component` with a title in the
// table's head), and React's `react-plain`, `react-component` (a row
// component, unmemoized) and `react-memo` (a row component under React.memo); see react.mjs. The
// default is @effect/ui's `plain` and `component`. React variants run from scratchpad/rows-react.bundle.js, built the same
// way from react.mjs with the React in @effect/ui's dev dependencies (the run
// prints its version), so a page loads one framework only.
//
// Times, in milliseconds from the message (or click) to the first microtask after the change is in
// the DOM. Style, layout and paint are not included:
//
//   create1k   1,000 rows into an empty table        replace1k  1,000 new rows over 1,000
//   update10th every 10th label of 1,000 changes     select     a click selects one of 1,000 rows
//   swap       rows 2 and 999 of 1,000 swap          remove     a click removes one of 1,000 rows
//   create10k  10,000 rows into an empty table       append1k   1,000 rows after 1,000
//   clear1k    1,000 rows removed
//
// Protocol. Per round, a fresh page per variant and operation runs 2 unmeasured and 9 measured
// steps (create10k: 1 and 3), each after its setup; the round's figure is their median. The table
// shows the median across rounds and the range (min-max). Variant order rotates each round.
//
// Memory, in MiB (2^20 bytes) of used JS heap after a forced garbage collection, on a fresh page per variant
// and round: `ready` once mounted, then `1k` after 1,000 rows, `replace` after replacing them
// 5 times, `cycle` after 5 create-then-clear cycles of 1,000 rows (back to an empty table, so
// it tracks `ready` unless something is retained) and `10k` after 10,000 rows.
//
// Server rendering and hydration, in milliseconds, of the same table holding 1,000 rows, on a fresh page
// per variant and round, with 2 unmeasured and 9 measured runs (the round's figure is their median):
// `render` is HtmlServer.renderToHtml plus serializeState, `hydrate` is BrowserHost.mountEffect over
// that HTML with its state until `adopted`. Both run in the page, so they use the browser's engine, not
// Node's. Separately, first-hydrate measures one mount-to-adopted sample per fresh client page,
// using HTML and state rendered on another page. Neither DOM parsing nor bundle load is timed.
//
// --profile variant:op profiles 20 steps of one operation, from an unminified bundle, and prints
// the functions with the most self time across them (line numbers are the bundle's). The last
// step's profile goes to scratchpad/rows-<variant>-<op>.cpuprofile. The ops `render` and
// `hydrate` profile that phase of 20 server renders of 1k rows.
//
// Treat results as exploratory: compare paired runs of the same command across revisions on one
// machine; absolute figures depend on the machine and the browser.
import { execSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { parseArgs } from "node:util"
import { build } from "esbuild"
import { chromium } from "playwright"

const { values: args } = parseArgs({
  options: {
    rounds: { type: "string", default: "5" },
    ops: { type: "string" },
    variants: { type: "string", default: "plain,component" },
    "memory-only": { type: "boolean", default: false },
    "time-only": { type: "boolean", default: false },
    "ssr-only": { type: "boolean", default: false },
    profile: { type: "string" },
    chromium: { type: "string" }
  }
})


const variants = (args.profile?.split(":")[0] ?? args.variants).split(",")
const isReact = (variant) => variant.startsWith("react-")
// React is a dev dependency of @effect/ui, for this baseline only.
const reactModules = path.join(process.cwd(), "packages/ui/node_modules")
const bundles = {
  effect: { entry: "entry.ts", out: path.join(process.cwd(), "scratchpad/rows.bundle.js") },
  react: { entry: "react.mjs", out: path.join(process.cwd(), "scratchpad/rows-react.bundle.js") }
}
const bundleOf = (variant) => isReact(variant) ? bundles.react : bundles.effect
for (const bundle of new Set(variants.map(bundleOf))) {
  await build({
    entryPoints: [path.join(import.meta.dirname, bundle.entry)],
    bundle: true,
    minify: args.profile === undefined,
    format: "iife",
    platform: "browser",
    target: "es2023",
    define: { "process.env.NODE_ENV": "\"production\"" },
    nodePaths: bundle === bundles.react ? [reactModules] : [],
    outfile: bundle.out,
    logLevel: "error"
  })
}

const which = () => {
  try {
    return execSync("which chromium", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined
  } catch {
    return undefined
  }
}
const executablePath = args.chromium ?? process.env.CHROMIUM ?? which()
const browser = await chromium.launch({ executablePath, headless: true, args: ["--js-flags=--expose-gc"] })
console.log("chromium " + browser.version() + " (" + (executablePath ?? "playwright") + "), node " + process.version)
if (variants.some(isReact)) {
  const version = (name) => JSON.parse(fs.readFileSync(path.join(reactModules, name, "package.json"), "utf8")).version
  console.log("react " + version("react") + ", react-dom " + version("react-dom") + " (production builds)")
}

const open = async (variant) => {
  const page = await browser.newPage()
  page.on("pageerror", (error) => console.error("page error:", error.message))
  await page.setContent("<!doctype html><html><body></body></html>")
  await page.addScriptTag({ path: bundleOf(variant).out })
  return page
}

const rounds = Number(args.rounds)
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const stat = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)].toFixed(2) + " (" + sorted[0].toFixed(2) + "-" +
    sorted[sorted.length - 1].toFixed(2) + ")"
}

if (args.profile !== undefined) {
  const [variant, op] = args.profile.split(":")
  const page = await open(variant)
  const cdp = await page.context().newCDPSession(page)
  // The ops `render` and `hydrate` profile one phase of `ssr`.
  const ssr = op === "render" || op === "hydrate"
  if (ssr) { for (let i = 0; i < 3; i++) await page.evaluate((v) => window.ssr(v), variant) }
  else await page.evaluate(([v, o]) => window.bench(v, o, 2, 2), [variant, op])
  await cdp.send("Profiler.enable")
  await cdp.send("Profiler.setSamplingInterval", { interval: 50 })
  const profiles = []
  cdp.on("Profiler.consoleProfileFinished", ({ profile, title }) => {
    if (!ssr || title === op) profiles.push(profile)
  })
  if (ssr) { for (let i = 0; i < 20; i++) await page.evaluate((v) => window.ssr(v, true), variant) }
  else await page.evaluate(([v, o]) => window.bench(v, o, 0, 20, true), [variant, op])
  const file = path.join(process.cwd(), "scratchpad/rows-" + variant + "-" + op + ".cpuprofile")
  fs.writeFileSync(file, JSON.stringify(profiles.at(-1)))
  const self = new Map()
  let total = 0
  for (const profile of profiles) {
    const dt = new Map(profile.nodes.map((node) => [node.id, 0]))
    for (let i = 0; i < profile.samples.length; i++) {
      dt.set(profile.samples[i], dt.get(profile.samples[i]) + (profile.timeDeltas[i] ?? 0))
    }
    for (const node of profile.nodes) {
      const name = (node.callFrame.functionName || "(anonymous)") + " " + node.callFrame.lineNumber
      if (node.callFrame.functionName === "(idle)" || node.callFrame.functionName === "(program)") continue
      self.set(name, (self.get(name) ?? 0) + dt.get(node.id))
      total += dt.get(node.id)
    }
  }
  console.log("wrote the last step's profile to " + file + "; self time over " + profiles.length + " steps, " +
    (total / 1000).toFixed(1) + " ms busy:")
  for (const [name, time] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log((time / 1000).toFixed(2).padStart(9) + " ms  " + (100 * time / total).toFixed(1).padStart(5) + "%  " + name)
  }
  await browser.close()
  process.exit(0)
}

const only = args["memory-only"] ? "memory" : args["time-only"] ? "time" : args["ssr-only"] ? "ssr" : undefined

if (only === undefined || only === "time") {
  const page = await open(variants[0])
  const ops = args.ops?.split(",") ?? await page.evaluate(() => window.opNames)
  await page.close()
  const results = Object.fromEntries(variants.map((v) => [v, Object.fromEntries(ops.map((op) => [op, []]))]))
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[(i + round) % variants.length]
      for (const op of ops) {
        const page = await open(variant)
        const big = op === "create10k"
        results[variant][op].push(
          await page.evaluate(([v, o, w, r]) => window.bench(v, o, w, r), [variant, op, big ? 1 : 2, big ? 3 : 9])
        )
        await page.close()
      }
    }
  }
  console.log("times: " + rounds + " rounds, median (min-max) ms")
  for (const op of ops) {
    console.log(op.padEnd(11), variants.map((v) => v + " " + stat(results[v][op])).join(" | "))
  }
}

if (only === undefined || only === "memory") {
  const keys = ["ready", "1k", "replace", "cycle", "10k"]
  const results = Object.fromEntries(variants.map((v) => [v, Object.fromEntries(keys.map((k) => [k, []]))]))
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[(i + round) % variants.length]
      const page = await open(variant)
      const cdp = await page.context().newCDPSession(page)
      const heap = async (key) => {
        for (let j = 0; j < 3; j++) await cdp.send("HeapProfiler.collectGarbage")
        const { usedSize } = await cdp.send("Runtime.getHeapUsage")
        results[variant][key].push(usedSize / 1024 / 1024)
      }
      await page.evaluate((v) => window.memory.mount(v), variant)
      await heap("ready")
      await page.evaluate(() => window.memory.run(1000))
      await heap("1k")
      await page.evaluate(() => window.memory.replace(1000, 5))
      await heap("replace")
      await page.evaluate(() => window.memory.cycle(1000, 5))
      await heap("cycle")
      await page.evaluate(() => window.memory.run(10000))
      await heap("10k")
      await page.evaluate(() => window.memory.close())
      await page.close()
    }
  }
  console.log("memory: " + rounds + " rounds, median (min-max) MiB")
  for (const key of keys) {
    console.log(key.padEnd(11), variants.map((v) => v + " " + stat(results[v][key])).join(" | "))
  }
  if (results.plain !== undefined && results.component !== undefined) {
    // What a row component costs over the same row as plain elements.
    const bytes = (median(results.component["10k"]) - median(results.plain["10k"])) * 1024 * 1024 / 10000
    console.log("per row component, over a plain row at 10k: " + Math.round(bytes) + " bytes")
  }
}

const ssrVariants = variants.filter((v) => !isReact(v))
if ((only === undefined || only === "ssr") && ssrVariants.length > 0) {
  const keys = ["render", "hydrate"]
  const first = Object.fromEntries(ssrVariants.map((v) => [v, []]))
  const results = Object.fromEntries(ssrVariants.map((v) => [v, Object.fromEntries(keys.map((k) => [k, []]))]))
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < ssrVariants.length; i++) {
      const variant = ssrVariants[(i + round) % ssrVariants.length]
      const page = await open(variant)
      const fixture = await page.evaluate((v) => window.renderTable(v), variant)
      const client = await open(variant)
      first[variant].push(await client.evaluate(([v, f]) => window.hydrateTable(v, f), [variant, fixture]))
      await client.close()
      const runs = []
      for (let j = 0; j < 11; j++) runs.push(await page.evaluate((v) => window.ssr(v), variant))
      for (const key of keys) results[variant][key].push(median(runs.slice(2).map((run) => run[key])))
      await page.close()
    }
  }
  console.log("first-hydrate, 1k rows (fresh client page):", ssrVariants.map((v) => v + " " + stat(first[v])).join(" | "), "ms")
  console.log("warm server rendering, 1k rows: " + rounds + " rounds, median (min-max) ms")
  for (const key of keys) {
    console.log(key.padEnd(11), ssrVariants.map((v) => v + " " + stat(results[v][key])).join(" | "))
  }
}
await browser.close()
