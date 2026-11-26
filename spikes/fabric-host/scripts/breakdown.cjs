// Attributes the bytes of a minified bundle to packages, from its source map.
// Usage: node scripts/breakdown.cjs <bundle.js> <bundle.js.map>
const fs = require("node:fs")
const { SourceMapConsumer } = require("source-map")
const zlib = require("node:zlib")

const [js, mapFile] = process.argv.slice(2)
const code = fs.readFileSync(js, "utf8")
const map = JSON.parse(fs.readFileSync(mapFile, "utf8"))
const lines = code.split("\n")

const group = (source) => {
  if (!source) return "(unmapped)"
  if (process.env.FILES && source.includes(process.env.FILES)) {
    return source.slice(source.lastIndexOf(process.env.FILES))
  }
  const m = source.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)
  if (m) return m[m.length - 1].replace("node_modules/", "")
  if (source.includes("packages/ui/src")) return "@effect/ui"
  return "(app) " + source.split("/").slice(-2).join("/")
}
;(async () => {
  const bytes = new Map()
  let previous
  const sections = map.sections ?? [{ offset: { line: 0, column: 0 }, map }]
  const all = []
  for (const section of sections) {
    const consumer = await new SourceMapConsumer(section.map)
    consumer.eachMapping((m) => {
      all.push({
        generatedLine: m.generatedLine + section.offset.line,
        generatedColumn: m.generatedColumn +
          (m.generatedLine === 1 ? section.offset.column : 0),
        source: m.source
      })
    })
  }
  all.sort((a, b) =>
    a.generatedLine - b.generatedLine || a.generatedColumn - b.generatedColumn
  )
  // A mapping covers the code up to the next one, or to the end of its line.
  all.forEach((m) => {
    if (previous) {
      const end = previous.generatedLine === m.generatedLine
        ? m.generatedColumn
        : lines[previous.generatedLine - 1].length
      const g = group(previous.source)
      bytes.set(g, (bytes.get(g) ?? 0) + end - previous.generatedColumn)
    }
    previous = m
  })
  const total = code.length
  const out = [...bytes].sort((a, b) => b[1] - a[1]).slice(
    0,
    Number(process.env.TOP ?? 15)
  )
  console.log("total", total, "gzip", zlib.gzipSync(code).length)
  for (const [g, n] of out) {
    console.log(
      String(n).padStart(9),
      (100 * n / total).toFixed(1).padStart(5) + "%",
      g
    )
  }
})()
