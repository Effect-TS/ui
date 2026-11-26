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

// Match case-insensitively because the HTML parser folds tag names.
const animation = /^(set|animate)$/i

const properties: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formAction",
  "data"
])

/**
 * Whether `value` is blocked for the normalized attribute `name` of `tag`.
 * Animation checks do not depend on `attributeName`, which can change
 * independently of the value.
 *
 * @internal
 */
export const blockedAttribute = (
  tag: string,
  name: string,
  value: string
): boolean =>
  attributes.has(name)
    ? isScript(value)
    : name === "values"
    ? animation.test(tag) && value.split(";").some(isScript)
    : (name === "to" || name === "from" || name === "by") &&
      animation.test(tag) && isScript(value)

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
