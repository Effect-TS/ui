import { Window } from "happy-dom"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { parseArgs } from "node:util"
import { gzipSync } from "node:zlib"
import { build, version as vite } from "vite"

const { values: { app: only, base, development, json } } = parseArgs({
  options: {
    app: { type: "string", multiple: true },
    development: { type: "boolean", default: false },
    base: { type: "string" },
    json: { type: "string" }
  }
})
process.env.NODE_ENV = development ? "development" : "production"
const repo = path.resolve(import.meta.dirname, "../../../..")
const ui = path.join(repo, "packages/ui")
const uiKit = path.join(repo, "packages/ui-kit")
const effectDir = path.join(ui, "node_modules/effect")
const effect =
  JSON.parse(fs.readFileSync(path.join(effectDir, "package.json"), "utf8"))
    .version
const target = "es2023"
const origin = "http://localhost:8080"

async function inWindow(run, settings) {
  const window = new Window({
    url: origin + "/",
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      ...settings
    }
  })
  try {
    await run(window, window.document)
  } finally {
    await window.happyDOM.close()
  }
}

async function evaluate(window, chunks) {
  assert.equal(chunks.length, 1, "expected one JavaScript chunk")
  window.eval(chunks[0].code)
  await window.happyDOM.waitUntilComplete()
}

async function checkBaseline(chunks) {
  await inWindow(async (window, document) => {
    document.body.innerHTML = "<div id=\"app\" data-model=\"7\"></div>"
    const app = document.getElementById("app")
    app.dataset.message = JSON.stringify({ _tag: "Decrement" })
    await evaluate(window, chunks)
    assert.equal(
      app.textContent,
      "6",
      "baseline did not run the Layer with the decoded model and message"
    )
  })
}

async function checkCounter(chunks) {
  await inWindow(async (window, document) => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    await evaluate(window, chunks)
    const count = () => document.querySelector("#app span")?.textContent
    assert.equal(count(), "0", "counter did not mount")
    const increment = [...document.querySelectorAll("button")].find((button) =>
      button.textContent === "+"
    )
    assert.ok(increment, "missing increment button")
    increment.click()
    await window.happyDOM.waitUntilComplete()
    assert.equal(count(), "1", "counter did not increment")
  })
}

async function checkFeatures(chunks) {
  await inWindow(async (window, document) => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    await evaluate(window, chunks)
    const app = document.getElementById("app")
    assert.equal(
      app.textContent,
      "badgebreak0",
      "the app did not show the Layer's child in its slot"
    )
    document.querySelector("#app button").click()
    await window.happyDOM.waitUntilComplete()
    assert.equal(
      app.textContent,
      "badgedown1",
      "the app did not show the fallback and hear of the failure"
    )
  })
}

async function checkMenu(chunks) {
  await inWindow(async (window, document) => {
    // happy-dom has no popover API, which the menu's positioner uses.
    const open = new Set()
    const element = window.HTMLElement.prototype
    element.showPopover = function() {
      open.add(this)
      this.dispatchEvent(
        Object.assign(new window.Event("beforetoggle"), { newState: "open" })
      )
    }
    element.hidePopover = function() {
      open.delete(this)
    }
    const matches = window.Element.prototype.matches
    window.Element.prototype.matches = function(selector) {
      return selector === ":popover-open"
        ? open.has(this)
        : matches.call(this, selector)
    }
    document.body.innerHTML = "<div id=\"app\"></div>"
    await evaluate(window, chunks)
    const trigger = document.querySelector("#app button")
    assert.ok(trigger, "the menu did not mount")
    assert.equal(trigger.getAttribute("aria-expanded"), "false")
    trigger.click()
    await window.happyDOM.waitUntilComplete()
    assert.equal(
      trigger.getAttribute("aria-expanded"),
      "true",
      "the menu did not open"
    )
    assert.ok(
      document.querySelector("#app [role=menuitem]"),
      "the menu did not draw its item"
    )
  })
}

