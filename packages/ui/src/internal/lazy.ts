/** @internal */
import * as Cause from "effect/Cause"
import * as Predicate from "effect/Predicate"
import type * as Component from "../Component.ts"
import type * as View from "../View.ts"
import * as child from "./child.ts"
import * as Kernel from "./kernel.ts"

/** @internal */
export const TypeId: Component.LazyTypeId = "~@effect/ui/Component/Lazy"

/** @internal */
export type State =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading"; readonly promise: Promise<void> }
  | { readonly _tag: "Loaded"; readonly component: Component.Any }
  | { readonly _tag: "Failed"; readonly error: unknown }

interface Lazy extends Component.Lazy.Any {
  state: State
  readonly listeners: Set<() => void>
}

/** @internal */
export const isLazy = (u: unknown): u is Component.Lazy.Any =>
  Predicate.hasProperty(u, TypeId)

/** @internal */
export const stateOf = (lazy: Component.Lazy.Any): State => (lazy as Lazy).state

/** @internal */
export const watch = (
  lazy: Component.Lazy.Any,
  listener: () => void
): () => void => {
  const listeners = (lazy as Lazy).listeners
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const ComponentTypeId: Component.TypeId = "~@effect/ui/Component"

const isRenderable = (u: unknown): u is Component.Any =>
  Predicate.hasProperty(u, ComponentTypeId)

const pendingAlive = new WeakMap<
  View.Child<any, any>,
  NonNullable<View.Child<any, any>["alive"]>
>()

/** @internal */
export const keepAliveOnceLoaded = (
  view: View.Child<any, any>
): View.Child<any, any> => {
  if (view.alive !== undefined) return view
  const alive = pendingAlive.get(view)
  const state = stateOf(view.component as Component.Lazy.Any)
  return alive !== undefined && state._tag === "Loaded" &&
      state.component.definition.keepAlive
    ? { ...view, alive }
    : view
}

/** The slots waiting on a load, each with its listener's removal. */
const watched = new WeakMap<Kernel.Rec, () => void>()

/**
 * The kernel's `~load`: the component once loaded. Until then the slot shows its fallback, and is
 * settled when the load ends: to the component, or to the fallback's Failure branch, where it waits on
 * a retry another slot starts. A slot new to the load starts one when the last failed.
 */
function loaded(
  this: Lazy,
  owner: Kernel.Instance,
  rec: Kernel.Rec,
  at: string | undefined
): Kernel.Runnable | undefined {
  const state = this.state
  if (state._tag === "Loaded") return state.component as any
  if (watched.has(rec)) return undefined
  const unwatch = watch(this, () => {
    const loaded = this.state._tag === "Loaded"
    if (rec.inst !== owner || owner.closed || loaded) {
      unwatch()
      watched.delete(rec)
    }
    if (rec.inst !== owner || owner.closed) return
    if (loaded) rec.v = keepAliveOnceLoaded(rec.v as View.Child<any, any>)
    Kernel.settle(owner, rec, at)
    // A flush commits what it changed, and a server waiting for its loads checks again.
    const tree = owner.tree
    if (!tree.flushing && !tree.scheduled) {
      tree.scheduled = true
      tree.schedule(() => tree.ops.flush(tree))
    }
  })
  watched.set(rec, unwatch)
  if (state._tag !== "Loading") this.preload()
  return undefined
}

/** The kernel's `~cause`: why the load failed. */
function failure(this: Lazy): Cause.Cause<unknown> | undefined {
  const state = this.state
  return state._tag === "Failed" ? Cause.die(state.error) : undefined
}

const variance = {
  _Props: (_: never) => _,
  _Events: (_: never) => _,
  _R: (_: never) => _,
  _Sl: (_: never) => _
}

/** @internal */
export const make = (
  name: string,
  load: () => Promise<Component.Any>
): Component.Lazy.Any => {
  const preload = (): Promise<void> => {
    const state = self.state
    if (state._tag === "Loaded") return Promise.resolve()
    if (state._tag === "Loading") return state.promise
    const settle = (state: State) => {
      self.state = state
      for (const listener of self.listeners) listener()
    }
    const promise = new Promise<unknown>((resolve) => resolve(load())).then(
      (component) =>
        settle(
          isRenderable(component)
            ? { _tag: "Loaded", component }
            : {
              _tag: "Failed",
              error: new Error(
                `Component.lazy: "${name}" loaded no component that can be called`
              )
            }
        ),
      (error) => settle({ _tag: "Failed", error })
    )
    self.state = { _tag: "Loading", promise }
    return promise
  }
  const call = (h: any, options: child.Options) => {
    const state = self.state
    if (state._tag === "Loaded") {
      return child.make(
        self,
        options,
        state.component.definition.keepAlive ? h["~alive"] : undefined
      )
    }
    const made = child.make(self, options)
    const alive = h["~alive"]
    if (alive !== undefined) pendingAlive.set(made, alive)
    return made
  }
  const self: Lazy = Object.assign(call, {
    [TypeId]: { ...variance, name },
    state: { _tag: "Idle" } as State,
    listeners: new Set(),
    preload,
    "~load": loaded,
    "~cause": failure
  }) as any
  // A child written with `alive`, once the component it loaded is a keep-alive one, is kept by it.
  Object.defineProperty(self, "~kept", {
    get: () =>
      self.state._tag === "Loaded"
        ? (self.state.component as any)["~kept"]
        : undefined
  })
  return self
}
