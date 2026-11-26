// Startup cost of @effect/ui-kit definitions that a page imports and retains but never mounts, in
// headless Chromium. Run from the repository root, after `pnpm build`:
//
//   node packages/ui/benchmark/kit-startup/run.mjs [--samples 20] [--chromium <path>] [--json <file>]
//
// Chromium comes from --chromium, $CHROMIUM, `chromium` on PATH, or the playwright dev dependency.
//
// Each page is a Vite production build against the packed @effect/ui and @effect/ui-kit, with the
// same one-button shell. Kit variants store their imports in globalThis.__retained so the bundler
// keeps them:
//
//   baseline  the shell only
//   checkbox  + Checkbox
//   combobox  + Combobox
//   eight     + Accordion, Checkbox, Dialog, Popover, Select, Switch, Tabs, Tooltip
//   all       + every export, through the barrel's namespace
//
// Each page inlines its chunk as a <script type="module">. "eval" runs from __t0, prepended to the
// chunk, to __t1, appended, so fetching and scheduling fall outside it; the run checks this by also
// serving the all page as an external module 250 ms late. "__tPre to __t1" adds parse, compile and
// the wait before the module runs. The shell mounts after both.
//
// Each sample uses a fresh browser context, with no code cache or shared heap. "heap" is the used
// JS heap after two forced GCs. Mount pages then call __mount(), which draws one definition into
// #kit: "mount" ends when a MutationObserver sees its root, and "mount heap" is the added heap
// after another GC. Variants rotate each round. Figures are median (min-max) at 1x and 4x CPU
// throttling; with an even sample count the median is the mean of the middle pair.
//
// Heap snapshots of the unminified baseline and all pages compare self size by constructor. That
// shows what was allocated, not what retains it.
import assert from "node:assert/strict"
import { execFileSync, execSync } from "node:child_process"
import * as fs from "node:fs"
import { cpus, loadavg, tmpdir } from "node:os"
import * as path from "node:path"
import { parseArgs } from "node:util"
import { gzipSync } from "node:zlib"
import { chromium } from "playwright"
import { build, version as vite } from "vite"

const { values } = parseArgs({
  options: {
    samples: { type: "string", default: "20" },
    chromium: { type: "string" },
    json: { type: "string" }
  }
})
const samples = Number(values.samples)
process.env.NODE_ENV = "production"
const repo = path.resolve(import.meta.dirname, "../../../..")
const ui = path.join(repo, "packages/ui")
const uiKit = path.join(repo, "packages/ui-kit")
const effectDir = path.join(ui, "node_modules/effect")
const effect =
  JSON.parse(fs.readFileSync(path.join(effectDir, "package.json"), "utf8"))
    .version
