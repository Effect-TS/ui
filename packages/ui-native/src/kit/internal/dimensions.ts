import type * as Dimensions from "../Dimensions.ts"
import { source } from "./device.ts"

const empty: Dimensions.Size = { width: 0, height: 0, scale: 1, fontScale: 1 }

const points = (p: Dimensions.Size): Dimensions.Size => ({
  width: p.width,
  height: p.height,
  scale: p.scale,
  fontScale: p.fontScale
})

// Android reports pixels, which React Native turns into points.
const pixels = (p: Dimensions.Size | undefined): Dimensions.Size | undefined =>
  p == null ? undefined : {
    width: p.width / p.scale,
    height: p.height / p.scale,
    scale: p.scale,
    fontScale: p.fontScale
  }

const fromNative = (d: any): Dimensions.Dimensions => {
  const window = pixels(d?.windowPhysicalPixels) ??
    (d?.window == null ? empty : points(d.window))
  return {
    window,
    screen: pixels(d?.screenPhysicalPixels) ??
      (d?.screen == null ? window : points(d.screen))
  }
}

/** @internal */
export const dimensions = source<Dimensions.Dimensions>(
  (device) =>
    fromNative(device.module("DeviceInfo")?.getConstants().Dimensions),
  (device, set) => device.on("didUpdateDimensions", (d) => set(fromNative(d)))
)
