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

interface SwitchState {
  native?: boolean | undefined
  iosBg?: unknown
  bg?: unknown
  radius?: unknown
  alignSelf?: unknown
}

// Per-node state for controlled toggle restores (`topChange`) and iOS fallback
// styles (`iosBackgroundColor`, default `alignSelf: "flex-start"`) so partial
// prop updates always agree with a fresh mount.
const states = /* @__PURE__ */ new WeakMap<NativeNode, SwitchState>()

const stateOf = (n: NativeNode): SwitchState => {
  let state = states.get(n)
  if (state === undefined) states.set(n, state = {})
  return state
}

const applyIosBackground = (
  n: NativeNode,
  state: SwitchState,
  host: Native.ViewHost
) => {
  host.set(n, "backgroundColor", state.bg ?? state.iosBg)
  host.set(
    n,
    "borderRadius",
    state.radius ?? (state.iosBg === undefined ? undefined : 16)
  )
}

const switchBase = Native.defineView(
  () => new Native.Element<any, never, SwitchEvents, "switch">("switch"),
  {
    viewName: (_, host) => host.os === "ios" ? "RCTSwitch" : "AndroidSwitch",
    defaults: { accessibilityRole: "switch" },
    props: {
      value(n, value, host) {
        const checked = value === true
        const state = states.get(n)
        const observed = state?.native
        if (state !== undefined) state.native = undefined
        // Always commit the prop on change so iOS updates `_props.value` and
        // Android's `ReactSwitch.setOn` unlocks `allowChange`.
        host.set(n, host.os === "ios" ? "value" : "on", checked)
        if (host.os === "ios" && state?.alignSelf === undefined) {
          host.set(n, "alignSelf", "flex-start")
        }
        if (observed !== undefined && observed !== checked) {
          host.command(
            n,
            host.os === "ios" ? "setValue" : "setNativeValue",
            [checked]
          )
        }
      },
      disabled(n, value, host) {
        const disabled = value === true
        if (host.os === "ios") host.set(n, "disabled", disabled)
        else host.set(n, "enabled", !disabled)
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
      iosBackgroundColor(n, value, host) {
        if (host.os !== "ios") return
        const state = stateOf(n)
        state.iosBg = value
        applyIosBackground(n, state, host)
      },
      backgroundColor(n, value, host) {
        if (host.os !== "ios") return host.set(n, "backgroundColor", value)
        const state = stateOf(n)
        state.bg = value
        applyIosBackground(n, state, host)
      },
      borderRadius(n, value, host) {
        if (host.os !== "ios") return host.set(n, "borderRadius", value)
        const state = stateOf(n)
        state.radius = value
        applyIosBackground(n, state, host)
      },
      alignSelf(n, value, host) {
        if (host.os !== "ios") return host.set(n, "alignSelf", value)
        const state = stateOf(n)
        state.alignSelf = value
        host.set(n, "alignSelf", value ?? "flex-start")
      }
    },
    events: {
      topChange(n, event, host) {
        const checked = Boolean(event?.value)
        stateOf(n).native = checked
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
  const elementProps: Record<string, unknown> = {
    value: props.checked,
    disabled
  }
  if (props.thumbColor !== undefined) elementProps.thumbColor = props.thumbColor
  if (props.trackColor !== undefined) elementProps.trackColor = props.trackColor
  if (props.iosBackgroundColor !== undefined) {
    elementProps.iosBackgroundColor = props.iosBackgroundColor
  }
  return View.withFields(switchBase, {
    props: elementProps,
    ...(!disabled && onToggle !== undefined
      ? { handlers: { change: onToggle } }
      : undefined)
  }) as SwitchElement<Msg>
}
