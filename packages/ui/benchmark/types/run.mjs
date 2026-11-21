import { execFileSync, spawn } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    main: { type: "boolean" },
    lsp: { type: "boolean" },
    sessions: { type: "string", default: "3" },
    json: { type: "string" },
    base: { type: "string" }
  }
})

const imports = [
  `import { Component, UiSchema } from "@effect/ui"`,
  `import { Html } from "@effect/ui/html"`,
  `import { Schema } from "effect"`
].join("\n")

const scopedField = (scoped) => values.main ? "" : `\n  scoped: ${scoped},`

// What the library costs a file that uses it, measured on its own and taken off the deep chain.
const importsOnly = `${imports}

export const used = [Component.define, UiSchema.TaggedEnum, Html, Schema.String]
`

const leaves = (scoped) => {
  const out = [imports, ""]
  for (let i = 0; i < 100; i++) {
    out.push(`const M${i} = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
const E${i} = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
export const C${i} = Component.define({
  name: "C${i}",${scopedField(scoped)}
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ draft: Schema.String }),
  message: M${i},
  events: E${i},
  elements: Html
}).make({
  init: () => ({ draft: "" }),
  update: (_model, message, $) => $.set({ draft: message.value }).emit(E${i}.Saved({ id: message.value })),
  view: (model, h) => h.p(model.draft)
})
`)
  }
  return out.join("\n")
}

const names = Array.from({ length: 100 }, (_, i) => `C${i}`)
const onEmit = `onEmit: { Saved: (e) => OwnerMessage.ChildSaved({ id: e.id }) }`

const owner = (scoped) => {
  const at = scoped ? "s" : "h"
  const placed = names.map((name, i) =>
    i % 3 === 0
      ? `${name}(${at}, { key: "c${i}", props: { id: model.selected ?? "c${i}" }, ${onEmit} })`
      : i % 3 === 1
      ? `model.selected !== null && ${name}(${at}, { key: "c${i}", props: { id: model.selected }, ${onEmit} })`
      : `model.order.map((id) => ${name}(${at}, { key: id, props: { id: id }, ${onEmit} }))`
  )
  const view = scoped
    ? `h.div(
      h.scoped((s) => [
        ${placed.filter((_, i) => i % 3 !== 2).join(",\n        ")}
      ]),
      h.scoped(({ model, key }) => model.order.includes(key), (s) =>
        h.div(
          ${placed.filter((_, i) => i % 3 === 2).join(",\n          ")}
        ))
    )`
    : `h.div(
      ${placed.join(",\n      ")}
    )`
  return `${imports}
import { ${names.join(", ")} } from "./${scoped ? "scoped" : "inline"}-leaves.ts"

const OwnerMessage = UiSchema.TaggedEnum({ ChildSaved: { id: Schema.String } })
export const Owner = Component.define({
  name: "Owner",${scopedField(false)}
  model: Schema.Struct({ selected: Schema.NullOr(Schema.String), order: Schema.Array(Schema.String) }),
  message: OwnerMessage,
  elements: Html
}).make({
  init: () => ({ selected: null, order: [] }),
  update: (model, message, $) => $.set({ ...model, selected: message.id }),
  view: (model, h) =>
    ${view}
})
`
}

const deep = (scoped, depth) => {
  const out = [imports, ""]
  for (let i = depth - 1; i >= 0; i--) {
    const last = i === depth - 1
    const child = (at) =>
      `L${i + 1}(${at}, { key: "below", props: { id: model.draft }, onEmit: { Saved: (e) => LM${i}.Below({ id: e.id }) } })`
    const below = scoped ? `h.scoped((s) => ${child("s")})` : child("h")
    out.push(`const LM${i} = UiSchema.TaggedEnum({ Typed: { value: Schema.String }, Below: { id: Schema.String } })
const LE${i} = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
export const L${i} = Component.define({
  name: "L${i}",${scopedField(scoped)}
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ draft: Schema.String }),
  message: LM${i},
  events: LE${i},
  elements: Html
}).make({
  init: () => ({ draft: "" }),
  update: (model, message, $) =>
    message._tag === "Typed"
      ? $.set({ draft: message.value })
      : $.set(model).emit(LE${i}.Saved({ id: message.id })),
  view: (model, h) => h.div(h.p(model.draft)${last ? "" : `, ${below}`})
})
`)
  }
  return out.join("\n")
}

