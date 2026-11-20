/**
 * A component's `children`: the children whose state its Model owns. Each
 * render lists them from the Model and gives the view `h.children` to place
 * them. The runtime holds the ones no tree places, detached.
 *
 * @internal
 */
import * as Predicate from "effect/Predicate"
import type * as Component from "../Component.ts"
import type * as View from "../View.ts"
import * as child from "./child.ts"
import * as childRef from "./ref.ts"

/** @internal */
export const TypeId = "~@effect/ui/Child" as const

/** An entry of `children` as `Child.one`, `Child.optional` and `Child.keyed` build it. @internal */
export interface Entry {
  readonly [TypeId]: "one" | "optional" | "keyed"
  readonly component: Component.Any
  readonly props: ((model: unknown) => unknown) | undefined
  readonly onEmit: child.Options["onEmit"]
}

/** @internal */
export const isEntry = (value: unknown): value is Entry => Predicate.hasProperty(value, TypeId)

/**
 * An entry, once its component is checked: a `"view"` component is called in a view, not listed.
 *
 * @internal
 */
export const entry = (
  kind: Entry[typeof TypeId],
  component: Component.Any,
  options: {
    readonly props?: ((model: unknown) => unknown) | undefined
    readonly onEmit?: child.Options["onEmit"]
  } | undefined,
  owner?: string,
  name?: string
): Entry => {
  const definition = component.definition
  if (definition.lifetime !== "model") {
    throw new Error(
      `${owner === undefined ? "Child." + kind : owner + " lists"} ${definition.name}${
        name === undefined ? "" : " as " + name
      }, and its lifetime is "view": call it in a view instead, as ${definition.name}(h, { ... })`
    )
  }
  return { [TypeId]: kind, component, props: options?.props, onEmit: options?.onEmit }
}

/**
 * One child the Model lists: its entry, its ref, whose key is its name in `children` and a keyed row's
 * key, as `ref.at` writes it, and its props.
 *
 * @internal
 */
export interface Listed {
  readonly name: string
  readonly entry: Entry
  readonly key: string | undefined
  readonly ref: Component.Ref.Any
  readonly props: unknown
}

/** A component's `children`, checked, by name. @internal */
export type Children = ReadonlyArray<readonly [name: string, entry: Entry]>

/** A component's `children`, when it has some: `Component.make` writes them. @internal */
export const of = (component: object): Children | undefined =>
  (component as { readonly "~children"?: Children | undefined })["~children"]

/**
 * Checks `children` once, at `make`: every child has lifetime `"model"`. A component listed bare is an
 * entry that always exists, with no props.
 *
 * @internal
 */
export const make = (owner: string, children: { readonly [name: string]: unknown }): Children =>
  Object.keys(children).map((name) => {
    const value = children[name]
    return [name, isEntry(value) ? value : entry("one", value as Component.Any, undefined, owner, name)] as const
  })

/**
 * The children a Model lists, in the order of `children` and of each keyed entry's rows. Two rows with one
 * key fail.
 *
 * @internal
 */
export const list = (owner: string, children: Children, model: unknown): Array<Listed> => {
  const out: Array<Listed> = []
  for (const [name, entry] of children) {
    const named = childRef.make(name, entry.component.definition.receives) as Component.Ref.Any
    const kind = entry[TypeId]
    if (kind === "keyed") {
      const seen = new Set<string>()
      for (const [key, props] of entry.props!(model) as ReadonlyArray<readonly [string, unknown]>) {
        if (seen.has(key)) {
          throw new Error(`${owner} lists ${name}[${key}] twice: each row of ${name} needs its own key`)
        }
        seen.add(key)
        out.push({ name, entry, key, ref: named.at(key), props })
      }
      continue
    }
    const props = entry.props === undefined ? {} : entry.props(model)
    if (kind === "optional" && (props === false || props === null || props === undefined)) continue
    out.push({ name, entry, key: undefined, ref: named, props })
  }
  return out
}

/**
 * `h.children` for one render: a helper per name that returns the child's declaration. Where the view
 * puts it is up to the view: the runtime holds each listed child that no tree it renders places.
 *
 * @internal
 */
export const helpers = (owner: string, children: Children, model: unknown): Record<string, unknown> => {
  const listed = list(owner, children, model)
  const placed = new Set<Listed>()
  const out: Record<string, unknown> = {}
  const place = (found: Listed, options: { readonly slots?: View.Child<any, any>["slots"] } | undefined) => {
    if (placed.has(found)) {
      throw new Error(`${owner} places ${found.ref.key} twice: a child of children is placed once`)
    }
    placed.add(found)
    return declaration(found, options?.slots)
  }
  const rows = new Map<string, Map<string, Listed>>()
  for (const found of listed) {
    if (found.key === undefined) {
      out[found.name] = (options?: { readonly slots?: View.Child<any, any>["slots"] }) => place(found, options)
      continue
    }
    let byKey = rows.get(found.name)
    if (byKey === undefined) rows.set(found.name, byKey = new Map())
    byKey.set(found.key, found)
  }
  for (const [name, entry] of children) {
    if (entry[TypeId] !== "keyed") continue
    out[name] = (key: string, options?: { readonly slots?: View.Child<any, any>["slots"] }) => {
      const found = rows.get(name)?.get(key)
      if (found === undefined) {
        throw new Error(`${owner} places ${name}[${key}], and its children list no ${name} with that key`)
      }
      return place(found, options)
    }
  }
  return out
}

/**
 * The declarations of the children a Model lists: how the runtime holds one no tree places.
 *
 * @internal
 */
export const held = (owner: string, children: Children, model: unknown): Array<View.Child<any, any>> =>
  list(owner, children, model).map((found) => declaration(found, undefined))

/**
 * Whether `key` is a ref key `children` can list, such as `profile` or `rows[a]`, listed now or not.
 *
 * @internal
 */
export const lists = (children: Children, key: string): boolean =>
  children.some(([name, entry]) => entry[TypeId] === "keyed" ? key.startsWith(name + "[") : key === name)

const declaration = (listed: Listed, slots: View.Child<any, any>["slots"]): View.Child<any, any> =>
  child.make(listed.entry.component, { ref: listed.ref, props: listed.props, onEmit: listed.entry.onEmit, slots })
