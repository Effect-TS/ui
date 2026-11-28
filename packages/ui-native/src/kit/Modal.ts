/**
 * Presents content in a native modal window above the current screen.
 *
 * **Details**
 *
 * Controlled by mounting and unmounting. There is no `dismiss` event: Android's
 * `RCTModalHostView` ignores `visible` and shows whenever mounted, and iOS only
 * emits `onDismiss` when `visible` flips to `false` while mounted (unmounting
 * recycles the view before dismissal completes).
 *
 * `onRequestClose` is required so Android Back cannot silently trap the user.
 * Android runs the modal in a separate `Dialog` window, so Back fires
 * `requestClose` and never triggers `NativeApp`'s `hardwareBackPress` fallback.
 *
 * `RCTModalHostView` paints nothing itself: put content in a child view with
 * `flex: 1` and a background, wrapped in `SafeArea` on edge-to-edge apps.
 *
 * **Example** (A modal opened and closed from the Model)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { Modal, SafeArea } from "@effect/ui-native/kit"
 *
 * const view = (h: Native.H<"Close">, open: boolean) =>
 *   h.view.style({ flex: 1 }).children(
 *     open && Modal(h, {
 *       onRequestClose: "Close",
 *       animationType: "slide"
 *     }).children(
 *       SafeArea(h).style({ flex: 1, backgroundColor: "white" }).children(
 *         h.view.style({ padding: 16 }).on("press", "Close").children(
 *           h.text.children("Close")
 *         )
 *       )
 *     )
 *   )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as View from "@effect/ui/View"
import * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

/**
 * How a `Modal` animates into and out of view.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ModalAnimationType = "none" | "slide" | "fade"

/**
 * How a `Modal` is presented on iOS. Ignored on Android.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ModalPresentationStyle =
  | "fullScreen"
  | "pageSheet"
  | "formSheet"
  | "overFullScreen"

/**
 * Interface orientations a `Modal` may rotate to on iOS.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ModalSupportedOrientation =
  | "portrait"
  | "portrait-upside-down"
  | "landscape"
  | "landscape-left"
  | "landscape-right"

/**
 * Payload of a `Modal`'s `orientationChange` event (iOS).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ModalOrientationChangePayload {
  readonly orientation: "portrait" | "landscape"
}

/**
 * Events of a `Modal`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ModalEvents {
  readonly requestClose: {}
  readonly show: {}
  readonly orientationChange: ModalOrientationChangePayload
  readonly layout: Native.LayoutPayload
}

/**
 * Options accepted by {@link Modal}. Prop names match React Native's
 * `RCTModalHostView`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ModalOptions<Msg> {
  /**
   * Fires on Android Back, Apple TV Menu, or iOS swipe dismissal (with
   * `allowSwipeDismissal`). Returning `undefined` keeps the modal open on
   * Android Back; with `allowSwipeDismissal: true` on iOS, UIKit has already
   * dismissed the sheet, so unmount the modal to keep the Model in sync.
   */
  readonly onRequestClose: View.Handler<Msg, {}>
  /** Defaults to `"none"`. */
  readonly animationType?: ModalAnimationType | undefined
  /** Defaults to `false`. */
  readonly transparent?: boolean | undefined
  /** iOS only. Defaults to `"fullScreen"`, or `"overFullScreen"` when `transparent` is `true`. */
  readonly presentationStyle?: ModalPresentationStyle | undefined
  /** iOS only. */
  readonly supportedOrientations?:
    | ReadonlyArray<ModalSupportedOrientation>
    | undefined
  /** iOS only. Allows swipe-to-dismiss on sheets, firing `onRequestClose`. */
  readonly allowSwipeDismissal?: boolean | undefined
  /** Android only. */
  readonly hardwareAccelerated?: boolean | undefined
  /** Android only. Draws under the status bar. */
  readonly statusBarTranslucent?: boolean | undefined
  /** Android only. Draws under the navigation bar. */
  readonly navigationBarTranslucent?: boolean | undefined
}

/**
 * The builder {@link Modal} returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class ModalElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends View.ElementBuilder<Msg, R, E, NativeNode, Tag> {
  /**
   * Phantom: keeps the builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: ModalElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Adds modal content. Wrap text in `h.text(...)`.
   *
   * @since 0.1.0
   */
  children<
    This,
    const C extends ReadonlyArray<Native.NoTextInput<Msg, unknown>>
  >(
    this: This,
    ...inputs: C
  ): View.WithRequirements<This, View.Requirements<C[number]>>
  children(...inputs: ReadonlyArray<View.Input<Msg, unknown>>): unknown {
    return View.withNoTextContent(this, inputs, Native.vocabulary)
  }
}

const element = Native.defineView(
  () => new ModalElement<any, never, ModalEvents, "modal">("modal"),
  {
    viewName: "RCTModalHostView",
    // iOS needs `visible: true`; `position: "absolute"` keeps the host out of flex flow.
    defaults: { visible: true, position: "absolute" }
  }
)

/**
 * Renders a native modal while mounted.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Modal = <Msg>(
  _h: Native.H<Msg>,
  { onRequestClose, ...props }: ModalOptions<Msg>
): ModalElement<Msg, never, ModalEvents, "modal"> =>
  View.withFields(element, {
    handlers: { requestClose: onRequestClose },
    props
  })
