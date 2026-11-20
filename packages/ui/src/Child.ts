/**
 * The entries of a component's `children`: the children whose state its
 * Model owns.
 *
 * **Details**
 *
 * A component with `lifetime: "model"` is listed in its parent's
 * `children`, by name, and lives while it is listed, whether or not the
 * parent's view shows it. Its props are a function of the parent's Model,
 * so a hidden child gets the same props as a shown one, and `onEmit` gets
 * the parent's Model as it is when the event arrives. The view places it
 * with `h.children.<name>()`, which takes only slot content. A child the
 * view leaves out, wherever it leaves it out, is held out of the document
 * and keeps running.
 *
 * A component listed bare lives as long as its parent, with no props.
 * `Child.one` gives it props, `Child.optional` makes it exist while
 * `props` returns them, and `Child.keyed` makes one per key.
 *
 * **Example** (A settings page that keeps a hidden form's draft)
 *
 * ```ts
 * import { Child, Component } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const ProfileForm = Component.define({
 *   name: "ProfileForm",
 *   lifetime: "model",
 *   model: Schema.String,
 *   message: Schema.String
 * }).make({ init: () => "", update: (_, draft) => draft, view: (draft, h) => h.el("input").attr("value", draft) })
 *
 * export const SettingsPage = Component.define({
 *   name: "SettingsPage",
 *   lifetime: "view",
 *   model: Schema.Struct({ tab: Schema.Literals(["profile", "other"]) }),
 *   message: Schema.Never
 * }).make({
 *   children: { profile: Child.one(ProfileForm) },
 *   init: () => ({ tab: "profile" as const }),
 *   update: (model) => model,
 *   view: (model, h) => h.el("main", model.tab === "profile" ? h.children.profile() : "Other")
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "./Component.ts"
import * as children from "./internal/children.ts"

/**
 * Identifies an entry of `children`.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const TypeId: "~@effect/ui/Child" = children.TypeId

/**
 * Identifies an entry of `children`.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type TypeId = typeof TypeId

/**
 * When an entry's child exists: always, while `props` returns props, or one
 * per key `props` returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Kind = "one" | "optional" | "keyed"

/**
 * A component as `children` reads it: its props, events, requirements,
 * slots and lifetime, from the phantom every component carries.
 *
 * **Details**
 *
 * Reading them from the phantom, rather than with `Component.Props` and the
 * like, keeps an entry cheap to type-check: it relates one small interface
 * where those relate the whole component.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Shape<in out P, out E, out R, in Sl extends string, out Lt extends Component.Lifetime> {
  readonly [Component.TypeId]: Component.Mountable.Variance<P, E, R, never, Sl, Lt>
}

/**
 * An entry of a parent's `children`: the component, and its props and
 * `onEmit` as functions of the parent's Model. `R` and `Sl` are the
 * component's requirements and slots, which `h.children` places it with.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Entry<in Model, out Msg, out K extends Kind = Kind, out R = unknown, out Sl extends string = string> {
  readonly [TypeId]: K
  readonly component: Component.Any
  readonly props: ((model: Model) => unknown) | undefined
  readonly onEmit:
    | ((events: any, model: Model) => Msg | undefined)
    | { readonly [tag: string]: (event: any, model: Model) => Msg | undefined }
    | undefined
  readonly "~R"?: (_: never) => R
  readonly "~Sl"?: (_: never) => Sl
}

/**
 * What `children` takes: an entry, or a component listed bare, by name.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Children<Model, Msg> = {
  readonly [name: string]: Entry<Model, Msg, Kind, unknown, any> | Shape<any, any, any, never, Component.Lifetime>
}

/**
 * A child's `onEmit`: a callback, or one handler per tag for tagged events.
 * Each gets the event and the parent's Model as it is when the event
 * arrives, shown or hidden.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type OnEmit<Events, Model, Msg> =
  | ((event: Events, model: Model) => Msg | undefined)
  | EmitHandlers<Events, Model, Msg>

/**
 * One handler for each tag in a child's event union, given the event and the
 * parent's current Model.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type EmitHandlers<Events, Model, Msg> = [Events] extends [never] ? never
  : [Events] extends [{ readonly _tag: string }]
  // Reject a wide tag, as `View.Child.EmitHandlers` does.
    ? [(tag: EventTag<Events>) => void] extends [(tag: string) => void] ? never
    : {
      readonly [T in EventTag<Events>]: (event: Extract<Events, { readonly _tag: T }>, model: Model) => Msg | undefined
    }
  : never

type EventTag<Events> = Events extends { readonly _tag: infer T extends string } ? T : never

/**
 * The options of an entry. `props` is a function of the parent's Model.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options<in Events, in Model, out Msg, out P> {
  readonly props: (model: Model) => P
  /** Handle the child's events with a callback, or one handler per tag for tagged events. */
  readonly onEmit?: OnEmit<Events, Model, Msg> | undefined
}

/**
 * The options of an entry whose component takes no props: `props` may be
 * left out.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface OptionsNoProps<in Events, in Model, out Msg, out P> {
  readonly props?: ((model: Model) => P) | undefined
  /** Handle the child's events with a callback, or one handler per tag for tagged events. */
  readonly onEmit?: OnEmit<Events, Model, Msg> | undefined
}

/**
 * The type error of a `"view"` component listed in `children`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type ViewChildHint = "A component with lifetime 'view' is called in a view, not listed in `children`"

/**
 * The type error of a component listed bare in `children` that takes props.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type BarePropsHint = "A component listed bare takes no props: list it with Child.one to give it props"

/**
 * A component listed in `children` has `lifetime: "model"`. An erased
 * lifetime passes.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Listed<Lt> = [Lt] extends ["view"] ? ViewChildHint : unknown

/**
 * A child that lives as long as its parent.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const one: <P, E, R, Sl extends string, Lt extends Component.Lifetime, Model = unknown, Msg = never>(
  component: Shape<P, E, R, Sl, Lt> & Listed<Lt>,
  ...options: {} extends P ? [options?: OptionsNoProps<E, Model, Msg, P>] : [options: Options<E, Model, Msg, P>]
) => Entry<Model, Msg, "one", R, Sl> = (component: unknown, options?: any) => make("one", component, options)

/**
 * A child that exists while `props` returns props, and not while it returns
 * `false`, `null` or `undefined`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const optional = <P, E, R, Sl extends string, Lt extends Component.Lifetime, Model, Msg = never>(
  component: Shape<P, E, R, Sl, Lt> & Listed<Lt>,
  options: Options<E, Model, Msg, P | false | null | undefined>
): Entry<Model, Msg, "optional", R, Sl> => make("optional", component, options)

/**
 * One child per key `props` returns, each with that key's props.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const keyed = <P, E, R, Sl extends string, Lt extends Component.Lifetime, Model, Msg = never>(
  component: Shape<P, E, R, Sl, Lt> & Listed<Lt>,
  options: Options<E, Model, Msg, ReadonlyArray<readonly [key: string, props: P]>>
): Entry<Model, Msg, "keyed", R, Sl> => make("keyed", component, options)

const make = (kind: Kind, component: unknown, options: any): any =>
  children.entry(kind, component as Component.Any, options as any)
