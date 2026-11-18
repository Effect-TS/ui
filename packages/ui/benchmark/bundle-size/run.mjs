import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { parseArgs } from "node:util"
import { gzipSync } from "node:zlib"
import { Window } from "happy-dom"
import { build, version as vite } from "vite"

const { values: { base, json } } = parseArgs({ options: { base: { type: "string" }, json: { type: "string" } } })
const ui = path.resolve(import.meta.dirname, "../..")
const effectManifest = createRequire(import.meta.url).resolve("effect/package.json")
const effect = JSON.parse(fs.readFileSync(effectManifest, "utf8")).version
const target = "es2023"

async function checkCounter(code) {
  const window = new Window({ settings: { enableJavaScriptEvaluation: true } })
  try {
    const document = window.document
    document.body.innerHTML = '<div id="app"></div>'
    window.eval(code)
    await window.happyDOM.waitUntilComplete()
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
    fs.symlinkSync(path.dirname(effectManifest), path.join(modules, "effect"), "dir")
    const input = path.join(root, "counter.ts")
    fs.copyFileSync(path.join(import.meta.dirname, "counter.ts"), input)
    const { output } = await build({
      configFile: false,
      root,
      mode: "production",
      logLevel: "warn",
      build: { target, write: false, rolldownOptions: { input, output: { format: "es" } } }
    })
    assert.ok(output.length === 1 && output[0].type === "chunk", "expected one JavaScript chunk")
    const code = output[0].code
    await checkCounter(code)
    return { raw: Buffer.byteLength(code), gzip: gzipSync(code, { level: 9 }).length, vite, effect, node: process.version }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const result = await measure()
const headers = ["Vite", "effect", "Node", "Raw bytes", "Gzip bytes"]
const row = [vite, effect, result.node, result.raw, result.gzip]
if (base) {
  const previous = JSON.parse(fs.readFileSync(base, "utf8"))
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
