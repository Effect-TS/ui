import type * as MessageLog from "@effect/ui/MessageLog"
import type { Exclusion, Outside } from "../Inspector.ts"
import type { Rule } from "./control.ts"
import { nameOf, tagOf } from "./read.ts"

export type Entry = MessageLog.Entry | MessageLog.WireEntry

export const isRule = (rule: Rule): boolean =>
  rule.tag !== undefined || rule.component !== undefined ||
  rule.path !== undefined

// Drop empty rules, which would otherwise match everything.
export const normalize = (
  exclude: ReadonlyArray<string | Exclusion> | undefined
): ReadonlyArray<Rule> =>
  (exclude ?? []).map((rule): Rule =>
    typeof rule === "string" ? { tag: rule } : {
      ...(rule.tag === undefined ? undefined : { tag: rule.tag }),
      ...(rule.component === undefined
        ? undefined
        : { component: rule.component }),
      ...(rule.path === undefined ? undefined : { path: rule.path })
    }
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

/** The update a `PropsChanged` follows from, when that update is a top-level message. */
export const causeOf = <E extends Entry | Outside>(
  entry: Entry,
  resolve: (session: string, seq: number) => E | undefined
): Extract<E, { readonly _tag: "Update" }> | undefined => {
  if (entry._tag !== "PropsChanged" || entry.causedBy === undefined) {
    return undefined
  }
  const cause = resolve(entry.session, entry.causedBy)
  return cause?._tag === "Update" && cause.causedBy === undefined
    ? cause as Extract<E, { readonly _tag: "Update" }>
    : undefined
}

// A tag rule also matches a `PropsChanged` through the update that caused it.
export const excludes = (
  rules: Iterable<Rule>,
  entry: Entry,
  resolve: (session: string, seq: number) => Entry | undefined
): boolean => {
  const cause = causeOf(entry, resolve)
  for (const rule of rules) {
    if (
      test(rule, entry) ||
      cause !== undefined && rule.tag !== undefined && test(rule, cause)
    ) return true
  }
  return false
}
