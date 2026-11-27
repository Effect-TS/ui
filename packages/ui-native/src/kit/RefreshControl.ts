/**
 * Pull to refresh for a `scroll`.
 *
 * **Details**
 *
 * Put the control among the children of the `scroll`. Pulling the content
 * down from the top fires `refresh` and shows the indicator. `refreshing`
 * is controlled: the indicator stays only while the Model sets it to `true`,
 * so set it in response to `refresh` and back to `false` when the work is
 * done.
 *
 * On iOS the control is a hidden view that attaches to the scroll view. On
 * Android it renders around the scroll view, which keeps its style: the
 * control takes the scroll view's margins, flex, size and position.
 *
 * **Example** (A list that reloads)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { RefreshControl } from "@effect/ui-native/kit"
 *
 * const view = (
 *   h: Native.H<"Refresh">,
 *   model: { readonly loading: boolean; readonly items: ReadonlyArray<string> }
 * ) =>
 *   h.scroll.style({ flex: 1 }).children(
 *     RefreshControl(h).refreshing(model.loading).on("refresh", "Refresh"),
 *     ...model.items.map((item) => h.text.key(item).children(item))
 *   )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Native from "../Native.ts"

/**
 * The appearance of a `RefreshControl`. iOS uses `tintColor`, `title` and
 * `titleColor`. Android uses `colors`, `progressBackgroundColor` and
 * `size`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface RefreshControlStyle {
  readonly tintColor?: Native.Color | undefined
  /** Text under the indicator. */
  readonly title?: string | undefined
  readonly titleColor?: Native.Color | undefined
  /** The colours the indicator cycles through. */
  readonly colors?: ReadonlyArray<Native.Color> | undefined
  readonly progressBackgroundColor?: Native.Color | undefined
  readonly size?: "default" | "large" | undefined
  /** How far down the indicator sits, in points. */
  readonly progressViewOffset?: number | undefined
}

/**
 * `refresh` fires when the user pulls down to refresh.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface RefreshControlEvents {
  readonly refresh: {}
}

/**
 * The builder `RefreshControl` returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class RefreshControlElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Native.Element<Msg, R, E, Tag, RefreshControlStyle> {
  /**
   * Phantom: keeps the builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: RefreshControlElement<
    Msg,
    R | this["~Add"],
    E,
    Tag
  >

  /**
   * Shows the indicator while `true`. `false` by default.
   *
   * @since 0.1.0
   */
  refreshing(refreshing: boolean): this {
    // `value` is the property the host keeps controlled.
    return this.prop("value", refreshing)
  }
}

// As React Native on Android: the control takes the scroll view's outer
// layout (`splitLayoutProps`), and the scroll view fills the control and
// scrolls before the control takes the pull.
const wrap = {
  outer:
    /^(margin.*|flex(Grow|Shrink|Basis)?|alignSelf|(min|max)(Width|Height)|width|height|position|top|right|bottom|left|transform(Origin)?|gap|rowGap|columnGap)$/,
  props: { flexGrow: 1, flexShrink: 1, nestedScrollEnabled: true }
}

const element = Native.defineView(
  () => new RefreshControlElement("refreshControl").refreshing(false),
  {
    viewName: (_, host) =>
      host.os === "android" ? "AndroidSwipeRefreshLayout" : "PullToRefreshView",
    // On iOS the hidden view sits before the content view, out of its layout,
    // so native finds the scroll view when it's mounted.
    defaults: { position: "absolute" },
    attach: (host) => host.os === "android" ? wrap : undefined,
    props: {
      value(n, value, host) {
        if (n.props.refreshing === value) return
        host.set(n, "refreshing", value)
        // Fabric sees no change when native started refreshing on its own.
        host.command(n, "setNativeRefreshing", [value])
      },
      colors: (n, value, host) =>
        host.set(
          n,
          "colors",
          (value as ReadonlyArray<unknown> | undefined)?.map(host.color)
        )
    },
    events: {
      topRefresh(n, _, host) {
        // Native shows the indicator already.
        n.props.refreshing = true
        host.fire(n, "refresh", {})
      }
    }
  }
)

/**
 * Adds pull to refresh to the `scroll` it's a child of. Call it with the
 * caller's `h`, then chain `refreshing`, `style` and `on("refresh")`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const RefreshControl = <Msg>(
  _h: Native.H<Msg>
): RefreshControlElement<Msg, never, RefreshControlEvents, "refreshControl"> =>
  element as any
