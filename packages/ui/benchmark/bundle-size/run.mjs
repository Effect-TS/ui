import { Window } from "happy-dom"
// Size of a minimal counter client bundled with Vite against the packed @effect/ui.
//
// Run from the repository root, after `pnpm build`:
//
//   pnpm bundle-size [--json <file>] [--base <file>] [--vocabulary]
//
// Added gzip bytes are the counter total minus a separately bundled effect-only client.
// Pass --vocabulary to measure the opt-in counter with the same click assertion.
//
// --json writes the result and --base adds deltas against an earlier --json file. The table is also
// appended to $GITHUB_STEP_SUMMARY when that is set.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { parseArgs } from "node:util"
import { gzipSync } from "node:zlib"
import { build, version as vite } from "vite"

const { values: { base, json, vocabulary } } = parseArgs({
  options: { vocabulary: { type: "boolean", default: false }, base: { type: "string" }, json: { type: "string" } }
})
const ui = path.resolve(import.meta.dirname, "../..")
const effectDir = path.join(ui, "node_modules/effect")
const effect = JSON.parse(fs.readFileSync(path.join(effectDir, "package.json"), "utf8")).version
const target = "es2023"

async function checkClient(code, baseline) {
  const window = new Window({
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true }
  })
  try {
    const document = window.document
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.getElementById("app")
    app.dataset.model = "7"
    app.dataset.message = JSON.stringify({ _tag: "Decrement" })
    window.eval(code)
    await window.happyDOM.waitUntilComplete()
    if (baseline) {
      assert.equal(app.textContent, "6", "baseline did not run the Layer with the decoded model and message")
      return
    }
    const count = () => document.querySelector("#app span")?.textContent
    assert.equal(count(), "0", "counter did not mount")
    const increment = [...document.querySelectorAll("button")].find((button) => button.textContent === "+")
    assert.ok(increment, "missing increment button")
    increment.click()
    await window.happyDOM.waitUntilComplete()
    assert.equal(count(), "1", "counter did not increment")
  } finally {
    await window.happyDOM.close()
  }
}

async function bundle(root, input, baseline) {
  // `mode` and `format` are Vite's defaults, pinned because the report states them.
  const { output } = await build({
    configFile: false,
    root,
    mode: "production",
    logLevel: "warn",
    build: { target, write: false, rolldownOptions: { input, output: { format: "es" } } }
  })
  assert.ok(output.length === 1 && output[0].type === "chunk", "expected one JavaScript chunk")
  const code = output[0].code
  await checkClient(code, baseline)
  return { raw: Buffer.byteLength(code), gzip: gzipSync(code, { level: 9 }).length }
}

async function measure() {
  assert.ok(fs.existsSync(path.join(ui, "dist/index.js")), "Missing @effect/ui dist. Run pnpm build first.")
  const root = fs.mkdtempSync(path.join(tmpdir(), "ui-bundle-size-"))
  try {
    // Bundle as an external consumer: the workspace manifest exports src, not dist.
    const packed = path.join(root, "ui.tgz")
    const modules = path.join(root, "node_modules")
    const installed = path.join(modules, "@effect/ui")
    fs.mkdirSync(installed, { recursive: true })
    execFileSync("pnpm", ["pack", "--out", packed], { cwd: ui })
    execFileSync("tar", ["-xzf", packed, "--strip-components=1", "-C", installed])
    fs.symlinkSync(effectDir, path.join(modules, "effect"))
    const input = path.join(root, "counter.ts")
    const source = fs.readFileSync(path.join(import.meta.dirname, "counter.ts"), "utf8")
    const binding = "elements: Html"
    if (vocabulary) assert.equal(source.split(binding).length, 2, "expected exactly one vocabulary binding")
    fs.writeFileSync(input, vocabulary ? source.replace(binding, "elements: Html.vocabulary") : source)
    const baselineInput = path.join(root, "effect-only.ts")
    fs.copyFileSync(path.join(import.meta.dirname, "effect-only.ts"), baselineInput)
    const counter = await bundle(root, input, false)
    const baseline = await bundle(root, baselineInput, true)
    return { ...counter, baselineGzip: baseline.gzip, addedGzip: counter.gzip - baseline.gzip, vite, effect, node: process.version }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const elements = vocabulary ? "Html.vocabulary" : "Html"
const result = { ...await measure(), elements }
const headers = ["Elements", "Vite", "effect", "Node", "Raw bytes", "Gzip bytes", "Effect-only gzip B", "Added gzip B"]
const row = [elements, result.vite, result.effect, result.node, result.raw, result.gzip, result.baselineGzip, result.addedGzip]
if (base) {
  const previous = JSON.parse(fs.readFileSync(base, "utf8"))
  assert.equal(previous.elements ?? "Html", elements, "baseline uses a different vocabulary")
  for (const metric of ["raw", "gzip"]) {
    assert.ok(Number.isSafeInteger(previous[metric]), "invalid baseline: missing " + metric + " bytes")
    const delta = result[metric] - previous[metric]
    headers.push("Δ " + metric + " bytes")
    row.push(delta > 0 ? "+" + delta : delta)
  }
}
const report = [
  "### Counter bundle size",
  "",
  `Vite/Rolldown, production, default Oxc minification, ${target}, single ES module, gzip level 9.`,
  "",
  ...[headers, headers.map(() => "---"), row].map((cells) => "| " + cells.join(" | ") + " |"),
  ""
].join("\n")
console.log(report)
if (json) fs.writeFileSync(json, JSON.stringify(result) + "\n")
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
