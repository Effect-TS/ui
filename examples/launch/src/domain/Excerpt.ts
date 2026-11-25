export type Excerpt = (source: string) => string

export const whole: Excerpt = (source) =>
  source.replace(
    /^(?:\/\/ (?:@vitest|oxlint)[^\n]*\n|import [^]*?"\n|\n)+/,
    ""
  )
    .trimEnd()

export const test = (title: string): Excerpt => (source) => {
  const lines = source.split("\n")
  const start = lines.findIndex((line) =>
    /^\s*it(\.effect)?\(/.test(line) && line.includes(`"${title}"`)
  )
  if (start < 0) throw new Error(`No test named "${title}"`)
  const indent = lines[start].search(/\S/)
  const next = lines.findIndex((line, index) =>
    index > start && line.trim() !== "" && line.search(/\S/) <= indent
  )
  const closes = next >= 0 && lines[next].search(/\S/) === indent &&
    lines[next].trimStart().startsWith("}")
  const end = next < 0 ? lines.length : closes ? next + 1 : next
  return lines.slice(start, end).map((line) => line.slice(indent))
    .join("\n").trimEnd()
}
