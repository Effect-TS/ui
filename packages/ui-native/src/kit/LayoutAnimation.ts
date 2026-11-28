/**
 * Animates the next layout change with React Native's `LayoutAnimation`:
 * views that a step adds, moves, resizes or removes animate into place.
 *
 * Name a config with `define`, or use a preset, and ask for it from the
 * step whose render changes the layout.
 *
 * The host configures the animation just before it commits the render, and
 * only if the render changes the tree. When a step asks for several, the
 * last one it names wins.
 *
 * React Native 0.88 animates layout on Android only when the app turns on
 * the `enableLayoutAnimationsOnAndroid` feature flag natively. Without it,
 * the layout changes at once.
 *
 * **Example** (Expanding a row)
 *
 * ```ts
 * import { LayoutAnimation } from "@effect/ui-native/kit"
 *
 * ClickedExpand: ($) =>
 *   $.evolve({ expanded: true }).viewTransition([LayoutAnimation.spring])
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import { layouts } from "../internal/kinds.ts"

/**
 * How views animate when they are created, updated or deleted.
 * `springDamping` applies to the `"spring"` type.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Animation {
  readonly type?:
    | "spring"
    | "linear"
    | "easeInEaseOut"
    | "easeIn"
    | "easeOut"
    | "keyboard"
    | undefined
  readonly property?:
    | "opacity"
    | "scaleX"
    | "scaleY"
    | "scaleXY"
    | undefined
  readonly duration?: number | undefined
  readonly delay?: number | undefined
  readonly springDamping?: number | undefined
  readonly initialVelocity?: number | undefined
}

/**
 * A layout animation: its `duration` in milliseconds, and how views that are
 * created, updated and deleted animate.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Config {
  readonly duration: number
  readonly create?: Animation | undefined
  readonly update?: Animation | undefined
  readonly delete?: Animation | undefined
}

/**
 * Registers `config` as the view transition type `name`, and returns
 * `name` to pass to `$.viewTransition`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const define = /* @__NO_SIDE_EFFECTS__ */ (
  name: string,
  config: Config
): string => {
  layouts.set(name, config)
  return name
}

/**
 * Fades views in and out, and eases moves, over 300 ms.
 *
 * @stability experimental
 * @category presets
 * @since 0.1.0
 */
export const easeInEaseOut: string = define("easeInEaseOut", {
  duration: 300,
  create: { type: "easeInEaseOut", property: "opacity" },
  update: { type: "easeInEaseOut" },
  delete: { type: "easeInEaseOut", property: "opacity" }
})

/**
 * Fades views in and out, and moves them linearly, over 500 ms.
 *
 * @stability experimental
 * @category presets
 * @since 0.1.0
 */
export const linear: string = define("linear", {
  duration: 500,
  create: { type: "linear", property: "opacity" },
  update: { type: "linear" },
  delete: { type: "linear", property: "opacity" }
})

/**
 * Fades views in and out, and springs moves into place, over 700 ms.
 *
 * @stability experimental
 * @category presets
 * @since 0.1.0
 */
export const spring: string = define("spring", {
  duration: 700,
  create: { type: "linear", property: "opacity" },
  update: { type: "spring", springDamping: 0.4 },
  delete: { type: "linear", property: "opacity" }
})
