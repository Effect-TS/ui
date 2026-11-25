/** How many lines a collapsed file shows. */
export const shown = 14

/** A file on its own collapses only when that hides this many lines. */
export const worthHiding = 10

/** The lines a collapsed file shows: from `start` up to `end`. */
export interface Preview {
  readonly start: number
  readonly end: number
}

// The first line after the imports that open a file, and the blank
// lines around them.
const afterImports = (lines: ReadonlyArray<string>): number => {
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    if (line.trim() === "") {
      index++
    } else if (/^import\b/.test(line)) {
      // An import ends on the line that names its module.
      while (
        index < lines.length && !/["'];?\s*$/.test(lines[index]!)
      ) index++
      index++
    } else {
      break
    }
  }
  return Math.min(index, lines.length)
}

/**
 * The preview of a file: its first `shown` lines after the imports.
 * `undefined` when showing it would hide fewer than `minimumHidden`
 * lines of code, so a short file stays whole.
 */
export const of = (
  lines: ReadonlyArray<string>,
  minimumHidden = worthHiding
): Preview | undefined => {
  const start = afterImports(lines)
  return lines.length - start < shown + minimumHidden
    ? undefined
    : { start, end: start + shown }
}
