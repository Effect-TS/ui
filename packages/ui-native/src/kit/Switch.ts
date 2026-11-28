/**
 * A controlled native switch (`RCTSwitch` on iOS, `AndroidSwitch` on Android).
 *
 * The consumer owns `checked` and stores what `onToggle` reports. Native flips
 * before JS answers, so leaving `checked` unchanged sends it back through
 * `setValue` on iOS or `setNativeValue` on Android.
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
 * Controlled state and colours for `Switch`.
 *
 * **Details**
 *
 * - `checked`: whether the switch is on.
 * - `disabled`: disables native interaction and omits the toggle handler.
 * - `thumbColor`: colour of the switch grip.
 * - `trackColor`: colours of the track when off (`false`) and on (`true`).
 * - `iosBackgroundColor`: iOS background colour when off or disabled; sets a
 *   `borderRadius` of `16` unless overridden by `.style(...)`, and is ignored
 *   on Android.
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

const toggled = /* @__PURE__ */ new WeakMap<NativeNode, boolean>()

// Keeps explicit iOS styles winning over `iosBackgroundColor` across updates.
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
 * A controlled native switch. Pass `checked` in `props` and handle changes
 * with `onToggle` (return `undefined` to reject).
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
  const elementProps = {
    value: props.checked,
    disabled,
    thumbColor: props.thumbColor,
    trackColor: props.trackColor,
    iosBackgroundColor: props.iosBackgroundColor
  }
  return View.withFields(
    switchBase,
    disabled || onToggle === undefined
      ? { props: elementProps }
      : { props: elementProps, handlers: { change: onToggle } }
  )
}
