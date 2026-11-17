/** Shared HTML element rules for the browser host and server serializer. */

/** @internal */
export const svgTags: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "text",
  "tspan",
  "textPath",
  "defs",
  "use",
  "symbol",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "image",
  "foreignObject"
])

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
export const attributeName = (name: string, svg: boolean): string | undefined => {
  if (name.length === 0 || unsafeName.test(name)) return undefined
  return svg || name.search(asciiUpper) === -1 ? name : name.replace(asciiUpper, toLowerCase)
}
