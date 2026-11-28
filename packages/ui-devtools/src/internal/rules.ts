import type * as MessageLog from "@effect/ui/MessageLog"
import type { Rule } from "./control.ts"
import { nameOf, tagOf } from "./read.ts"

export type Entry = MessageLog.Entry | MessageLog.WireEntry

type Loose = { readonly [K in keyof Rule]?: Rule[K] | undefined }

export const clean = ({ component, path, tag }: Loose): Rule => ({
  ...(tag === undefined ? undefined : { tag }),
  ...(component === undefined ? undefined : { component }),
  ...(path === undefined ? undefined : { path })
})

export const isRule = (rule: Rule): boolean =>
  rule.tag !== undefined || rule.component !== undefined ||
  rule.path !== undefined

// Strings are tags, and a rule without fields would match everything.
export const normalize = (
  exclude: ReadonlyArray<string | Loose> | undefined
): ReadonlyArray<Rule> =>
  (exclude ?? []).map((rule) =>
    typeof rule === "string" ? { tag: rule } : clean(rule)
  ).filter(isRule)

export const keyOf = (rule: Rule): string =>
  JSON.stringify([rule.tag, rule.component, rule.path])

export const labelOf = (rule: Rule): string =>
  [
    rule.tag ??
      (rule.component === undefined ? undefined : "Every " + rule.component),
    rule.tag === undefined ? undefined : rule.component,
    rule.path === undefined ? undefined : nameOf(rule.path) + " and below"
  ].filter((part) => part !== undefined).join(" in ")

const test = (rule: Rule, entry: Entry) =>
  "instance" in entry &&
  (rule.tag === undefined ||
    entry._tag === "Update" && tagOf(entry.message) === rule.tag) &&
  (rule.component === undefined ||
    (typeof entry.component === "string"
        ? entry.component
        : entry.component.definition.name) === rule.component) &&
  (rule.path === undefined || entry.path === rule.path ||
    entry.path.startsWith(rule.path + "/"))

/**
 * Whether a rule matches the entry, or matches by its `tag` the update a
 * `PropsChanged` follows from: the props a stopped message passed down.
 */
export const excludes = (
  rules: Iterable<Rule>,
  entry: Entry,
  resolve: (seq: number) => Entry | undefined
): boolean => {
  const cause = entry._tag === "PropsChanged" && entry.causedBy !== undefined
    ? resolve(entry.causedBy)
    : undefined
  for (const rule of rules) {
    if (
      test(rule, entry) ||
      cause?._tag === "Update" && cause.causedBy === undefined &&
        rule.tag !== undefined && test(rule, cause)
    ) return true
  }
  return false
}
