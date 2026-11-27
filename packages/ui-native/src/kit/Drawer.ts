/**
 * Android navigation drawer over `AndroidDrawerLayout`.
 *
 * **Details**
 *
 * Android only: other platforms render a plain `RCTView` with the drawer panel
 * hidden. Pass drawer content in `options.drawer` and main content in
 * `.children(...)`.
 *
 * Open or close programmatically via a ref and `Native.Host`:
 * `host.command(node, "openDrawer")` / `host.command(node, "closeDrawer")`.
 *
 * Android Back does not close an open drawer (`hardwareBackPress` runs
 * normally). React Native marks `DrawerLayoutAndroid` deprecated, while
 * `AndroidDrawerLayout` remains registered in React Native 0.88.
 *
 * **Example** (A left navigation drawer with open/close events)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { Drawer } from "@effect/ui-native/kit"
 *
 * const DrawerRef = Native.ref("drawer")
 *
 * const view = (h: Native.H<"Opened" | "Closed">) =>
 *   Drawer(h, {
 *     drawerWidth: 260,
 *     drawer: h.view.style({ flex: 1, padding: 16 }).children(
 *       h.text.children("Menu")
 *     )
 *   })
 *     .ref(DrawerRef)
 *     .on("drawerOpen", "Opened")
 *     .on("drawerClose", "Closed")
 *     .children(h.text.children("Main"))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as View from "@effect/ui/View"
import * as Native from "../Native.ts"

/**
 * Which edge of the screen the drawer slides in from.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerPosition = "left" | "right"

/**
 * Whether touch gestures can open or close the drawer. Programmatic
 * `openDrawer` and `closeDrawer` commands work in every mode.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerLockMode = "unlocked" | "locked-closed" | "locked-open"

/**
 * Interaction state reported by `drawerStateChanged`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerState = "idle" | "dragging" | "settling"

/**
 * Payload of `drawerSlide`: `0` when closed, `1` when fully open.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DrawerSlidePayload {
  readonly offset: number
}

/**
 * Payload of `drawerStateChanged`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DrawerStateChangedPayload {
  readonly state: DrawerState
}

/**
 * Events of a `Drawer`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DrawerEvents {
  readonly drawerOpen: {}
  readonly drawerClose: {}
  readonly drawerSlide: DrawerSlidePayload
  readonly drawerStateChanged: DrawerStateChangedPayload
  readonly layout: Native.LayoutPayload
}

/**
 * Options accepted by {@link Drawer}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DrawerOptions<Msg, RD = never> {
  /** Sliding drawer panel content. */
  readonly drawer: Native.NoTextInput<Msg, RD>
  /** Panel width in points; required so Android and Fabric bounds match. */
  readonly drawerWidth: number
  /** Defaults to `"left"`. */
  readonly drawerPosition?: DrawerPosition | undefined
  /** Defaults to `"unlocked"`. */
  readonly drawerLockMode?: DrawerLockMode | undefined
  /** Defaults to `"white"`. */
  readonly drawerBackgroundColor?: Native.Color | undefined
}

const states: ReadonlyArray<DrawerState> = ["idle", "dragging", "settling"]

const element = Native.defineView(
  () => new Native.ViewElement<any, never, DrawerEvents, "drawer">("drawer"),
  {
    viewName: (_, host) =>
      host.os === "android" ? "AndroidDrawerLayout" : "RCTView",
    defaults: { flex: 1, elevation: 16 },
    events: {
      topDrawerStateChanged: (n, event, host) =>
        host.fire(n, "drawerStateChanged", {
          state: states[event?.drawerState] ?? "idle"
        })
    }
  }
)

const main = Native.defineView(
  () => new Native.ViewElement<any>("drawerMain"),
  {
    viewName: "RCTView",
    defaults: {
      collapsable: false,
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }
  }
)

const panelDefaults = {
  collapsable: false,
  position: "absolute",
  top: 0,
  bottom: 0
}
const hiddenPanelDefaults = {
  collapsable: false,
  position: "absolute",
  top: 0,
  bottom: 0,
  display: "none"
}

const panel = Native.defineView(
  () => new Native.ViewElement<any>("drawerPanel"),
  {
    viewName: "RCTView",
    defaults: (host) =>
      host.os === "android" ? panelDefaults : hiddenPanelDefaults
  }
)

/**
 * Renders an Android drawer layout. Pass drawer content in `options.drawer`
 * and main content via `.children(...)`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Drawer = <Msg, RD = never>(
  _h: Native.H<Msg>,
  { drawer, drawerBackgroundColor = "white", ...props }: DrawerOptions<Msg, RD>
): Native.ViewElement<Msg, RD, DrawerEvents, "drawer"> =>
  View.withFields(
    element as Native.ViewElement<Msg, never, DrawerEvents, "drawer">,
    { props: { ...props, drawerBackgroundColor } }
  ).forward((built) => {
    // Two children required: main first, panel second, following final host props.
    const node = View.build(built, [])
    return {
      ...node,
      children: [
        View.toNode(View.withContent(main, node.children)),
        View.toNode(
          panel.style({
            [node.props.drawerPosition === "right" ? "end" : "start"]: 0,
            width: node.props.drawerWidth,
            backgroundColor: node.props.drawerBackgroundColor
          } as Native.ViewStyle).children(drawer)
        )
      ]
    }
  })
