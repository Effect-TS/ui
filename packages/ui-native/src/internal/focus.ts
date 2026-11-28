import type { Device } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import { mounted } from "./node.ts"
import { observe } from "./observe.ts"

/**
 * The view native last reported focused, until it reports it blurred, and
 * the soft keyboard's height while it's shown. `unreliable` is set on
 * Android before API 30, whose keyboard events can be missing, so the
 * keyboard counts as possibly shown, as in React Native.
 *
 * @internal
 */
export const focus: {
  node: NativeNode | undefined
  keyboard: number | undefined
  unreliable: boolean
} = { node: undefined, keyboard: undefined, unreliable: false }

/**
 * Blurs the focused view if it's still mounted, which hides the keyboard.
 *
 * @internal
 */
export const blurFocused = (): void => {
  const node = focus.node
  if (node !== undefined && mounted(node)) node.host.command(node, "blur")
}

const tracked = new WeakSet<Device>()

/** Follows the device's keyboard events. @internal */
export const trackKeyboard = (device: Device): void => {
  if (tracked.has(device)) return
  tracked.add(device)
  for (
    const event of [
      "keyboardWillShow",
      "keyboardDidShow",
      "keyboardWillHide",
      "keyboardDidHide"
    ]
  ) {
    const shown = event.endsWith("Show")
    observe(device, "KeyboardObserver", event, (e) => {
      focus.keyboard = shown ? e?.endCoordinates?.height ?? 0 : undefined
    })
  }
  if (device.os === "android") {
    focus.unreliable =
      device.module("PlatformConstants")?.getConstants?.().Version < 30
  }
}
