/** Shared attribute rules for head tags and document ownership markers. */
import * as Head from "../../Head.ts"
import { attributeName } from "./elements.ts"

/** Canonical names with last-write wins; the ownership marker is host-managed. @internal */
export const normalize = (
  pairs: ReadonlyArray<readonly [string, string]>
): ReadonlyArray<readonly [string, string]> => {
  const out = new Map<string, string>()
  for (const [name, value] of pairs) {
    const normalized = attributeName(name, false)
    if (normalized !== undefined && normalized !== Head.marker) out.set(normalized, value)
  }
  return [...out]
}
