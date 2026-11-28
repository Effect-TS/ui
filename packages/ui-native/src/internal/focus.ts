import type { Device } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import { mounted } from "./node.ts"

/**
 * The view native last reported focused, until it reports it blurred, and
 * the soft keyboard: its height while native reports it shown. `unreliable`
 * is set on Android before API 30, whose keyboard events can be missing, so
 * React Native treats the keyboard as possibly shown there.
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

/**
 * Follows the device's keyboard events, as React Native's `ScrollView`
 * does. iOS sends them only while `KeyboardObserver` counts listeners.
 *
 * @internal
 */
export const trackKeyboard = (device: Device): void => {
  if (tracked.has(device)) return
  tracked.add(device)
  const observer = device.os === "ios"
    ? device.module("KeyboardObserver")
    : undefined
  for (const when of ["Will", "Did"]) {
    for (const event of ["Show", "Hide"]) {
      const name = "keyboard" + when + event
      const shown = event === "Show"
      observer?.addListener?.(name)
      device.on(name, (e) => {
        focus.keyboard = shown ? e?.endCoordinates?.height ?? 0 : undefined
      })
    }
  }
  if (device.os === "android") {
    focus.unreliable =
      device.module("PlatformConstants")?.getConstants?.().Version < 30
  }
}
