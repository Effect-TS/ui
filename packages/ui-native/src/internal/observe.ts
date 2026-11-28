import type { Device } from "../Native.ts"

/**
 * Listens for `event`. A module on iOS sends its events only while it
 * counts listeners, so `name`'s module is told of each one there, as React
 * Native's emitters tell it. Android's modules send them regardless.
 *
 * @internal
 */
export const observe = (
  device: Device,
  name: string,
  event: string,
  listener: (payload: any) => void
): () => void => {
  const module = device.os === "ios" ? device.module(name) : undefined
  module?.addListener?.(event)
  const off = device.on(event, listener)
  return () => {
    off()
    module?.removeListeners?.(1)
  }
}
