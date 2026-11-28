import type * as Native from "../../Native.ts"
import { perDevice } from "./device.ts"

/**
 * Runs Android's default for Back, which closes the app.
 *
 * @internal
 */
export const exitWith = (d: Native.Device): void =>
  d.module("DeviceEventManager")?.invokeDefaultBackPressHandler()

/**
 * Adds a handler of Back, which takes a press by returning `true`, and
 * returns its removal. The latest handler gets a press first, except that
 * the `bottom` ones get it after every other. When none takes it, Android's
 * default runs. The device listens only while there is a handler, so the
 * app runs the default without one.
 *
 * @internal
 */
export const handle = perDevice((d) => {
  const stack: Array<() => boolean> = []
  let bottoms = 0
  let off: (() => void) | undefined
  const press = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!()) return
    }
    exitWith(d)
  }
  return (entry: () => boolean, bottom = false): () => void => {
    if (bottom) stack.splice(bottoms++, 0, entry)
    else stack.push(entry)
    off ??= d.on("hardwareBackPress", press)
    return () => {
      const at = stack.indexOf(entry)
      if (at < 0) return
      stack.splice(at, 1)
      if (at < bottoms) bottoms--
      if (stack.length === 0) {
        off?.()
        off = undefined
      }
    }
  }
})
