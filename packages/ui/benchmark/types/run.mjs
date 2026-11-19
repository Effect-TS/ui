// Type-checking cost of `"model"` children against the same shapes written inline, as on `main`.
//
// Run from the repository root:
//
//   node packages/ui/benchmark/types/run.mjs [--lsp] [--sessions <n>] [--json <file>]
//
// Counts are instantiations from `tsc --singleThreaded --extendedDiagnostics` (TypeScript 7) with the
// Effect plugin off. `--singleThreaded` makes the count independent of how files are split across checker
// threads. `--lsp` also times `tsc --lsp --stdio` on the 100-wide owner: diagnostics after an edit and a
// completion at `h.` (inline) or `h.children.` (model), the median of 10 edits, for each of `--sessions`
// sessions that measure the inline owner and then the model one. It exits non-zero over a ceiling.
//
// The fixtures, written to `tmp`, are each shape twice: with children written inline in a view,
// as on `main`, and as `"model"` children declared in `children` and placed with `h.children`.
//
//   leaves  100 components, each with props, a Model, a message and one event.
//   owner   one component over all 100: a third always there, a third behind a condition and a third
//           from a list, every one with props and an `onEmit` handler.
//   deep    a chain of components, each one the child of the one above, 8 and 16 long.
import { execFileSync, spawn } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const imports = (child) =>
  [
    `import { ${child ? "Child, " : ""}Component, UiSchema } from "@effect/ui"`,
    `import { Html } from "@effect/ui/html"`,
    `import { Schema } from "effect"`
  ].join("\n")

const lifetime = (model) => `\n  lifetime: "${model ? "model" : "view"}",`

// What the library costs a file that uses it, measured on its own and taken off the deep chain.
const importsOnly = `${imports(true)}

export const used = [Child.one, Component.define, UiSchema.TaggedEnum, Html, Schema.String]
`

