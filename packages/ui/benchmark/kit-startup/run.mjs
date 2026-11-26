// Startup cost of @effect/ui-kit definitions that a page imports and retains but never mounts, in
// headless Chromium. Run from the repository root, after `pnpm build`:
//
//   node packages/ui/benchmark/kit-startup/run.mjs [--samples 20] [--chromium <path>] [--json <file>]
//
// The browser is --chromium, else $CHROMIUM, else `chromium` on PATH, else the Chromium that the
// `playwright` dev dependency installed.
//
// Every page is a Vite production build against the packed @effect/ui and @effect/ui-kit, as an
// external consumer would get them. It defines the same one-button @effect/ui shell, and
// the kit variants also store their imports in globalThis.__retained so the bundler keeps them:
//
//   baseline  the shell only
//   checkbox  + Checkbox
//   combobox  + Combobox
//   eight     + Accordion, Checkbox, Dialog, Popover, Select, Switch, Tabs, Tooltip
//   all       + every export, through the barrel's namespace
//
// The timer is part of the bundle: globalThis.__t0 = performance.now() is prepended to the built
// chunk and __t1 appended, so "eval" is the chunk's top-level execution only. Fetching and
// scheduling the script happen before __t0 runs, so they can't reach it; the run checks that by
// also loading the all page as a module script delayed by 250 ms. Each page inlines the chunk in a
// classic <script> after one that records __tPre, so "script" (__t1 - __tPre) adds the parse and
// compile of that inline chunk. The page then mounts the shell into #app, outside both figures.
//
// Each sample is a fresh browser context (no code cache, no shared heap). After the page settles,
// the run forces a GC twice over CDP and reads Runtime.getHeapUsage: "heap" is the used JS heap.
// Mount pages (checkbox, combobox, and a plain button for the baseline) then call __mount(), which
// launches a second app drawing that definition into #kit: "mount" runs from the call to the
// MutationObserver callback that sees its root, and "mount heap" is the used heap after another GC,
// minus "heap". Variants rotate each round; every figure is the median (min-max) of the samples,
// at 1x and at 4x CPU throttling (Emulation.setCPUThrottlingRate).
//
// The run also takes one heap snapshot each of baseline and all, built without minification so
// constructor names survive, and lists the largest differences by node type and constructor.
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
  const [chunk] = output
  // Inlined as a classic script, so it must not need module syntax. Unminified builds keep comments
  // that mention it; a real use there fails as a page error.
  if (minify) {
    const syntax = chunk.code.match(/\bimport\.meta\b|^\s*(import|export)\b.*/m)
    assert.ok(syntax === null, name + ": module syntax: " + syntax?.[0])
  }
  const kit = Object.entries(chunk.modules).filter(([id]) =>
    id.includes("/@effect/ui-kit/")
  )
  // Statement level: each kit module's top-level bindings that the unminified chunk still declares.
  // Rolldown suffixes a name with $n when it would collide.
  const kept = {}
  if (!minify) {
    for (const [id] of kit) {
      const declared = [
        ...fs.readFileSync(id, "utf8").matchAll(
          /^(?:export )?(?:const|let|function\*?|class) (\w+)/gm
        )
      ]
        .map((match) => match[1])
      kept[id.replace(/^.*\/@effect\/ui-kit\/dist\//, "")] = {
        declared: declared.length,
        dropped: declared.filter((name) =>
          !new RegExp(
            "\\b(?:const|let|var|function\\*?|class) " + name +
              "(?:\\$\\d+)?\\b"
          ).test(chunk.code)
        )
      }
    }
  }
  return {
    kept,
    code: chunk.code,
    raw: Buffer.byteLength(chunk.code),
    gzip: gzipSync(chunk.code, { level: 9 }).length,
    kitModules: kit.map((
      [id, info]
    ) => [id.replace(/^.*\/@effect\/ui-kit\/dist\//, ""), info.renderedLength])
  }
}

// The shell starts after __t1, so eval covers module evaluation only.
const timed = (code) =>
  "globalThis.__t0=performance.now();\n" + code +
  "\n;globalThis.__t1=performance.now();globalThis.__start();"
const html = (code) =>
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><div id=\"app\"></div><div id=\"kit\"></div>" +
  "<script>globalThis.__tPre=performance.now()</script>" +
  (code === undefined
    ? "<script type=\"module\" src=\"/bundle.js\"></script>"
    : "<script>" + timed(code).replaceAll("</script", "<\\/script") +
      "</script>") +
  "</body></html>"

async function gc(cdp) {
  await cdp.send("HeapProfiler.collectGarbage")
  await cdp.send("HeapProfiler.collectGarbage")
  return (await cdp.send("Runtime.getHeapUsage")).usedSize
}

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
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
    const result = await page.evaluate(() => ({
      eval: globalThis.__t1 - globalThis.__t0,
      script: globalThis.__t1 - globalThis.__tPre,
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
      await page.evaluate(() =>
        new Promise((resolve) => setTimeout(resolve, 50))
      )
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
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted.at(-1)
  }
}
const ms = ({ median, min, max }) =>
  median.toFixed(2) + " (" + min.toFixed(2) + "-" + max.toFixed(2) + ")"
const kib = (bytes) => (bytes / 1024).toFixed(0)
const kb = ({ median, min, max }) =>
  kib(median) + " (" + kib(min) + "-" + kib(max) + ")"
const table = (headers, rows) =>
  [headers, headers.map(() => "---"), ...rows].map((cells) =>
    "| " + cells.join(" | ") + " |"
  ).join("\n")

for (const directory of [ui, uiKit]) {
  assert.ok(
    fs.existsSync(path.join(directory, "dist/index.js")),
    "Run pnpm build first."
  )
}
const root = fs.mkdtempSync(path.join(tmpdir(), "ui-kit-startup-"))
const result = { vite, effect, node: process.version, samples }
const report = []
try {
  install(root, pack(ui, root), "@effect/ui")
  install(root, pack(uiKit, root), "@effect/ui-kit")
  fs.symlinkSync(effectDir, path.join(root, "node_modules/effect"))

  const pages = {}
  for (const [name, source] of Object.entries(variants)) {
    pages[name] = await bundle(root, name, source + shell)
    pages[name].kept =
      (await bundle(root, "plain-" + name, source + shell, false)).kept
  }
  const mountPages = {}
  for (const [name, source] of Object.entries(mounts)) {
    mountPages[name] = await bundle(root, "mount-" + name, shell + source)
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
  const check = {}
  for (
    const [mode, delay] of [["inline classic script", 0], [
      "module script, served 250 ms late",
      250
    ]]
  ) {
    const runs = []
    for (let i = 0; i < 10; i++) {
      runs.push(await sample(browser, pages.all.code, { delay }))
    }
    check[mode] = {
      eval: stat(runs.map((r) => r.eval)),
      before: stat(runs.map((r) => r.before))
    }
  }
  assert.ok(
    Object.values(check)[1].before.min >= 250,
    "the delayed chunk ran before its delay"
  )

  const measured = {}
  for (const rate of [1, 4]) {
    const runs = Object.fromEntries(
      Object.keys(pages).map((name) => [name, []])
    )
    const mountRuns = Object.fromEntries(
      Object.keys(mountPages).map((name) => [name, []])
    )
    const order = [
      ...Object.keys(pages).map((name) => [runs[name], pages[name], false]),
      ...Object.keys(mountPages).map((
        name
      ) => [mountRuns[name], mountPages[name], true])
    ]
    for (let round = 0; round < samples; round++) {
      for (let i = 0; i < order.length; i++) {
        const [into, page, mount] = order[(i + round) % order.length]
        into.push(await sample(browser, page.code, { rate, mount }))
      }
    }
    measured[rate] = { runs, mountRuns }
  }

  // Heap snapshots of unminified builds, for constructor names.
  const snapBase = (await sample(
    browser,
    (await bundle(root, "plain-baseline", shell, false)).code,
    {
      snapshot: true
    }
  )).snapshot
  const snapAll = (await sample(
    browser,
    (await bundle(root, "plain-all", variants.all + shell, false)).code,
    {
      snapshot: true
    }
  )).snapshot
  await browser.close()

  const median = (values) => stat(values).median
  const base = pages.baseline
  report.push("", "#### What the bundler kept", "")
  report.push(table(
    [
      "Page",
      "Raw B",
      "Gzip B",
      "+gzip B",
      "Kit modules",
      "Kit rendered B",
      "Kit top-level bindings kept"
    ],
    Object.entries(pages).map(([name, page]) => {
      const kept = Object.values(page.kept)
      const declared = kept.reduce((sum, module) => sum + module.declared, 0)
      return [
        name,
        page.raw,
        page.gzip,
        page.gzip - base.gzip,
        page.kitModules.length,
        page.kitModules.reduce((sum, [, length]) => sum + length, 0),
        declared - kept.reduce((sum, module) =>
          sum + module.dropped.length, 0) +
        " of " + declared
      ]
    })
  ))
  for (const name of ["checkbox", "combobox", "eight"]) {
    const dropped = Object.entries(pages[name].kept).filter(([, module]) =>
      module.dropped.length > 0
    )
    report.push(
      "",
      name + " kit modules (rendered B): " +
        pages[name].kitModules.map(([id, length]) => id + " " + length).join(
          ", "
        ),
      "",
      name + " dropped bindings: " +
        (dropped.map(([id, module]) =>
          id + " (" + module.dropped.join(", ") + ")"
        ).join("; ") || "none")
    )
  }
  result.pages = Object.fromEntries(
    Object.entries(pages).map(([name, { code, ...page }]) => [name, page])
  )

  report.push("", "#### Timer check (all page, 1x, 10 samples)", "")
  report.push(table(
    ["Delivery", "eval ms", "__tPre to __t0 ms"],
    Object.entries(check).map((
      [mode, { eval: e, before }]
    ) => [mode, ms(e), ms(before)])
  ))
  result.timerCheck = check

  for (const rate of [1, 4]) {
    const { mountRuns, runs } = measured[rate]
    const baseEval = median(runs.baseline.map((r) => r.eval))
    const baseScript = median(runs.baseline.map((r) => r.script))
    const baseHeap = median(runs.baseline.map((r) => r.heap))
    report.push("", "#### Evaluation and retained heap, " + rate + "x CPU", "")
    report.push(table(
      [
        "Page",
        "eval ms",
        "+eval ms",
        "script ms",
        "+script ms",
        "heap KiB",
        "+heap KiB"
      ],
      Object.entries(runs).map(([name, list]) => {
        const e = stat(list.map((r) => r.eval))
        const s = stat(list.map((r) => r.script))
        const h = stat(list.map((r) => r.heap))
        return [
          name,
          ms(e),
          (e.median - baseEval).toFixed(2),
          ms(s),
          (s.median - baseScript).toFixed(2),
          kb(h),
          kib(h.median - baseHeap)
        ]
      })
    ))
    const baseMount = median(mountRuns.baseline.map((r) => r.mount))
    const baseMountHeap = median(mountRuns.baseline.map((r) => r.mountHeap))
    report.push(
      "",
      "#### First mount, " + rate +
        "x CPU (the baseline mounts a plain button)",
      ""
    )
    report.push(table(
      [
        "Page",
        "mount ms",
        "+mount ms",
        "mount heap KiB",
        "+mount heap KiB",
        "page eval ms"
      ],
      Object.entries(mountRuns).map(([name, list]) => {
        const m = stat(list.map((r) => r.mount))
        const h = stat(list.map((r) => r.mountHeap))
        return [
          name,
          ms(m),
          (m.median - baseMount).toFixed(2),
          kb(h),
          kib(h.median - baseMountHeap),
          ms(stat(list.map((r) => r.eval)))
        ]
      })
    ))
    result["x" + rate] = measured[rate]
  }

  const diff = [...new Set([...snapBase.keys(), ...snapAll.keys()])].map(
    (key) => {
      const a = snapBase.get(key) ?? { count: 0, size: 0 }
      const b = snapAll.get(key) ?? { count: 0, size: 0 }
      return [key, b.count - a.count, b.size - a.size]
    }
  ).sort((a, b) => b[2] - a[2])
  report.push(
    "",
    "#### Heap snapshot, all minus baseline (unminified builds, 1x, one sample each)",
    ""
  )
  report.push(
    "Self size difference: " + kib(diff.reduce((sum, [, , size]) =>
      sum + size, 0)) +
      " KiB.",
    ""
  )
  report.push(table(
    ["Node", "+count", "+KiB"],
    diff.slice(0, 20).map((
      [key, count, size]
    ) => [key.replaceAll("|", "\\|"), count, (size / 1024).toFixed(1)])
  ))
  result.snapshotDiff = diff.slice(0, 50)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
console.log(report.join("\n"))
if (values.json) fs.writeFileSync(values.json, JSON.stringify(result) + "\n")
