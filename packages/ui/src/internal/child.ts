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
  // Every ref fits `Ref.Any`; the call's type has checked what it receives.
  readonly ref?: Component.Ref.Any | undefined
  readonly props?: unknown
  readonly onEmit?: ((event: any) => unknown) | Readonly<Record<string, (event: any) => unknown>> | undefined
  readonly fallback?: ((result: any) => View.Content<any, any>) | undefined
  readonly onFailure?: ((failure: AsyncResult.Failure<never, unknown>) => unknown) | undefined
  readonly view?: ((parts: any) => View.Content<any, any>) | undefined
  readonly slots?: Readonly<Record<string, View.Input<any, any>>> | undefined
  readonly detached?: boolean | undefined
  readonly owner?: View.Owner | undefined
}

/** @internal */
export const make = (
  component: Component.Any | Component.Headless.Any | Feature.Any,
  options: Options
): View.Child<any, any> => {
  // A child with a key and a ref would have two identities that can disagree.
  if (options.key !== undefined && options.ref !== undefined) {
    throw new Error("A child takes a key or a ref, not both")
  }
  const { onEmit } = options
  return {
    _tag: "Child",
    component: component as Component.Any,
    // Without a key or a ref, the empty key: the child's segment is `Name[]`.
    key: options.ref !== undefined ? options.ref.key : options.key ?? "",
    ref: options.ref,
    props: options.props ?? {},
    onEmit: typeof onEmit === "object" ? (event) => onEmit[event._tag](event) : onEmit ?? ignore,
    fallback: options.fallback,
    onFailure: options.onFailure,
    view: options.view,
    slots: options.slots,
    detached: options.detached === true,
    owner: options.owner
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
export const isComposed = (u: unknown): u is Composed => typeof u === "object" && u !== null && ComposedTypeId in u

const refused = ["view", "slots", "fallback", "detached"] as const

/** @internal */
export const compose = (
  owner: View.Owner,
  component: Component.Headless.Any,
  options: Options & { readonly parts: (parts: any) => unknown }
): Composed => {
  for (const name of refused) {
    if (options[name] !== undefined) {
      throw new Error(`p.child(${component.definition.name}) takes no \`${name}\``)
    }
  }
  return {
    [ComposedTypeId]: ComposedTypeId,
    child: make(component, { ...options, owner }),
    parts: options.parts
  }
}

/** @internal */
export class MergeFailure extends Error {
  readonly owner: View.Owner
  constructor(owner: View.Owner, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.owner = owner
  }
}

/** @internal */
export const merge = (composed: Composed, parts: unknown): unknown => {
  try {
    return composed.parts(parts)
  } catch (cause) {
    throw new MergeFailure(composed.child.owner!, cause)
  }
}

/** @internal */
export const expand = (
  result: unknown,
  content: (parts: any) => View.Content<any, any>
): View.Content<any, any> =>
  isComposed(result)
    ? { ...result.child, view: (parts) => expand(merge(result, parts), content) }
    : content(result)

const ignore = () => undefined