const leaves = (model) => {
  const out = [imports(false), ""]
  for (let i = 0; i < 100; i++) {
    out.push(`const M${i} = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
const E${i} = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
export const C${i} = Component.define({
  name: "C${i}",${lifetime(model)}
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

const owner = (model) => {
  const head = `${imports(model)}
import { ${names.join(", ")} } from "./${model ? "model" : "inline"}-leaves.ts"

const OwnerMessage = UiSchema.TaggedEnum({ ChildSaved: { id: Schema.String } })
export const Owner = Component.define({
  name: "Owner",
  lifetime: "view",
  model: Schema.Struct({ selected: Schema.NullOr(Schema.String), order: Schema.Array(Schema.String) }),
  message: OwnerMessage,
  elements: Html
}).make({`
  const tail = `  init: () => ({ selected: null, order: [] }),
  update: (model, message, $) => $.set({ ...model, selected: message.id }),`
  if (!model) {
    const placed = names.map((name, i) =>
      i % 3 === 0
        ? `${name}(h, { key: "c${i}", props: { id: model.selected ?? "c${i}" }, ${onEmit} })`
        : i % 3 === 1
        ? `model.selected !== null && ${name}(h, { key: "c${i}", props: { id: model.selected }, ${onEmit} })`
        : `model.order.map((id) => ${name}(h, { key: id, props: { id: id }, ${onEmit} }))`
    )
    return `${head}
${tail}
  view: (model, h) =>
    h.div(
      ${placed.join(",\n      ")}
    )
})
`
  }
  const declared = names.map((name, i) =>
    i % 3 === 0
      ? `c${i}: Child.one(${name}, { props: (model) => ({ id: model.selected ?? "c${i}" }), ${onEmit} })`
      : i % 3 === 1
      ? `c${i}: Child.optional(${name}, { props: (model) => model.selected !== null && { id: model.selected }, ${onEmit} })`
      : `c${i}: Child.keyed(${name}, { props: (model) => model.order.map((id) => [id, { id }]), ${onEmit} })`
  )
  const placed = names.map((_, i) =>
    i % 3 === 0
      ? `h.children.c${i}()`
      : i % 3 === 1
      ? `h.children.c${i}?.()`
      : `model.order.map((id) => h.children.c${i}(id))`
  )
  return `${head}
  children: {
    ${declared.join(",\n    ")}
  },
${tail}
  view: (model, h) =>
    h.div(
      ${placed.join(",\n      ")}
    )
})
`
}

const deep = (model, depth) => {
  const out = [imports(model), ""]
  for (let i = depth - 1; i >= 0; i--) {
    const last = i === depth - 1
    const below = model
      ? `h.children.below()`
      : `L${i + 1}(h, { key: "below", props: { id: model.draft }, onEmit: { Saved: (e) => LM${i}.Below({ id: e.id }) } })`
    const children = model && !last
      ? `\n  children: {
    below: Child.one(L${i + 1}, { props: (model) => ({ id: model.draft }), onEmit: { Saved: (e) => LM${i}.Below({ id: e.id }) } })
  },`
      : ""
    out.push(`const LM${i} = UiSchema.TaggedEnum({ Typed: { value: Schema.String }, Below: { id: Schema.String } })
const LE${i} = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
export const L${i} = Component.define({
  name: "L${i}",${lifetime(model)}
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ draft: Schema.String }),
  message: LM${i},
  events: LE${i},
  elements: Html
}).make({${children}
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

// Writes every fixture into `dir` and returns the file name of each.
const generate = (dir) => {
  fs.mkdirSync(dir, { recursive: true })
  const files = {
    "imports.ts": importsOnly,
    "inline-leaves.ts": leaves(false),
    "model-leaves.ts": leaves(true),
    "inline-owner.ts": owner(false),
    "model-owner.ts": owner(true),
    "inline-deep8.ts": deep(false, 8),
    "model-deep8.ts": deep(true, 8),
    "inline-deep16.ts": deep(false, 16),
    "model-deep16.ts": deep(true, 16)
  }
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text)
  return Object.keys(files)
}

const { values } = parseArgs({
  options: { lsp: { type: "boolean" }, sessions: { type: "string", default: "3" }, json: { type: "string" } }
})
const root = path.resolve(import.meta.dirname, "../../../..")
const dir = path.join(import.meta.dirname, "tmp")
const tsc = path.join(root, "node_modules/.bin/tsc")

// Provisional spike ceilings, EFF-4042.
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
// The language server opens the owner in this project.
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
const n = (name) => counts[name].instantiations

const measures = {
  leaves: { inline: n("inline-leaves"), model: n("model-leaves") },
  owner: { inline: n("inline-owner") - n("inline-leaves"), model: n("model-owner") - n("model-leaves") },
  deep8: { inline: n("inline-deep8") - n("imports"), model: n("model-deep8") - n("imports") },
  deepRatio: {
    inline: (n("inline-deep16") - n("imports")) / (n("inline-deep8") - n("imports")),
    model: (n("model-deep16") - n("imports")) / (n("model-deep8") - n("imports"))
  }
}

// Drives `tsc --lsp --stdio` on one file: after each edit, pull diagnostics, then a completion after `marker`.
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

let editor
if (values.lsp) {
  const sessions = []
  for (let i = 0; i < Number(values.sessions); i++) {
    const inline = await lsp(path.join(dir, "inline-owner.ts"), "h.")
    const model = await lsp(path.join(dir, "model-owner.ts"), "h.children.")
    sessions.push({ inline, model })
  }
  const ratio = (key) => median(sessions.map((s) => s.model[key] / s.inline[key]))
  editor = { sessions, diagnosticsRatio: ratio("diagnosticsMs"), completionRatio: ratio("completionMs") }
  measures.diagnosticsRatio = { model: editor.diagnosticsRatio }
  measures.completionRatio = { model: editor.completionRatio }
}

const format = (value) =>
  value === undefined ? "" : Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2)
const rows = Object.entries(measures).map(([name, { inline, model }]) => ({
  name,
  inline: format(inline),
  model: format(model),
  ceiling: format(ceilings[name]),
  pass: model <= ceilings[name]
}))
console.log("| Measure | Inline | Model | Ceiling | |")
console.log("| --- | ---: | ---: | ---: | --- |")
for (const row of rows) {
  console.log(`| ${row.name} | ${row.inline} | ${row.model} | ${row.ceiling} | ${row.pass ? "pass" : "OVER"} |`)
}
if (editor !== undefined) {
  for (const [i, { inline, model }] of editor.sessions.entries()) {
    console.log(
      `session ${i + 1}: inline ${Math.round(inline.diagnosticsMs)} / ${Math.round(inline.completionMs)} ms, ` +
        `model ${Math.round(model.diagnosticsMs)} / ${Math.round(model.completionMs)} ms ` +
        `(diagnostics / completion), ${model.items} completions at h.children., ${model.errors} errors`
    )
  }
}
if (values.json !== undefined) {
  fs.writeFileSync(values.json, JSON.stringify({ counts, measures, ceilings, editor }, null, 2))
}
process.exitCode = rows.every((row) => row.pass) ? 0 : 1
