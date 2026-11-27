/**
 * React Native's `VirtualView`, which tracks its position inside an ancestor
 * `scroll` in native code and reports when it moves between visible, prerender
 * and hidden regions.
 *
 * `VirtualView` is a stateless view function. The caller's Model stores the
 * placeholder size reported in `onModeChange` when `mode` becomes `"hidden"`
 * and clears it when `mode` becomes `"visible"` or `"prerender"`, passing it
 * back as `hidden`. While `hidden` is defined, `children` is not called and
 * `VirtualView` keeps its space with `minWidth` / `minHeight` and sets
 * `renderState: 2`.
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

const rect = (raw: any): Native.Rect => ({
  x: raw?.x ?? 0,
  y: raw?.y ?? 0,
  width: raw?.width ?? 0,
  height: raw?.height ?? 0
})

/**
 * The visibility region reported by native `VirtualView`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualViewMode = "visible" | "prerender" | "hidden"

/**
 * The payload of a `VirtualView`'s `onModeChange` handler, with rects relative
 * to the nearest ancestor `scroll`.
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
export interface VirtualViewOptions<
  Msg,
  C extends Native.NoTextInput<NoInfer<Msg>, any> = Native.NoTextInput<
    NoInfer<Msg>,
    never
  >
> {
  /**
   * When defined, `children` is not called, `renderState` is set to `2`, and
   * `minWidth` / `minHeight` hold this size so the scroll content keeps its
   * layout.
   */
  readonly hidden?: VirtualViewSize | undefined
  /**
   * Whether native starts this view in the hidden mode on initial creation.
   * Defaults to `hidden !== undefined`, so mounting with a cached placeholder
   * size still receives a reveal event when the view lands in the viewport.
   */
  readonly initialHidden?: boolean | undefined
  /**
   * Clips children outside the scroll viewport in native code.
   */
  readonly removeClippedSubviews?: boolean | undefined
  /**
   * Called when native moves this view between `"visible"`, `"prerender"` and
   * `"hidden"`.
   */
  readonly onModeChange?:
    | ((event: VirtualViewModeChange) => NoInfer<Msg> | undefined)
    | undefined
  /**
   * Builds the children when the view is not hidden. Never called while
   * `hidden` is defined.
   */
  readonly children: () => C
}

const virtualView = Native.defineView(
  () =>
    new Native.Element<any, never, Native.ViewEvents, "virtualView">(
      "virtualView"
    ),
  {
    viewName: "VirtualView",
    defaults: { initialHidden: false, renderState: 1 },
    events: {
      topModeChange(n, event, host) {
        const mode = modes[event?.mode]
        if (mode === undefined) return
        host.fire(n, "modeChange", {
          mode,
          targetRect: rect(event?.targetRect),
          thresholdRect: rect(event?.thresholdRect)
        })
      }
    }
  }
)

/**
 * Renders a native `VirtualView`. Returns a `Native.Element` builder so
 * `.key(...)`, `.style(...)`, `.ref(...)` and view events can be chained on it.
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
  options: VirtualViewOptions<Msg, C>
): Native.Element<
  Msg,
  View.Requirements<C>,
  Native.ViewEvents,
  "virtualView"
> => {
  const {
    children,
    hidden,
    initialHidden,
    onModeChange,
    removeClippedSubviews
  } = options
  return (virtualView as Native.Element<
    Msg,
    View.Requirements<C>,
    Native.ViewEvents,
    "virtualView"
  >).forward((node) => {
    let out = node
      .prop("initialHidden", initialHidden ?? (hidden !== undefined))
      .prop("renderState", hidden === undefined ? 1 : 2)
    if (removeClippedSubviews !== undefined) {
      out = out.prop("removeClippedSubviews", removeClippedSubviews)
    }
    if (onModeChange !== undefined) {
      out = (out as Native.Element<Msg, any, any, "virtualView">).on(
        "modeChange",
        onModeChange
      )
    }
    if (hidden !== undefined) {
      if (hidden.width !== undefined) out = out.prop("minWidth", hidden.width)
      if (hidden.height !== undefined) {
        out = out.prop("minHeight", hidden.height)
      }
      return out
    }
    return View.withNoTextContent(out, [children()], Native.vocabulary)
  })
}
