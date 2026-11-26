/** URL scheme rules shared by `Markdown` and the HTML renderers. */

// oxlint-disable-next-line no-control-regex
const ignored = /[\u0000-\u0020]/g
const schemePattern = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

/**
 * The lowercase scheme of `url`, or `undefined` for a relative URL. ASCII
 * controls and spaces are ignored, as browsers ignore them.
 *
 * @internal
 */
export const scheme = (url: string): string | undefined => {
  if (!url.includes(":")) return undefined
  const match = schemePattern.exec(url.replace(ignored, ""))
  return match === null ? undefined : match[1]!.toLowerCase()
}

const isScript = (url: string): boolean => {
  const found = scheme(url)
  return found === "javascript" || found === "vbscript"
}

const attributes: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data"
])

const properties: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formAction",
  "data"
])

/**
 * Whether the normalized attribute `name` holds a `javascript:` or
 * `vbscript:` URL, which the renderers omit.
 *
 * @internal
 */
export const blockedAttribute = (name: string, value: string): boolean =>
  attributes.has(name) && isScript(value)

/**
 * Whether a built-in element's property `name` would be set to a
 * `javascript:` or `vbscript:` URL.
 *
 * @internal
 */
export const blockedProperty = (name: string, value: unknown): boolean =>
  typeof value === "string" && properties.has(name) && isScript(value)
