/**
 * Insets its children past the status bar, navigation bar, display cutouts and
 * home indicator on both iOS and Android.
 *
 * **Details**
 *
 * Renders Fabric's `RCTSafeAreaView` on both platforms. Native insets replace
 * `padding*` on `SafeArea` itself on every side, including sides with zero
 * inset, so put content padding on a child view instead.
 *
 * On Android, insets arrive asynchronously after mount: children lay out once
 * without insets and again once `WindowInsets` are applied. React Native marks
 * `SafeAreaView` deprecated, while `RCTSafeAreaView` remains registered in
 * React Native 0.88.
 *
 * **Example** (A screen inset from system bars)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { SafeArea } from "@effect/ui-native/kit"
 *
 * const view = (h: Native.H<never>) =>
 *   SafeArea(h).style({ flex: 1, backgroundColor: "white" }).children(
 *     h.view.style({ flex: 1, padding: 16 }).children(
 *       h.text.children("Hello")
 *     )
 *   )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Native from "../Native.ts"

const element = Native.defineView(() => new Native.ViewElement("safeArea"), {
  viewName: "RCTSafeAreaView"
})

/**
 * A container that applies native safe-area insets as padding. Call it with the
 * caller's `h`, then chain `style`, `on` and `children`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const SafeArea = <Msg>(
  _h: Native.H<Msg>
): Native.ViewElement<Msg, never, Native.ViewEvents, "safeArea"> =>
  element as any