const origin = "http://bench.local"
const which = () => {
  try {
    return execSync("which chromium", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim() || undefined
  } catch {
    return undefined
  }
}

const shell = `import { UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const ShellMessage = UiSchema.TaggedEnum({ Clicked: {} })
const Shell = Html.component({ name: "Shell", model: Schema.Number, message: ShellMessage }).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, model) => h.button.on("click", ShellMessage.Clicked()).children(String(model))
})
;(globalThis as any).__start = () =>
  Layer.launch(BrowserHost.mount(Shell, {}, document.getElementById("app")!)).pipe(Effect.runFork)
`

// A host app for the mount phase: its view draws one definition. The shell's imports precede it.
const host = (imports, view, selector) =>
  `${imports}
const HostMessage = UiSchema.TaggedEnum({ Toggled: { checked: Schema.Boolean } })
const Host = Html.component({
  name: "Host",
  model: Schema.Struct({ checked: Schema.Boolean }),
  message: HostMessage
}).make({
  init: () => ({ checked: false }),
  update: { Toggled: ($, { checked }) => $.evolve({ checked }) },
  view: (h, model) => ${view}
})
;(globalThis as any).__selector = ${JSON.stringify(selector)}
;(globalThis as any).__mount = () =>
  Layer.launch(BrowserHost.mount(Host, {}, document.getElementById("kit")!)).pipe(Effect.runFork)
`

const mounts = {
  baseline: host(
    "",
    "h.button.attr(\"role\", \"checkbox\").children(h.span)",
    "[role=checkbox]"
  ),
  checkbox: host(
    "import { Checkbox } from \"@effect/ui-kit\"",
    `Checkbox(h, {
    props: { checked: model.checked },
    onEmit: { Toggled: ({ checked }) => HostMessage.Toggled({ checked }) },
    view: (checkbox) => checkbox.root(h.button).children(checkbox.indicator(h.span))
  })`,
    "[role=checkbox]"
  ),
  combobox: host(
    "import { Combobox } from \"@effect/ui-kit\"",
    `Combobox(h, {
    props: {
      open: false,
      value: "banana",
      inputValue: "Banana",
      items: [{ value: "apple", label: "Apple" }, { value: "banana", label: "Banana" }]
    },
    onEmit: {
      RequestedOpen: () => undefined,
      RequestedClose: () => undefined,
      Picked: () => undefined,
      RequestedInputValue: () => undefined,
      Highlighted: () => undefined,
      Settled: () => undefined
    },
    view: (combobox) =>
      h.div.children(
        combobox.inputGroup(h.div).children(
          combobox.input(h.input),
          combobox.trigger(h.button).children(combobox.icon(h.span).children("v"))
        ),
        combobox.positioner(h.div).children(
          combobox.popup(h.div).children(
            combobox.list(h.div).children(
              combobox.items.map(({ label, value }) => combobox.item({ element: h.div, value }).children(label))
            )
          )
        )
      )
  })`,
    "[role=combobox]"
  )
}

const retain = (names) =>
  `import { ${names.join(", ")} } from "@effect/ui-kit"
;(globalThis as any).__retained = [${names.join(", ")}]
`
const variants = {
  baseline: "",
  checkbox: retain(["Checkbox"]),
  combobox: retain(["Combobox"]),
  eight: retain([
    "Accordion",
    "Checkbox",
    "Dialog",
    "Popover",
    "Select",
    "Switch",
    "Tabs",
    "Tooltip"
  ]),
  all: `import * as Kit from "@effect/ui-kit"
;(globalThis as any).__retained = [Kit]
`
}

function pack(directory, into) {
  const packed = path.join(into, path.basename(directory) + ".tgz")
  execFileSync("pnpm", ["pack", "--out", packed], { cwd: directory })
  return packed
}

function install(root, packed, name) {
  const installed = path.join(root, "node_modules", name)
  fs.mkdirSync(installed, { recursive: true })
  execFileSync("tar", ["-xzf", packed, "--strip-components=1", "-C", installed])
}

async function bundle(root, name, source, minify = "oxc") {
  const input = path.join(root, name + ".ts")
  fs.writeFileSync(input, source)
  const { output } = await build({
    configFile: false,
    root,
    mode: "production",
    logLevel: "warn",
    build: {
      target: "es2023",
      write: false,
      minify,
      rolldownOptions: { input, output: { format: "es" } }
    }
  })
  assert.equal(output.length, 1, name + ": expected one chunk")
  return output[0]
}

const kitModules = (chunk) =>
  Object.entries(chunk.modules).filter(([id]) =>
    id.includes("/@effect/ui-kit/")
  )
const kitPath = (id) => id.replace(/^.*\/@effect\/ui-kit\/dist\//, "")

// Per kit module, the dist top-level bindings that the final unminified chunk still declares at
// column 0. Rolldown suffixes colliding top-level names with $n, so each module's rendered code
// gives its final names.
const topLevel = (code) =>
  Array.from(
    code.matchAll(
      /^(?:export )?(?:var|let|const|class|(?:async )?function\*?) ([\w$]+)/gm
    ),
    (match) => match[1]
  )
function keptBindings(chunk) {
  const inChunk = new Set(topLevel(chunk.code))
  return Object.fromEntries(
    kitModules(chunk).map(([id, info]) => {
      const kept = new Set(
        topLevel(info.code ?? "").filter((name) => inChunk.has(name)).map((
          name
        ) => name.replace(/\$\d+$/, ""))
      )
      const declared = topLevel(fs.readFileSync(id, "utf8"))
      return [kitPath(id), {
        declared: declared.length,
        dropped: declared.filter((name) => !kept.has(name))
      }]
    })
  )
}

const timed = (code) =>
  "globalThis.__t0=performance.now();\n" + code +
  "\n;globalThis.__t1=performance.now();globalThis.__start();"
const html = (code) =>
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><div id=\"app\"></div><div id=\"kit\"></div>" +
  "<script>globalThis.__tPre=performance.now()</script>" +
  (code === undefined
    ? "<script type=\"module\" src=\"/bundle.js\"></script>"
    : "<script type=\"module\">" +
      timed(code).replaceAll("</script", "<\\/script") + "</script>") +
  "</body></html>"

async function gc(cdp) {
  await cdp.send("HeapProfiler.collectGarbage")
  await cdp.send("HeapProfiler.collectGarbage")
  return (await cdp.send("Runtime.getHeapUsage")).usedSize
}

const settle = (page) =>
  page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))

