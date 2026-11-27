/**
 * Keyboard toolbar on iOS (`RCTInputAccessoryView`).
 *
 * **Details**
 *
 * iOS only: other platforms render a hidden `RCTView` (`display: "none"`).
 * Link an `input` by matching `nativeID` with `.prop("inputAccessoryViewID", id)`,
 * or omit `nativeID` to wrap a sticky `input` directly. Children render inside
 * an inner `RCTSafeAreaView`.
 *
 * **Caveats**
 *
 * - React Native 0.88 deprecates `InputAccessoryView`.
 * - Upstream RN 0.88 regression (`react/react-native#59354`): a recycled
 *   `RCTInputAccessoryComponentView` can stay visible over its `TextInput` and
 *   block touches. Avoid unmounting and remounting on RN 0.88.
 * - Not yet verified on an iOS device.
 *
 * **Example** (A keyboard toolbar linked to an input)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { InputAccessory } from "@effect/ui-native/kit"
 *
 * const view = (h: Native.H<"Done">) =>
 *   h.view.style({ flex: 1 }).children(
 *     h.input.prop("inputAccessoryViewID", "toolbar"),
 *     InputAccessory(h, { nativeID: "toolbar", backgroundColor: "#f3f4f6" }).children(
 *       h.view.style({ padding: 8, alignItems: "flex-end" }).on("press", "Done").children(
 *         h.text.children("Done")
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
 * Options accepted by {@link InputAccessory}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InputAccessoryOptions {
  /** Matches an `input`'s `inputAccessoryViewID`. */
  readonly nativeID?: string | undefined
  readonly backgroundColor?: Native.Color | undefined
}

/**
 * Events of an `InputAccessory`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface InputAccessoryEvents {
  readonly layout: Native.LayoutPayload
}

/**
 * The builder {@link InputAccessory} returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class InputAccessoryElement<
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
  declare readonly "~With"?: InputAccessoryElement<
    Msg,
    R | this["~Add"],
    E,
    Tag
  >

  /**
   * Adds accessory bar content. Wrap text in `h.text(...)`.
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

const defaults = { position: "absolute" }
const hiddenDefaults = { position: "absolute", display: "none" }

const element = Native.defineView(
  () =>
    new InputAccessoryElement<
      any,
      never,
      InputAccessoryEvents,
      "inputAccessory"
    >("inputAccessory"),
  {
    viewName: (_, host) =>
      host.os === "ios" ? "RCTInputAccessoryView" : "RCTView",
    defaults: (host) => host.os === "ios" ? defaults : hiddenDefaults,
    content: {
      viewName: (_, host) => host.os === "ios" ? "RCTSafeAreaView" : "RCTView",
      defaults: { flex: 1 }
    }
  }
)

/**
 * Renders an iOS keyboard input accessory bar.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const InputAccessory = <Msg>(
  _h: Native.H<Msg>,
  options?: InputAccessoryOptions | undefined
): InputAccessoryElement<
  Msg,
  never,
  InputAccessoryEvents,
  "inputAccessory"
> =>
  options === undefined
    ? element
    : View.withFields(element, { props: { ...options } })
