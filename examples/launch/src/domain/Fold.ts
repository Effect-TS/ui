import type { Fold } from "./Snippet.ts"

export type Folds = (code: string) => ReadonlyArray<Fold>

export const none: Folds = () => []

const declares = (line: string, name: string) =>
  /^(?:export )?(?:const|let|function\*?|class|interface|type) ([\w$]+)/
    .exec(line)?.[1] === name

const body = (lines: ReadonlyArray<string>, name: string): Fold => {
  const first = lines.findIndex((line) => declares(line, name))
  if (first < 0) {
    throw new Error(`No top-level declaration named "${name}"`)
  }
  const next = lines.findIndex((line, index) =>
    index > first && /^\S/.test(line)
  )
  const rest = lines.slice(first + 1, next < 0 ? lines.length : next)
  const length = rest.length -
    [...rest].reverse().findIndex((line) => line.trim() !== "")
  if (length > rest.length) {
    throw new Error(`"${name}" has no body to fold`)
  }
  return { label: name, start: first + 1, end: first + 1 + length }
}

export const bodies =
  (...names: ReadonlyArray<string>): Folds => (code) => {
    const lines = code.split("\n")
    return names.map((name) => body(lines, name)).sort((a, b) =>
      a.start - b.start
    )
  }