async function checkRouting(chunks, entry) {
  const directory = fs.mkdtempSync(
    path.join(tmpdir(), "ui-bundle-size-routing-")
  )
  try {
    for (const chunk of chunks) {
      const file = path.join(directory, chunk.fileName)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      // happy-dom compiles modules as scripts, where `import.meta` is a syntax error.
      fs.writeFileSync(
        file,
        chunk.code.replaceAll(
          "import.meta",
          `({ url: ${JSON.stringify(origin + "/" + chunk.fileName)} })`
        )
      )
    }
    await inWindow(async (window, document) => {
      document.body.innerHTML = "<div id=\"root\"></div>"
      const script = document.createElement("script")
      script.type = "module"
      script.src = origin + "/" + entry
      document.body.appendChild(script)
      await window.happyDOM.waitUntilComplete()
      const heading = () => document.querySelector("#root h1")?.textContent
      assert.equal(
        heading(),
        "Welcome Home",
        "routing did not mount the home page"
      )
      assert.equal(document.title, "Routing", "routing did not set the title")
      const link = (name) =>
        [...document.querySelectorAll("#root nav a")].find((a) =>
          a.textContent === name
        )
      link("Nested").click()
      await window.happyDOM.waitUntilComplete()
      assert.equal(
        window.location.pathname,
        "/nested/route/is/very/nested",
        "routing did not navigate"
      )
      assert.equal(
        heading(),
        "Very Nested Route!",
        "routing did not render the nested page"
      )
      assert.equal(
        document.title,
        "Nested | Routing",
        "routing did not update the title"
      )
    }, { fetch: { virtualServers: [{ url: origin, directory }] } })
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

async function bundle(root, input, check) {
  // `mode` and `format` are Vite's defaults, pinned because the report states them.
  const { output } = await build({
    configFile: false,
    root,
    mode: "production",
    logLevel: "warn",
    build: {
      target,
      write: false,
      rolldownOptions: { input, output: { format: "es" } }
    }
  })
  const chunks = output.filter((file) => file.type === "chunk")
  assert.equal(chunks.length, output.length, "expected JavaScript chunks only")
  await check(chunks, chunks.find((chunk) => chunk.isEntry).fileName)
  return {
    chunks: chunks.length,
    raw: chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
    gzip: chunks.reduce(
      (sum, chunk) => sum + gzipSync(chunk.code, { level: 9 }).length,
      0
    )
  }
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

const benchmark = (file) => path.join(import.meta.dirname, file)
const apps = [
  {
    name: "counter",
    variant: "",
    check: checkCounter,
    prepare: (root) => {
      const input = path.join(root, "counter.ts")
      fs.copyFileSync(
        benchmark("counter.ts"),
        input
      )
      return { root, input }
    }
  },
  {
    name: "features",
    variant: "",
    check: checkFeatures,
    prepare: (root) => {
      const input = path.join(root, "features.ts")
      fs.copyFileSync(
        benchmark("features.ts"),
        input
      )
      return { root, input }
    }
  },
  {
    name: "menu",
    variant: "",
    check: checkMenu,
    prepare: (root) => {
      const input = path.join(root, "menu.ts")
      fs.copyFileSync(benchmark("menu.ts"), input)
      return { root, input }
    }
  },
  {
    name: "routing",
    variant: "",
    check: checkRouting,
    prepare: (root) => {
      const example = path.join(repo, "examples/routing")
      const app = path.join(root, "routing")
      fs.cpSync(path.join(example, "src"), path.join(app, "src"), {
        recursive: true
      })
      fs.copyFileSync(
        path.join(example, "package.json"),
        path.join(app, "package.json")
      )
      return { root: app, input: path.join(app, "src/main.ts") }
    }
  }
].filter((app) => only === undefined || only.includes(app.name))
for (const name of only ?? []) {
  assert.ok(
    apps.some((app) => app.name === name),
    "unknown app: " + name
  )
}

async function measure() {
  for (const directory of [ui, uiKit]) {
    assert.ok(
      fs.existsSync(path.join(directory, "dist/index.js")),
      "Missing " + directory + "/dist. Run pnpm build first."
    )
  }
  const root = fs.mkdtempSync(path.join(tmpdir(), "ui-bundle-size-"))
  try {
    install(root, pack(ui, root), "@effect/ui")
    install(root, pack(uiKit, root), "@effect/ui-kit")
    fs.symlinkSync(effectDir, path.join(root, "node_modules/effect"))
    const baselineInput = path.join(root, "effect-only.ts")
    fs.copyFileSync(benchmark("effect-only.ts"), baselineInput)
    const baseline = await bundle(root, baselineInput, checkBaseline)
    const results = []
    for (const app of apps) {
      const { input, root: appRoot } = app.prepare(root)
      const size = await bundle(appRoot, input, app.check)
      results.push({
        name: app.name,
        variant: app.variant,
        ...size,
        addedGzip: size.gzip - baseline.gzip
      })
    }
    return {
      vite,
      effect,
      node: process.version,
      development,
      baselineGzip: baseline.gzip,
      apps: results
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function previousApps(previous) {
  if (Array.isArray(previous.apps)) return previous
  const variant =
    previous.elements === undefined || previous.elements === "Html"
      ? ""
      : previous.elements
  return {
    development: false,
    apps: [{ name: "counter", variant, raw: previous.raw, gzip: previous.gzip }]
  }
}

const label = (app) => app.name + (app.variant ? " (" + app.variant + ")" : "")
const signed = (delta) => delta > 0 ? "+" + delta : String(delta)
const result = await measure()
const headers = ["App", "Chunks", "Raw bytes", "Gzip bytes", "Added gzip B"]
const rows = result.apps.map((
  app
) => [label(app), app.chunks, app.raw, app.gzip, app.addedGzip])
if (base) {
  const previous = previousApps(JSON.parse(fs.readFileSync(base, "utf8")))
  headers.push("Δ raw bytes", "Δ gzip bytes")
  result.apps.forEach((app, index) => {
    const before = previous.development === development &&
      previous.apps.find((candidate) =>
        candidate.name === app.name && candidate.variant === app.variant
      )
    const valid = before && Number.isSafeInteger(before.raw) &&
      Number.isSafeInteger(before.gzip)
    rows[index].push(
      ...(valid
        ? [signed(app.raw - before.raw), signed(app.gzip - before.gzip)]
        : ["n/a", "n/a"])
    )
  })
}
const report = [
  "### Bundle size",
  "",
  `Vite ${vite}/Rolldown, production${
    development ? " without the production condition" : ""
  }, default Oxc minification, ${target}, ES modules, gzip level 9 per chunk. effect ${effect}, Node ${process.version}. Effect-only client: ${result.baselineGzip} B gzip.`,
  "",
  ...[headers, headers.map(() => "---"), ...rows].map((cells) =>
    "| " + cells.join(" | ") + " |"
  ),
  ""
].join("\n")
console.log(report)
if (json) fs.writeFileSync(json, JSON.stringify(result) + "\n")
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
}