// One page load in a fresh context. delay > 0 serves the chunk as a module script after that many ms.
async function sample(
  browser,
  code,
  { rate = 1, mount = false, delay = 0, snapshot = false } = {}
) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route(origin + "/**", async (route) => {
      if (route.request().url().endsWith("/bundle.js")) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        return route.fulfill({
          contentType: "text/javascript",
          body: timed(code)
        })
      }
      return route.fulfill({
        contentType: "text/html",
        body: html(delay > 0 ? undefined : code)
      })
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send("HeapProfiler.enable")
    await cdp.send("Emulation.setCPUThrottlingRate", { rate })
    await page.goto(origin + "/")
    await page.waitForFunction(() =>
      globalThis.__t1 !== undefined &&
      document.querySelector("#app button")?.textContent === "0"
    )
    await settle(page)
    const result = await page.evaluate(() => ({
      eval: globalThis.__t1 - globalThis.__t0,
      untilEval: globalThis.__t1 - globalThis.__tPre,
      before: globalThis.__t0 - globalThis.__tPre
    }))
    result.heap = await gc(cdp)
    if (snapshot) result.snapshot = await heapSnapshot(cdp)
    if (mount) {
      result.mount = await page.evaluate(() =>
        new Promise((resolve) => {
          const kit = document.getElementById("kit")
          const start = performance.now()
          const observer = new MutationObserver(() => {
            if (kit.querySelector(globalThis.__selector)) {
              observer.disconnect()
              resolve(performance.now() - start)
            }
          })
          observer.observe(kit, { childList: true, subtree: true })
          globalThis.__mount()
        })
      )
      await settle(page)
      result.mountHeap = (await gc(cdp)) - result.heap
    }
    assert.deepEqual(errors, [], "page errors")
    return result
  } finally {
    await context.close()
  }
}

async function heapSnapshot(cdp) {
  let json = ""
  const onChunk = ({ chunk }) => (json += chunk)
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk)
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false })
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk)
  const { snapshot: { meta }, nodes, strings } = JSON.parse(json)
  const fields = meta.node_fields
  const types = meta.node_types[0]
  const [type, name, size] = ["type", "name", "self_size"].map((field) =>
    fields.indexOf(field)
  )
  const groups = new Map()
  for (let i = 0; i < nodes.length; i += fields.length) {
    const kind = types[nodes[i + type]]
    const key = kind === "object" || kind === "closure" || kind === "native"
      ? kind + " " + strings[nodes[i + name]].slice(0, 60)
      : kind
    const group = groups.get(key) ?? { count: 0, size: 0 }
    group.count++
    group.size += nodes[i + size]
    groups.set(key, group)
  }
  return groups
}

