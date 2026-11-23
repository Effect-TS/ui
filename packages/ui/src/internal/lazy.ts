/** @internal */
import * as Predicate from "effect/Predicate"
import type * as Component from "../Component.ts"
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
  Predicate.hasProperty(u, "~@effect/ui/Component") && !Predicate.hasProperty(u, "~@effect/ui/Component/Headless") &&
  (u as Component.Any).definition.scoped === false

const variance = {
  _Props: (_: never) => _,
  _Events: (_: never) => _,
  _R: (_: never) => _,
  _Sl: (_: never) => _
}

/** @internal */
export const make = (name: string, load: () => Promise<Component.Any>): Component.Lazy.Any => {
  const self: Lazy = Object.assign((_h: unknown, options: child.Options) => child.make(self, options), {
    [TypeId]: { ...variance, name },
    load,
    state: { _tag: "Idle" } as State,
    preload: () => start(self)
  }) as any
  return self
}
