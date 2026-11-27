/**
 * A native toggle switch (`RCTSwitch` on iOS, `AndroidSwitch` on Android).
 *
 * `Switch` is a controlled view function, like `@effect/ui-kit`'s `Switch`:
 * it keeps no state and takes no `key`. The consumer owns `checked` and
 * stores what `onToggle` reports. Because native flips the switch before JS
 * answers, rejecting a toggle (leaving `checked` unchanged) sends the
 * controlled value back through `setValue` on iOS or `setNativeValue` on
 * Android.
 *
 * **Example** (A controlled switch whose value lives in the consumer's Model)
 *
 * ```ts
 * import { UiSchema } from "@effect/ui"
 * import { Native } from "@effect/ui-native"
 * import { Switch } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   ToggledNotify: { checked: Schema.Boolean }
 * })
 *
 * const Settings = Native.component({
 *   name: "Settings",
 *   model: Schema.Struct({ notify: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ notify: false }),
 *   update: {
 *     ToggledNotify: ($, { checked }) => $.evolve({ notify: checked })
 *   },
 *   view: (h, model) =>
 *     h.view.style({ flexDirection: "row", alignItems: "center", gap: 12 }).children(
 *       h.text.children("Notifications"),
 *       Switch(h, {
 *         props: { checked: model.notify },
 *         onToggle: ({ checked }) => Message.ToggledNotify({ checked })
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
import type { NativeNode } from "../NativeHost.ts"

/**
 * The controlled value, interaction state and colours for `Switch`.
 *
 * **Details**
 *
 * - `checked`: whether the switch is on. Required: the consumer owns it.
 * - `disabled`: when `true`, disables native interaction and omits the
 *   toggle handler.
 * - `thumbColor`: colour of the switch grip.
 * - `trackColor`: colours of the track when off (`false`) and on (`true`).
 * - `iosBackgroundColor`: background colour shown on iOS when the switch is
 *   off or disabled. Sets a pill `borderRadius` of `16` on iOS and is
 *   ignored on Android.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SwitchProps {
  readonly checked: boolean
  readonly disabled?: boolean | undefined
  readonly thumbColor?: Native.Color | undefined
  readonly trackColor?:
    | {
      readonly false?: Native.Color | undefined
      readonly true?: Native.Color | undefined
    }
    | undefined
  readonly iosBackgroundColor?: Native.Color | undefined
}

/**
 * The events of a `Switch`. Toggle changes are handled through `onToggle`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface SwitchEvents {
  readonly layout: Native.LayoutPayload
}

/**
 * The native element builder returned by `Switch`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SwitchElement<Msg, R = never> = Native.Element<
  Msg,
  R,
  SwitchEvents,
  "switch"
>

const defaults = { accessibilityRole: "switch" }
// As React Native: an iOS switch keeps its own size in a stretching parent.
const iosDefaults = { accessibilityRole: "switch", alignSelf: "flex-start" }

// What native shows after a toggle, until the `value` setter answers it.
const toggled = /* @__PURE__ */ new WeakMap<NativeNode, boolean>()

// The `iosBackgroundColor`, `backgroundColor` and `borderRadius` an iOS
// switch was given. A setter sees only its own value, and the style has to win
// over the fallback whichever of them changes.
const iosStyles = /* @__PURE__ */ new WeakMap<
  NativeNode,
  Record<string, unknown>
>()

const iosStyle =
  (name: string) => (n: NativeNode, value: unknown, host: Native.ViewHost) => {
    if (host.os !== "ios") {
      if (name !== "iosBackgroundColor") host.set(n, name, value)
      return
    }
    let style = iosStyles.get(n)
    if (style === undefined) iosStyles.set(n, style = {})
    style[name] = value
    const fallback = style.iosBackgroundColor
    host.set(n, "backgroundColor", style.backgroundColor ?? fallback)
    host.set(
      n,
      "borderRadius",
      style.borderRadius ?? (fallback === undefined ? undefined : 16)
    )
  }

const switchBase = Native.defineView(
  () => new Native.Element<any, never, SwitchEvents, "switch">("switch"),
  {
    viewName: (_, host) => host.os === "ios" ? "RCTSwitch" : "AndroidSwitch",
    defaults: (host) => host.os === "ios" ? iosDefaults : defaults,
    props: {
      value(n, value, host) {
        const ios = host.os === "ios"
        // An accepted toggle has to be committed: iOS reports only a change
        // from the committed value, and Android locks the switch until `on`
        // is set.
        host.set(n, ios ? "value" : "on", value)
        // Fabric sees no change when a toggle is rejected, so send a command.
        if (toggled.get(n) === !value) {
          host.command(n, ios ? "setValue" : "setNativeValue", [value])
        }
        toggled.delete(n)
      },
      disabled(n, value, host) {
        if (host.os === "ios") host.set(n, "disabled", value)
        else host.set(n, "enabled", !value)
      },
      thumbColor(n, value, host) {
        host.set(n, "thumbTintColor", value)
      },
      trackColor(n, value, host) {
        const track = value as SwitchProps["trackColor"]
        if (host.os === "ios") {
          host.set(n, "tintColor", track?.false)
          host.set(n, "onTintColor", track?.true)
        } else {
          // Names don't end in `Color`, so process explicitly for Fabric.
          host.set(
            n,
            "trackColorForFalse",
            track?.false === undefined ? undefined : host.color(track.false)
          )
          host.set(
            n,
            "trackColorForTrue",
            track?.true === undefined ? undefined : host.color(track.true)
          )
        }
      },
      iosBackgroundColor: iosStyle("iosBackgroundColor"),
      backgroundColor: iosStyle("backgroundColor"),
      borderRadius: iosStyle("borderRadius")
    },
    events: {
      topChange(n, event, host) {
        const checked = Boolean(event?.value)
        toggled.set(n, checked)
        host.fire(n, "change", { checked })
      }
    }
  }
)

/**
 * A controlled native switch. Call it with the component's `h`, `props`
 * carrying `checked`, and an `onToggle` handler that returns the message to
 * dispatch (or `undefined` to reject the toggle).
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Switch = <Msg>(
  _h: Native.H<Msg>,
  options: {
    readonly props: SwitchProps
    /** The message a toggle sends, with the value the user asked for. */
    readonly onToggle?:
      | ((event: { readonly checked: boolean }) => NoInfer<Msg> | undefined)
      | undefined
  }
): SwitchElement<Msg> => {
  const { onToggle, props } = options
  const disabled = props.disabled === true
  return View.withFields(switchBase, {
    props: {
      value: props.checked,
      disabled,
      thumbColor: props.thumbColor,
      trackColor: props.trackColor,
      iosBackgroundColor: props.iosBackgroundColor
    },
    handlers: disabled || onToggle === undefined
      ? View.noFields
      : { change: onToggle }
  })
}
