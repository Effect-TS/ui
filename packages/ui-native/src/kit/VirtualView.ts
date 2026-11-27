/**
 * React Native's `VirtualView`, which tracks its position inside an ancestor
 * `scroll` in native code and reports when it moves between visible, prerender
 * and hidden regions.
 *
 * `VirtualView` is a stateless view function. The caller's Model stores the
 * `targetRect` of a `modeChange` event whose `mode` is `"hidden"` and clears
 * it on `"visible"` or `"prerender"`, passing it back as `hidden`. While
 * `hidden` is defined, `children` is not called and `VirtualView` keeps its
 * space with `minWidth` / `minHeight`.
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
  /** Native moved the view between `"visible"`, `"prerender"` and `"hidden"`. */
  readonly modeChange: VirtualViewModeChange
}

/**
 * The minimum size held while a `VirtualView` is hidden. A `Native.Rect` from
 * `VirtualViewModeChange.targetRect` satisfies this directly.
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
   * When defined, `children` is not called and `minWidth` / `minHeight` hold
   * this size so the scroll content keeps its layout. A view created with it
   * starts in native's hidden mode, so it gets a `modeChange` event when it
   * lands in the viewport.
   */
  readonly hidden?: VirtualViewSize | undefined
  /**
   * Builds the children when the view is not hidden. Never called while
   * `hidden` is defined.
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
 * Renders a native `VirtualView`. Returns a `Native.Element` builder so
 * `.key(...)`, `.style(...)`, `.ref(...)` and events such as
 * `.on("modeChange", ...)` can be chained on it.
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
