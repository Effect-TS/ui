/**
 * The child record a component call and a feature's `render` build.
 *
 * @internal
 */
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Component from "../Component.ts"
import type * as Feature from "../Feature.ts"
import type * as View from "../View.ts"

/** @internal */
export interface Options {
  readonly key?: string | undefined
  readonly props?: unknown
  readonly onEmit?:
    | ((event: any) => unknown)
    | Readonly<Record<string, (event: any) => unknown>>
    | undefined
  readonly fallback?: ((result: any) => View.Content<any, any>) | undefined
  readonly onFailure?:
    | ((failure: AsyncResult.Failure<never, unknown>) => unknown)
    | undefined
  readonly view?: ((parts: any) => View.Content<any, any>) | undefined
  readonly slots?: Readonly<Record<string, View.Input<any, any>>> | undefined
}

/** @internal */
export interface ComposeOptions extends Options {
  readonly parts: (parts: any) => unknown
}

/** @internal */
export const make = (
  component:
    | Component.Any
    | Component.Headless.Any
    | Component.Lazy.Any
    | Feature.Any,
  options: Options,
  alive?: View.Child<any, any>["alive"],
  owner?: View.Owner
): View.Child<any, any> => {
  const { onEmit } = options
  return {
    _tag: "Child",
    component: component as Component.Any,
    key: options.key ?? "",
    props: options.props ?? {},
    onEmit: typeof onEmit === "object"
      ? (event) => onEmit[event._tag](event)
      : onEmit ?? ignore,
    fallback: options.fallback,
    onFailure: options.onFailure,
    view: options.view,
    slots: options.slots,
    alive,
    owner
  }
}

/** @internal */
export const ComposedTypeId = "~@effect/ui/Component/Composed"

/** @internal */
export interface Composed {
  readonly [ComposedTypeId]: typeof ComposedTypeId
  readonly child: View.Child<any, any>
  readonly parts: (parts: any) => unknown
}

/** @internal */
export const isComposed = (u: unknown): u is Composed =>
  typeof u === "object" && u !== null && ComposedTypeId in u

const refused = ["view", "slots", "fallback"] as const

/** @internal */
export const compose = (
  owner: View.Owner,
  component: Component.Headless.Any,
  options: ComposeOptions
): Composed => {
  for (const name of refused) {
    if (options[name] !== undefined) {
      throw new Error(
        `p.child(${component.definition.name}) takes no \`${name}\``
      )
    }
  }
  return {
    [ComposedTypeId]: ComposedTypeId,
    child: make(component, options, undefined, owner),
    parts: options.parts
  }
}

/** @internal */
export const expand = (
  result: unknown,
  content: (parts: any) => View.Content<any, any>,
  failed?: (owner: View.Owner, cause: unknown) => View.Content<any, any>
): View.Content<any, any> => {
  if (!isComposed(result)) return content(result)
  return {
    ...result.child,
    view: (parts) => {
      let merged: unknown
      try {
        merged = result.parts(parts)
      } catch (cause) {
        if (failed === undefined) throw cause
        return failed(result.child.owner!, cause)
      }
      return expand(merged, content, failed)
    }
  }
}

const ignore = () => undefined
