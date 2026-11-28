/**
 * React Native's experimental `VirtualView` reports its visibility region
 * inside an ancestor `scroll`.
 *
 * The caller's Model owns visibility state: store `targetRect` on a `"hidden"`
 * event, clear it on `"visible"` or `"prerender"`, and pass it as `hidden`.
 * While hidden, the view skips `children` and reserves the supplied size.
 *
 * Other native props, such as `removeClippedSubviews`, are set with `.prop`.
 *
 * **Caveats**
 *
 * - Outside an ancestor `scroll`, native emits no `modeChange` events.
 * - Native may skip emitting `"visible"` if the view was already prerendered
 *   before entering the viewport, so do not use `"visible"` as an impression
 *   event.
 * - Fabric dispatches `"visible"` synchronously on the UI thread. Clear
 *   `hidden` directly in the pure `update` rather than through an async
 *   `Command` so the update stays on that reveal path.
 * - React Native exports `VirtualView` as unstable (`unstable_VirtualView`).
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as View from "@effect/ui/View"
import * as Native from "../Native.ts"

const modes: ReadonlyArray<VirtualViewMode> = ["visible", "prerender", "hidden"]

/**
 * The visibility region reported by native `VirtualView`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualViewMode = "visible" | "prerender" | "hidden"

/**
 * The payload of a `VirtualView`'s `modeChange` event, with rects relative to
 * the nearest ancestor `scroll`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface VirtualViewModeChange {
  readonly mode: VirtualViewMode
  readonly targetRect: Native.Rect
  readonly thresholdRect: Native.Rect
}

/**
 * The events of a `VirtualView`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface VirtualViewEvents extends Native.ViewEvents {
  readonly modeChange: VirtualViewModeChange
}

/**
 * Minimum placeholder size while hidden. Accepts `modeChange.targetRect`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface VirtualViewSize {
  readonly width?: number | undefined
  readonly height?: number | undefined
}

/**
 * Options accepted by {@link VirtualView}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface VirtualViewOptions<C> {
  /**
   * Skips `children` and reserves this size with `minWidth` / `minHeight`.
   * Mounting with `hidden` starts native tracking in hidden mode.
   */
  readonly hidden?: VirtualViewSize | undefined
  /**
   * Builds children only when `hidden` is undefined.
   */
  readonly children: () => C
}

const virtualView = Native.defineView(
  () =>
    new Native.ViewElement<any, never, VirtualViewEvents, "virtualView">(
      "virtualView"
    ),
  {
    viewName: "VirtualView",
    events: {
      topModeChange(n, event, host) {
        const mode = modes[event.mode]
        if (mode !== undefined) host.fire(n, "modeChange", { ...event, mode })
      }
    }
  }
)

/**
 * Returns a native `VirtualView` builder. Handle `.on("modeChange", ...)`
 * to update the caller-owned `hidden` state.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const VirtualView = <
  Msg,
  C extends Native.NoTextInput<NoInfer<Msg>, any> = never
>(
  _h: View.HelperBase<Msg, unknown>,
  options: VirtualViewOptions<C>
): Native.Element<
  Msg,
  View.Requirements<C>,
  VirtualViewEvents,
  "virtualView"
> =>
  virtualView.forward((node) => {
    const hidden = options.hidden
    // Set both on every render: removing a prop resets it to Fabric's default,
    // and `renderState`'s is 0 (unknown).
    return hidden === undefined
      ? View.withFields(node, {
        props: { ...node.props, initialHidden: false, renderState: 1 }
      }).children(options.children())
      : View.withFields(node, {
        props: {
          ...node.props,
          initialHidden: true,
          renderState: 2,
          minWidth: hidden.width ?? node.props.minWidth,
          minHeight: hidden.height ?? node.props.minHeight
        }
      })
  })
