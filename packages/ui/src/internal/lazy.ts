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

interface Lazy extends Component.Lazy.Any {
  state: State
}

/** @internal */
export const isLazy = (u: unknown): u is Component.Lazy.Any => Predicate.hasProperty(u, TypeId)

/** @internal */
export const stateOf = (lazy: Component.Lazy.Any): State => (lazy as Lazy).state

const ComponentTypeId: Component.TypeId = "~@effect/ui/Component"

// A headless component carries only its own type id.
const isRenderable = (u: unknown): u is Component.Any => Predicate.hasProperty(u, ComponentTypeId)

const pendingAlive = new WeakMap<View.Child<any, any>, NonNullable<View.Child<any, any>["alive"]>>()

/**
 * `view` as the call writes it once the module has loaded: with the scope's `alive` when the
 * component is scoped.
 *
 * @internal
 */
export const scopedOnceLoaded = (view: View.Child<any, any>): View.Child<any, any> => {
  if (view.alive !== undefined) return view
  const alive = pendingAlive.get(view)
  const state = stateOf(view.component as Component.Lazy.Any)
  return alive !== undefined && state._tag === "Loaded" && state.component.definition.scoped
    ? { ...view, alive }
    : view
}

const variance = {
  _Props: (_: never) => _,
  _Events: (_: never) => _,
  _R: (_: never) => _,
  _Sl: (_: never) => _
}

/** @internal */
export const make = (name: string, load: () => Promise<Component.Any>): Component.Lazy.Any => {
  const preload = (): Promise<void> => {
    const state = self.state
    if (state._tag === "Loaded") return Promise.resolve()
    if (state._tag === "Loading") return state.promise
    const promise = new Promise<unknown>((resolve) => resolve(load())).then(
      (component) => {
        self.state = isRenderable(component)
          ? { _tag: "Loaded", component }
          : { _tag: "Failed", error: new Error(`Component.lazy: "${name}" loaded no component that can be called`) }
      },
      (error) => {
        self.state = { _tag: "Failed", error }
      }
    )
    self.state = { _tag: "Loading", promise }
    return promise
  }
  const call = (h: any, options: child.Options) => {
    const state = self.state
    // As a component's own call does, `~alive` is read only for a scoped one.
    if (state._tag === "Loaded") {
      return child.make(self, options, state.component.definition.scoped ? h["~alive"] : undefined)
    }
    const made = child.make(self, options)
    const alive = h["~alive"]
    if (alive !== undefined) pendingAlive.set(made, alive)
    return made
  }
  const self: Lazy = Object.assign(call, {
    [TypeId]: { ...variance, name },
    state: { _tag: "Idle" } as State,
    preload
  }) as any
  return self
}
