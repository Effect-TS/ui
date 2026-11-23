/** @internal */
import * as Predicate from "effect/Predicate"
import type * as Component from "../Component.ts"
import type * as View from "../View.ts"
import * as child from "./child.ts"

/** @internal */
export const TypeId: Component.LazyTypeId = "~@effect/ui/Component/Lazy"

/** @internal */
export type State =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading"; readonly promise: Promise<void> }
  | { readonly _tag: "Loaded"; readonly component: Component.Any }
  | { readonly _tag: "Failed"; readonly error: unknown }

/** @internal */
export interface Lazy extends Component.Lazy.Any {
  readonly load: () => Promise<Component.Any>
  state: State
}

/** @internal */
export const isLazy = (u: unknown): u is Component.Lazy.Any => Predicate.hasProperty(u, TypeId)

/** @internal */
export const nameOf = (lazy: Component.Lazy.Any): string => lazy[TypeId].name

/** @internal */
export const stateOf = (lazy: Component.Lazy.Any): State => (lazy as Lazy).state

/** @internal */
export const start = (lazy: Component.Lazy.Any): Promise<void> => {
  const self = lazy as Lazy
  const state = self.state
  if (state._tag === "Loaded") return Promise.resolve()
  if (state._tag === "Loading") return state.promise
  const promise = new Promise<unknown>((resolve) => resolve(self.load())).then(
    (component) => {
      self.state = isRenderable(component)
        ? { _tag: "Loaded", component }
        : {
          _tag: "Failed",
          error: new Error(`Component.lazy: "${nameOf(self)}" loaded no component that can be called`)
        }
    },
    (error) => {
      self.state = { _tag: "Failed", error }
    }
  )
  self.state = { _tag: "Loading", promise }
  return promise
}

const isRenderable = (u: unknown): u is Component.Any =>
  Predicate.hasProperty(u, "~@effect/ui/Component") && !Predicate.hasProperty(u, "~@effect/ui/Component/Headless")

const pendingAlive = new WeakMap<View.Child<any, any>, NonNullable<View.Child<any, any>["alive"]>>()

/** @internal */
export const scopedOnceLoaded = (view: View.Child<any, any>): View.Child<any, any> | undefined => {
  if (view.alive !== undefined) return view
  const alive = pendingAlive.get(view)
  const state = stateOf(view.component as Component.Lazy.Any)
  return alive !== undefined && state._tag === "Loaded" && state.component.definition.scoped
    ? { ...view, alive }
    : undefined
}

const variance = {
  _Props: (_: never) => _,
  _Events: (_: never) => _,
  _R: (_: never) => _,
  _Sl: (_: never) => _
}

/** @internal */
export const make = (name: string, load: () => Promise<Component.Any>): Component.Lazy.Any => {
  const call = (h: any, options: child.Options) => {
    const alive = h["~alive"]
    const state = self.state
    if (state._tag === "Loaded") return child.make(self, options, state.component.definition.scoped ? alive : undefined)
    const made = child.make(self, options)
    if (alive !== undefined) pendingAlive.set(made, alive)
    return made
  }
  const self: Lazy = Object.assign(call, {
    [TypeId]: { ...variance, name },
    load,
    state: { _tag: "Idle" } as State,
    preload: () => start(self)
  }) as any
  return self
}
