/**
 * A component's `children`: the children whose state its Model owns. Each
 * render lists them from the Model, gives the view `h.children` to place
 * them, and holds the ones it doesn't place, detached.
 *
 * @internal
 */
import type * as Component from "../Component.ts"
import * as View from "../View.ts"
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
export const isEntry = (value: unknown): value is Entry =>
  typeof value === "object" && value !== null && TypeId in value

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
 * What a component's view gets for one render: `h.children`, and `hold`, which adds the children the
 * view didn't place to what it returned, detached.
 *
 * @internal
 */
export const render = (owner: string, children: Children, model: unknown) => {
  const listed = list(owner, children, model)
  const placed = new Set<Listed>()
  const helpers: Record<string, unknown> = {}
  const place = (found: Listed, options: { readonly slots?: View.Child<any, any>["slots"] } | undefined) => {
    if (placed.has(found)) {
      throw new Error(`${owner} places ${found.ref.key} twice: a child of children is placed once`)
    }
    placed.add(found)
    return declaration(found, options?.slots, false)
  }
  const rows = new Map<string, Map<string, Listed>>()
  for (const found of listed) {
    if (found.key === undefined) {
      helpers[found.name] = (options?: { readonly slots?: View.Child<any, any>["slots"] }) => place(found, options)
      continue
    }
    let byKey = rows.get(found.name)
    if (byKey === undefined) rows.set(found.name, byKey = new Map())
    byKey.set(found.key, found)
  }
  for (const [name, entry] of children) {
    if (entry[TypeId] !== "keyed") continue
    helpers[name] = (key: string, options?: { readonly slots?: View.Child<any, any>["slots"] }) => {
      const found = rows.get(name)?.get(key)
      if (found === undefined) {
        throw new Error(`${owner} places ${name}[${key}], and its children list no ${name} with that key`)
      }
      return place(found, options)
    }
  }
  return {
    helpers,
    /** `root` with the children the view didn't place added at its end, detached. */
    hold: (root: View.Node<any, any>): View.Node<any, any> => {
      const held: Array<View.Child<any, any>> = []
      for (const found of listed) if (!placed.has(found)) held.push(declaration(found, undefined, true))
      return held.length === 0 ? root : holdIn(owner, root, held)
    }
  }
}

const declaration = (
  listed: Listed,
  slots: View.Child<any, any>["slots"],
  detached: boolean
): View.Child<any, any> =>
  child.make(
    listed.entry.component,
    { ref: listed.ref, props: listed.props, onEmit: listed.entry.onEmit, slots },
    detached
  )

// The children a view doesn't place are held at the end of its root element, or of the root element a
// headless child's view returns. Their placeholders are empty text, so the document doesn't change.
const holdIn = (
  owner: string,
  root: View.Node<any, any>,
  held: ReadonlyArray<View.Child<any, any>>
): View.Node<any, any> => {
  if (root._tag === "Element") return { ...root, children: [...root.children, ...held] }
  if (root._tag === "Child" && root.view !== undefined) {
    const view = root.view
    return { ...root, view: (parts: unknown) => holdIn(owner, View.toNode(view(parts)), held) }
  }
  throw new Error(
    `${owner} doesn't place every child of its children, and its view returns no element to hold the rest: ` +
      `return an element, such as h.div(...)`
  )
}
