/** Shared attribute rules for head tags and document ownership markers. */
import { attributeName } from "../../internal/attributeName.ts"

/** @internal */
export const marker = "data-eui"

/** @internal */
export const name = (name: string): string | undefined => {
  const normalized = attributeName(name, false)
  return normalized === marker ? undefined : normalized
}

/** Canonical names with last-write wins; the ownership marker is host-managed. @internal */
export const normalize = (
  pairs: ReadonlyArray<readonly [string, string]>
): ReadonlyArray<readonly [string, string]> => {
  const out = new Map<string, string>()
  for (const [key, value] of pairs) {
    const normalized = name(key)
    if (normalized !== undefined) out.set(normalized, value)
  }
  return [...out]
}
