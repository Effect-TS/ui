// Control characters are deliberately excluded from serialized names.
// oxlint-disable-next-line no-control-regex
const unsafeName = /[\s"'<>/=\u0000-\u001f\u007f-\u009f]/

const asciiUpper = /[A-Z]/g

const toLowerCase = (char: string): string => char.toLowerCase()

/**
 * Names are written without quoting in HTML. Drop empty names, delimiters and
 * controls rather than letting a name become markup. Fold only ASCII letters,
 * as the DOM does for HTML elements; SVG attribute names are case-sensitive.
 * A name that is already canonical, as nearly all are, is returned as it is.
 *
 * @internal
 */
export const attributeName = (
  name: string,
  svg: boolean
): string | undefined => {
  const known = (svg ? svgNames : htmlNames).get(name)
  if (known !== undefined) return known === null ? undefined : known
  const out = name.length === 0 || unsafeName.test(name)
    ? undefined
    : svg || name.search(asciiUpper) === -1
    ? name
    : name.replace(asciiUpper, toLowerCase)
  remember(svg ? svgNames : htmlNames, name, out)
  return out
}

// A page uses a few dozen attribute names, each on many elements, so each is checked once. The caches
// are bounded, as a name can come from data.
const htmlNames = new Map<string, string | null>()
const svgNames = new Map<string, string | null>()
const maxNames = 1024

const remember = (
  names: Map<string, string | null>,
  name: string,
  out: string | undefined
): void => {
  if (names.size >= maxNames) names.clear()
  names.set(name, out ?? null)
}
