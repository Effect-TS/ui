export type Excerpt = (source: string) => string

export const whole: Excerpt = (source) =>
  source.replace(
    /^(?:\/\/ (?:@vitest|oxlint)[^\n]*\n|\n)+/,
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

/** A top-level `const` declaration, up to the blank line after it. */
export const declaration = (name: string): Excerpt => (source) => {
  const lines = source.split("\n")
  const start = lines.findIndex((line) =>
    line.startsWith(`const ${name} =`) ||
    line.startsWith(`const ${name}:`)
  )
  if (start < 0) throw new Error(`No declaration named "${name}"`)
  const blank = lines.findIndex((line, index) =>
    index > start && line.trim() === ""
  )
  return lines.slice(start, blank < 0 ? lines.length : blank).join(
    "\n"
  )
}

/** Several excerpts of one file, with a blank line between them. */
export const all = (
  ...excerpts: ReadonlyArray<Excerpt>
): Excerpt =>
(source) => excerpts.map((excerpt) => excerpt(source)).join("\n\n")

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const isReferenced = (body: string, identifier: string) =>
  new RegExp(`\\b${escapeRegExp(identifier)}\\b`).test(body)

const localName = (specifier: string) => {
  const cleaned = specifier.trim().replace(/^type\s+/, "")
  const parts = cleaned.split(/\s+as\s+/)
  return (parts[1] ?? parts[0] ?? "").trim()
}

const filterImport = (
  statement: string,
  body: string
): string | undefined => {
  const named =
    /^import\s+(type\s+)?\{([^}]+)\}\s+from\s+("[^"]+"|'[^']+')\s*;?$/
      .exec(statement.replace(/\s+/g, " ").trim())
  if (named !== null) {
    const [, typeKeyword = "", rawSpecifiers = "", from = ""] = named
    const kept = rawSpecifiers
      .split(",")
      .map((item) => item.trim())
      .filter((item) =>
        item !== "" && isReferenced(body, localName(item))
      )
    return kept.length === 0
      ? undefined
      : `import ${typeKeyword}{ ${kept.join(", ")} } from ${from}`
  }
  const nsOrDefault =
    /^import\s+(?:type\s+)?(?:\*\s+as\s+)?([\w$]+)\s+from\s+/.exec(
      statement.trim()
    )
  if (nsOrDefault !== null) {
    return isReferenced(body, nsOrDefault[1]!) ? statement : undefined
  }
  return statement
}

/**
 * Prepends the file's leading `import` statements that the excerpt
 * actually references.
 */
export const withImports =
  (excerpt: Excerpt): Excerpt => (source) => {
    const body = excerpt(source)
    const lines = source.split("\n")
    const statements: Array<string> = []
    let index = 0
    while (index < lines.length) {
      const line = lines[index]!
      if (
        line.trim() === "" ||
        /^\/\/ (?:@vitest|oxlint)/.test(line)
      ) {
        index++
      } else if (/^import\b/.test(line)) {
        const start = index
        while (
          index < lines.length && !/["'];?\s*$/.test(lines[index]!)
        ) index++
        statements.push(lines.slice(start, index + 1).join("\n"))
        index++
      } else {
        break
      }
    }
    const kept = statements.flatMap((statement) => {
      const filtered = filterImport(statement, body)
      return filtered === undefined ? [] : [filtered]
    })
    return kept.length === 0 ? body : `${kept.join("\n")}\n\n${body}`
  }