const generate = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const files = {
    "imports.ts": importsOnly,
    "inline-leaves.ts": leaves(false),
    "inline-owner.ts": owner(false),
    "inline-deep8.ts": deep(false, 8),
    "inline-deep16.ts": deep(false, 16)
  }
  if (!values.main) {
    Object.assign(files, {
      "scoped-leaves.ts": leaves(true),
      "scoped-owner.ts": owner(true),
      "scoped-deep8.ts": deep(true, 8),
      "scoped-deep16.ts": deep(true, 16)
    })
  }
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text)
  return Object.keys(files)
}

const root = path.resolve(import.meta.dirname, "../../../..")
const dir = path.join(import.meta.dirname, "tmp")
const tsc = path.join(root, "node_modules/.bin/tsc")

const ceilings = {
  leaves: 1_060_000,
  owner: 150_000,
  deep8: 160_000,
  deepRatio: 2.1,
  diagnosticsRatio: 1.5,
  completionRatio: 1.5
}

const files = generate(dir)
const config = (names) => ({
  extends: "../../../../../tsconfig.base.json",
  files: names,
  compilerOptions: {
    noEmit: true,
    composite: false,
    incremental: false,
    declarationMap: false,
    sourceMap: false,
    rootDir: "../../../../..",
    types: ["node"],
    plugins: [],
    paths: {
      "@effect/ui": ["../../../src/index.ts"],
      "@effect/ui/html": ["../../../src/html/index.ts"],
      "@effect/ui/*": ["../../../src/*.ts"]
    }
  }
})
fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(config(files), null, 2))

const count = (file) => {
  const project = path.join(dir, `tsconfig.${path.basename(file, ".ts")}.json`)
  fs.writeFileSync(project, JSON.stringify(config([file]), null, 2))
  let output
  try {
    output = execFileSync(tsc, ["-p", project, "--singleThreaded", "--extendedDiagnostics", "--pretty", "false"], {
      encoding: "utf8"
    })
  } catch (error) {
    throw new Error(`${file} doesn't compile:\n${error.stdout}`, { cause: error })
  }
  const field = (name) => Number(new RegExp(`^${name}:\\s+([\\d.]+)`, "m").exec(output)[1])
  return { instantiations: field("Instantiations"), checkSeconds: field("Check time") }
}

const counts = {}
for (const file of files) counts[path.basename(file, ".ts")] = count(file)
const n = (name) => counts[name]?.instantiations ?? NaN

const shapes = values.main ? ["inline"] : ["inline", "scoped"]
const measure = (f) => Object.fromEntries(shapes.map((shape) => [shape, f(shape)]))
const measures = {
  leaves: measure((shape) => n(`${shape}-leaves`)),
  owner: measure((shape) => n(`${shape}-owner`) - n(`${shape}-leaves`)),
  deep8: measure((shape) => n(`${shape}-deep8`) - n("imports")),
  deepRatio: measure((shape) => (n(`${shape}-deep16`) - n("imports")) / (n(`${shape}-deep8`) - n("imports")))
}

