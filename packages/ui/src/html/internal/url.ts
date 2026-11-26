/** URL scheme rules shared by `Markdown` and the HTML renderers. */
import { isCustomTag } from "./elements.ts"

// oxlint-disable-next-line no-control-regex
const ignored = /[\u0000-\u0020]/g
const schemePattern = /^[a-zA-Z][a-zA-Z0-9+.-]*$/

/**
 * The lowercase scheme of `url`, ignoring ASCII controls and spaces, or
 * `undefined` when no scheme is recognized.
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
 * Whether a URL is blocked for the normalized attribute `name`.
 *
 * @internal
 */
export const blockedAttribute = (name: string, value: string): boolean =>
  attributes.has(name) && isScript(value)

const animationTags: ReadonlySet<string> = new Set(["set", "animate"])

/**
 * Whether `tag` is an SVG animation that sets an attribute, as the HTML parser
 * folds its case.
 *
 * @internal
 */
export const isAnimation = (tag: string): boolean =>
  animationTags.has(tag.toLowerCase())

/**
 * The attributes of an animation that give the values it sets.
 *
 * @internal
 */
export const animationValues: ReadonlyArray<string> = [
  "to",
  "from",
  "by",
  "values"
]

/**
 * Whether an animation's value `name` would set a blocked URL on the
 * attribute `target` names. `values` is a `;`-separated list, blocked when
 * any item is; the others are one URL each.
 *
 * @internal
 */
export const blockedAnimation = (
  target: string | null | undefined,
  name: string,
  value: string
): boolean => {
  if (target == null || !animationValues.includes(name)) return false
  const attribute = target.trim()
  return name === "values"
    ? value.split(";").some((item) => blockedAttribute(attribute, item))
    : blockedAttribute(attribute, value)
}

/**
 * Whether a URL is blocked for property `name` of a built-in `tag`.
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
