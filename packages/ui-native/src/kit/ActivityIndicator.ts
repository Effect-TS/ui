/**
 * A circular native loading spinner (`ActivityIndicatorView` on iOS,
 * `AndroidProgressBar` on Android).
 *
 * `ActivityIndicator` is a view function. It keeps no state, so it takes no
 * `key`, and returns a {@link ActivityIndicatorElement} builder that chains
 * `.style(...)`, `.on("layout", ...)`, `.prop(...)`, `.key(...)` and `.ref(...)`.
 *
 * **Example** (A large blue spinner shown while loading)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { ActivityIndicator } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const Loader = Native.component({
 *   name: "Loader",
 *   model: Schema.Struct({ loading: Schema.Boolean })
 * }).make({
 *   init: () => ({ loading: true }),
 *   view: (h, model) =>
 *     h.view.style({ flex: 1, alignItems: "center", justifyContent: "center" }).children(
 *       ActivityIndicator(h, {
 *         props: { animating: model.loading, size: "large", color: "#2563eb" }
 *       })
 *     )
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as View from "@effect/ui/View"
import * as Native from "../Native.ts"

/**
 * The size of an `ActivityIndicator`: `"small"` (20pt), `"large"` (36pt), or
 * a custom width and height in points.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ActivityIndicatorSize = "small" | "large" | number

/**
 * Props for `ActivityIndicator`.
 *
 * **Details**
 *
 * - `animating`: whether the spinner is running (`true` by default). On
 *   Android, `false` hides the view.
 * - `color`: foreground colour of the spinner. Omitted, each platform uses
 *   its system default.
 * - `size`: `"small"` (20pt, default), `"large"` (36pt), or a number in
 *   points. A numeric size sets width and height on both platforms; only
 *   `"small"` and `"large"` are passed as the iOS `size` prop.
 * - `hidesWhenStopped`: on iOS, whether to hide the spinner when `animating`
 *   is `false` (`true` by default). Ignored on Android.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ActivityIndicatorProps {
  readonly animating?: boolean | undefined
  readonly color?: Native.Color | undefined
  readonly size?: ActivityIndicatorSize | undefined
  readonly hidesWhenStopped?: boolean | undefined
}

/**
 * The events of an `ActivityIndicator`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ActivityIndicatorEvents {
  readonly layout: Native.LayoutPayload
}

/**
 * The native element builder returned by `ActivityIndicator`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ActivityIndicatorElement<Msg, R = never> = Native.Element<
  Msg,
  R,
  ActivityIndicatorEvents,
  "activityIndicator"
>

const iosDefaults = { animating: true }
// `AndroidProgressBar` throws unless `styleAttr` is set.
const androidDefaults = {
  animating: true,
  styleAttr: "Normal",
  indeterminate: true
}

const indicatorBase = Native.defineView(
  () =>
    new Native.Element<
      any,
      never,
      ActivityIndicatorEvents,
      "activityIndicator"
    >("activityIndicator"),
  {
    viewName: (_, host) =>
      host.os === "ios" ? "ActivityIndicatorView" : "AndroidProgressBar",
    defaults: (host) => host.os === "ios" ? iosDefaults : androidDefaults,
    props: {
      size(n, value, host) {
        if (host.os === "ios") host.set(n, "size", value)
      },
      hidesWhenStopped(n, value, host) {
        if (host.os === "ios") host.set(n, "hidesWhenStopped", value)
      }
    }
  }
)

/**
 * A native activity indicator. Call it with the component's `h` and optional
 * `props`, then chain `.style(...)` or other builder methods on the result.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const ActivityIndicator = <Msg>(
  _h: Native.H<Msg>,
  options?: {
    readonly props?: ActivityIndicatorProps | undefined
  }
): ActivityIndicatorElement<Msg> => {
  const props = options?.props
  const size = props?.size ?? "small"
  const dim = size === "small" ? 20 : size === "large" ? 36 : size
  return View.withFields(indicatorBase, {
    props: {
      animating: props?.animating,
      color: props?.color,
      hidesWhenStopped: props?.hidesWhenStopped,
      // iOS takes only the named sizes.
      size: typeof size === "string" ? size : undefined,
      width: dim,
      height: dim
    }
  })
}
