/** URL scheme rules shared by `Markdown` and the HTML renderers. */
import { isCustomTag } from "./elements.ts"

// oxlint-disable-next-line no-control-regex
const ignored = /[\u0000-\u0020]/g
const schemePattern = /^[a-zA-Z][a-zA-Z0-9+.-]*$/

/**
 * The lowercase scheme of `url`, or `undefined` for a relative URL. ASCII
 * controls and spaces are ignored, as browsers ignore them.
 *
 * @internal
 */
export const scheme = (url: string): string | undefined => {
  const colon = url.indexOf(":")
  if (colon === -1) return undefined
  const found = url.slice(0, colon).replace(ignored, "")
  return schemePattern.test(found) ? found.toLowerCase() : undefined
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
 * Whether property `name` of a built-in `tag` would be set to a
 * `javascript:` or `vbscript:` URL. The renderers remove the attribute it
 * reflects, `name.toLowerCase()`, instead.
 *
 * @internal
 */
export const blockedProperty = (
  tag: string,
  name: string,
  value: unknown
): boolean =>
  typeof value === "string" && properties.has(name) && !isCustomTag(tag) &&
  isScript(value)