const stat = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: (sorted[Math.floor((sorted.length - 1) / 2)] +
      sorted[Math.ceil((sorted.length - 1) / 2)]) / 2,
    min: sorted[0],
    max: sorted.at(-1)
  }
}
const column = (runs, key) => stat(runs.map((run) => run[key]))
const sum = (values) => values.reduce((a, b) => a + b, 0)
const fixed = (value) => value.toFixed(2)
const ms = ({ median, min, max }) =>
  fixed(median) + " (" + fixed(min) + "-" + fixed(max) + ")"
const kib = (bytes) => (bytes / 1024).toFixed(0)
const kb = ({ median, min, max }) =>
  kib(median) + " (" + kib(min) + "-" + kib(max) + ")"
// A figure's two cells: its stat, then its median minus the baseline's.
const versus = (runs, baseline, key, format, delta) => {
  const figure = column(runs, key)
  return [
    format(figure),
    delta(figure.median - column(baseline, key).median)
  ]
}
const table = (headers, rows) =>
  [headers, headers.map(() => "---"), ...rows].map((cells) =>
    "| " + cells.join(" | ") + " |"
  ).join("\n")
const report = []
const section = (title, ...body) =>
  report.push("", "#### " + title, "", ...body)

for (const directory of [ui, uiKit]) {
  assert.ok(
    fs.existsSync(path.join(directory, "dist/index.js")),
    "Run pnpm build first."
  )
}
const root = fs.mkdtempSync(path.join(tmpdir(), "ui-kit-startup-"))
const result = { vite, effect, node: process.version, samples }
try {
  install(root, pack(ui, root), "@effect/ui")
  install(root, pack(uiKit, root), "@effect/ui-kit")
  fs.symlinkSync(effectDir, path.join(root, "node_modules/effect"))

  // Each page minified, to measure, and unminified (plain), for binding and constructor names.
  const pages = {}
  const plain = {}
  result.pages = {}
  for (const [name, source] of Object.entries(variants)) {
    pages[name] = await bundle(root, name, source + shell)
    plain[name] = await bundle(root, "plain-" + name, source + shell, false)
    const { code } = pages[name]
    result.pages[name] = {
      kept: keptBindings(plain[name]),
      raw: Buffer.byteLength(code),
      gzip: gzipSync(code, { level: 9 }).length,
      kitModules: kitModules(pages[name]).map((
        [id, info]
      ) => [kitPath(id), info.renderedLength])
    }
  }
  const order = Object.entries(pages).map((
    [name, page]
  ) => ["runs", name, page.code])
  for (const [name, source] of Object.entries(mounts)) {
    const page = await bundle(root, "mount-" + name, shell + source)
    order.push(["mountRuns", name, page.code])
  }

  const browser = await chromium.launch({
    executablePath: values.chromium ?? process.env.CHROMIUM ?? which(),
    headless: true
  })
  result.chromium = browser.version()
  report.push(
    "Chromium " + browser.version() + ", Vite " + vite +
      " (production, Oxc minify, es2023), effect " + effect +
      ", Node " + process.version + ", " + cpus().length +
      " CPUs at load average " +
      loadavg().map((load) => load.toFixed(0)).join("/") + ". " + samples +
      " samples per figure, each in a fresh browser context; median (min-max). + columns subtract the baseline median."
  )

  // The timer check: serving the chunk as a module script 250 ms late moves __t0, not eval.
  result.timerCheck = {}
  for (
    const [mode, delay] of [["inline module script", 0], [
      "external module script, served 250 ms late",
      250
    ]]
  ) {
    const runs = []
    for (let i = 0; i < 10; i++) {
      runs.push(await sample(browser, pages.all.code, { delay }))
    }
    const before = column(runs, "before")
    assert.ok(before.min >= delay, "the delayed chunk ran before its delay")
    result.timerCheck[mode] = { eval: column(runs, "eval"), before }
  }

  for (const rate of [1, 4]) {
    const measured = result["x" + rate] = { runs: {}, mountRuns: {} }
    for (let round = 0; round < samples; round++) {
      for (let i = 0; i < order.length; i++) {
        const [kind, name, code] = order[(i + round) % order.length]
        ;(measured[kind][name] ??= []).push(
          await sample(browser, code, { rate, mount: kind === "mountRuns" })
        )
      }
    }
  }

  const snapshot = async (name) =>
    (await sample(browser, plain[name].code, { snapshot: true })).snapshot
  const snapBase = await snapshot("baseline")
  const snapAll = await snapshot("all")
  await browser.close()

  section(
    "What the bundler kept",
    table(
      [
        "Page",
        "Raw B",
        "Gzip B",
        "+gzip B",
        "Kit modules",
        "Kit rendered B",
        "Kit top-level bindings kept"
      ],
      Object.entries(result.pages).map(([name, page]) => {
        const kept = Object.values(page.kept)
        const declared = sum(kept.map((module) => module.declared))
        return [
          name,
          page.raw,
          page.gzip,
          page.gzip - result.pages.baseline.gzip,
          page.kitModules.length,
          sum(page.kitModules.map(([, length]) => length)),
          declared - sum(kept.map((module) => module.dropped.length)) +
          " of " + declared
        ]
      })
    )
  )
  for (const name of ["checkbox", "combobox", "eight"]) {
    const page = result.pages[name]
    const dropped = Object.entries(page.kept).filter(([, module]) =>
      module.dropped.length > 0
    )
    report.push(
      "",
      name + " kit modules (rendered B): " +
        page.kitModules.map(([id, length]) => id + " " + length).join(", "),
      "",
      name + " dropped bindings: " +
        (dropped.map(([id, module]) =>
          id + " (" + module.dropped.join(", ") + ")"
        ).join("; ") || "none")
    )
  }

  section(
    "Timer check (all page, 1x, 10 samples)",
    table(
      ["Delivery", "eval ms", "__tPre to __t0 ms"],
      Object.entries(result.timerCheck).map((
        [mode, { eval: e, before }]
      ) => [mode, ms(e), ms(before)])
    )
  )

  for (const rate of [1, 4]) {
    const { mountRuns, runs } = result["x" + rate]
    section(
      "Evaluation and retained heap, " + rate + "x CPU",
      table(
        [
          "Page",
          "eval ms",
          "+eval ms",
          "__tPre to __t1 ms",
          "+__tPre to __t1 ms",
          "heap KiB",
          "+heap KiB"
        ],
        Object.entries(runs).map(([name, list]) => [
          name,
          ...versus(list, runs.baseline, "eval", ms, fixed),
          ...versus(list, runs.baseline, "untilEval", ms, fixed),
          ...versus(list, runs.baseline, "heap", kb, kib)
        ])
      )
    )
    section(
      "First mount, " + rate + "x CPU (the baseline mounts a plain button)",
      table(
        [
          "Page",
          "mount ms",
          "+mount ms",
          "mount heap KiB",
          "+mount heap KiB",
          "page eval ms"
        ],
        Object.entries(mountRuns).map(([name, list]) => [
          name,
          ...versus(list, mountRuns.baseline, "mount", ms, fixed),
          ...versus(list, mountRuns.baseline, "mountHeap", kb, kib),
          ms(column(list, "eval"))
        ])
      )
    )
  }

  const diff = [...new Set([...snapBase.keys(), ...snapAll.keys()])].map(
    (key) => {
      const a = snapBase.get(key) ?? { count: 0, size: 0 }
      const b = snapAll.get(key) ?? { count: 0, size: 0 }
      return [key, b.count - a.count, b.size - a.size]
    }
  ).sort((a, b) => b[2] - a[2])
  section(
    "Heap snapshot, all minus baseline: self size by constructor (unminified builds, 1x, one sample each)",
    "Self size difference: " + kib(sum(diff.map(([, , size]) => size))) +
      " KiB.",
    "",
    table(
      ["Node", "+count", "+KiB"],
      diff.slice(0, 20).map((
        [key, count, size]
      ) => [key.replaceAll("|", "\\|"), count, (size / 1024).toFixed(1)])
    )
  )
  result.snapshotDiff = diff.slice(0, 50)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
console.log(report.join("\n"))
if (values.json) fs.writeFileSync(values.json, JSON.stringify(result) + "\n")
