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
    onEmit: typeof onEmit === "object"
      ? (event) => {
        const tag = event._tag
        if (!Object.hasOwn(onEmit, tag)) {
          throw new Error(`Missing onEmit handler for event "${tag}"`)
        }
        return onEmit[tag](event)
      }
      : onEmit ?? ignore,
    fallback: options.fallback,
    onFailure: options.onFailure,
    view: options.view,
    slots: options.slots
  }
}

const ignore = () => undefined