const lsp = async (file, marker, runs = 10) => {
  const uri = pathToFileURL(file).href
  const text = fs.readFileSync(file, "utf8")
  const server = spawn(tsc, ["--lsp", "--stdio"], { cwd: dir, stdio: ["pipe", "pipe", "inherit"] })
  let buffer = Buffer.alloc(0)
  const pending = new Map()
  const send = (message) => {
    const body = JSON.stringify(message)
    server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  server.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const end = buffer.indexOf("\r\n\r\n")
      if (end < 0) return
      const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, end).toString())[1])
      if (buffer.length < end + 4 + length) return
      const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString())
      buffer = buffer.subarray(end + 4 + length)
      if (message.id !== undefined && message.method === undefined) {
        pending.get(message.id)?.(message)
        pending.delete(message.id)
      } else if (message.id !== undefined) {
        // A request from the server, such as workspace/configuration.
        send({ jsonrpc: "2.0", id: message.id, result: null })
      }
    }
  })
  let nextId = 1
  const request = (method, params) =>
    new Promise((done) => {
      const id = nextId++
      pending.set(id, done)
      send({ jsonrpc: "2.0", id, method, params })
    })
  const notify = (method, params) => send({ jsonrpc: "2.0", method, params })
  const timed = async (method, params) => {
    const start = performance.now()
    const response = await request(method, params)
    return [performance.now() - start, response]
  }
  await request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(dir).href,
    capabilities: { textDocument: { diagnostic: {}, completion: { completionItem: {} } } }
  })
  notify("initialized", {})
  notify("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text } })
  const [, first] = await timed("textDocument/diagnostic", { textDocument: { uri } })
  const offset = text.indexOf(marker) + marker.length
  const before = text.slice(0, offset).split("\n")
  const position = { line: before.length - 1, character: before[before.length - 1].length }
  const diagnostics = []
  const completions = []
  let items = 0
  // An edit adds a comment line at the top, which moves the completion down a line.
  const edit = (version, text) => {
    notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text }]
    })
    position.line += 1
  }
  for (let version = 2; version < 2 + runs; version++) {
    edit(version, `// ${version}\n`)
    diagnostics.push((await timed("textDocument/diagnostic", { textDocument: { uri } }))[0])
    edit(version + 1000, `// c${version}\n`)
    const [ms, response] = await timed("textDocument/completion", { textDocument: { uri }, position })
    completions.push(ms)
    items = (response.result?.items ?? response.result ?? []).length
  }
  server.kill()
  return {
    errors: (first.result?.items ?? []).length,
    diagnosticsMs: median(diagnostics),
    completionMs: median(completions),
    items
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const base = values.base === undefined ? undefined : JSON.parse(fs.readFileSync(values.base, "utf8"))

let editor
if (values.lsp) {
  const sessions = []
  for (let i = 0; i < Number(values.sessions); i++) {
    const inline = await lsp(path.join(dir, "inline-owner.ts"), "h.")
    const scoped = values.main ? undefined : await lsp(path.join(dir, "scoped-owner.ts"), "h.")
    sessions.push({ inline, scoped })
  }
  editor = { sessions }
  if (!values.main) {
    const ratio = (key) => median(sessions.map((s) => s.scoped[key] / s.inline[key]))
    const ofMain = (key) =>
      base?.editor === undefined
        ? undefined
        : median(sessions.map((s) => s.scoped[key])) / median(base.editor.sessions.map((s) => s.inline[key]))
    measures.diagnosticsRatio = { scoped: ratio("diagnosticsMs"), ofMain: ofMain("diagnosticsMs") }
    measures.completionRatio = { scoped: ratio("completionMs"), ofMain: ofMain("completionMs") }
  }
}

const format = (value) =>
  value === undefined || Number.isNaN(value)
    ? ""
    : Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toFixed(2)
const rows = Object.entries(measures).map(([name, { inline, scoped, ofMain }]) => {
  const checked = ofMain ?? scoped
  return {
    name,
    main: format(base?.measures[name]?.inline),
    inline: format(inline),
    scoped: format(scoped),
    ofMain: format(ofMain),
    ceiling: format(ceilings[name]),
    pass: checked === undefined || checked <= ceilings[name]
  }
})
console.log("| Measure | main | Inline | Scoped | Scoped / main | Ceiling | |")
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |")
for (const row of rows) {
  console.log(
    `| ${row.name} | ${row.main} | ${row.inline} | ${row.scoped} | ${row.ofMain} | ${row.ceiling} | ${row.pass ? "pass" : "OVER"} |`
  )
}
if (editor !== undefined) {
  const ms = (run) => `${Math.round(run.diagnosticsMs)} / ${Math.round(run.completionMs)} ms`
  for (const [i, { inline, scoped }] of editor.sessions.entries()) {
    console.log(
      `session ${i + 1}: inline ${ms(inline)}${scoped === undefined ? "" : `, scoped ${ms(scoped)}`} ` +
        `(diagnostics / completion), ${(scoped ?? inline).items} completions at h., ${(scoped ?? inline).errors} errors`
    )
  }
}
if (values.json !== undefined) {
  fs.writeFileSync(values.json, JSON.stringify({ counts, measures, ceilings, editor }, null, 2))
}
process.exitCode = rows.every((row) => row.pass) ? 0 : 1
