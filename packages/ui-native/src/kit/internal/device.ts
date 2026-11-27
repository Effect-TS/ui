import * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import type * as Result from "effect/Result"
import * as Stream from "effect/Stream"
import * as Native from "../../Native.ts"

/**
 * One value per device, so tests with different fakes don't share state.
 *
 * @internal
 */
export const perDevice = <A>(
  make: (device: Native.Device) => A
): (device: Native.Device) => A => {
  const made = new WeakMap<Native.Device, A>()
  return (device) => {
    let value = made.get(device)
    if (value === undefined) made.set(device, value = make(device))
    return value
  }
}

/**
 * Runs `f` with the device.
 *
 * @internal
 */
export const withDevice = <A>(
  f: (device: Native.Device) => A
): Effect.Effect<A> => Native.Device.useSync(f)

/**
 * Listens for `event`. A module on iOS sends its events only while it
 * counts listeners, so `name`'s module is told of each one there, as React
 * Native's emitters tell it. Android's modules send them regardless.
 *
 * @internal
 */
export const observe = (
  device: Native.Device,
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

/**
 * A value native reports, read when first used and kept current after.
 *
 * @internal
 */
export interface Source<A> {
  readonly get: () => A
  readonly set: (value: A) => void
  readonly subscribe: (listener: (value: A) => void) => () => void
}

/**
 * One `Source` per device. `listen` starts with the first use and lasts as
 * long as the device: some modules, such as `DeviceInfo`, report only their
 * first value when asked, so the source can't stop listening. `set` skips
 * a value `equals` its current one.
 *
 * @internal
 */
export const source = <A>(
  read: (device: Native.Device) => A,
  listen: (device: Native.Device, set: (value: A) => void) => void,
  equals: (a: A, b: A) => boolean = Object.is
): (device: Native.Device) => Source<A> =>
  perDevice((device) => {
    const listeners = new Set<(value: A) => void>()
    let current: A
    let started = false
    const set = (value: A) => {
      if (equals(current, value)) return
      current = value
      for (const listener of listeners) listener(value)
    }
    const start = () => {
      if (started) return
      started = true
      current = read(device)
      listen(device, set)
    }
    return {
      get: () => (start(), current),
      set: (value) => (start(), set(value)),
      subscribe(listener) {
        start()
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  })

/**
 * The source's current value.
 *
 * @internal
 */
export const get = <A>(
  sourceOf: (device: Native.Device) => Source<A>
): Effect.Effect<A> => withDevice((device) => sourceOf(device).get())

/**
 * The source's changes, while the Stream runs.
 *
 * @internal
 */
export const changes = <A>(
  sourceOf: (device: Native.Device) => Source<A>
): Stream.Stream<A> =>
  events((device, listener) => sourceOf(device).subscribe(listener))

/**
 * The values `listen` reports while the Stream runs.
 *
 * @internal
 */
export const events = <A>(
  listen: (device: Native.Device, listener: (value: A) => void) => () => void
): Stream.Stream<A> =>
  Stream.callback<A>((queue) =>
    Native.Device.use((device) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          listen(device, (value) => Queue.offerUnsafe(queue, value))
        ),
        (off) => Effect.sync(off)
      )
    )
  )

const handle = <Msg, A>(
  handler: View.Handler<Msg, A>,
  value: A
): Msg | undefined =>
  typeof handler === "function"
    ? (handler as (value: A) => Msg | undefined)(value)
    : handler

/**
 * A Subscription that sends `handler`'s message for each value `listen`
 * reports, and for `initial`'s value when it starts. With `initial`, the
 * values reported before it starts are dropped: `initial` reads the latest.
 * A handler that returns `undefined` sends nothing.
 *
 * @internal
 */
export const subscription = <A, Msg>(
  name: string,
  handler: View.Handler<Msg, A>,
  listen: (device: Native.Device, listener: (value: A) => void) => () => void,
  initial?: ((device: Native.Device) => A) | undefined
): Subscription.Subscription<Msg> =>
  Subscription.direct<View.Handler<Msg, A>, Msg>(
    name,
    undefined,
    handler,
    (context, { emit, enter, fail }) => {
      const device = Context.get(context, Native.Device)
      const send = (value: A) =>
        enter((latest) => {
          try {
            const message = handle(latest, value)
            if (message !== undefined) emit(message)
          } catch (error) {
            fail(Cause.die(error))
          }
        })
      if (initial === undefined) return listen(device, send)
      let started = false
      return {
        close: listen(device, (value) => started && send(value)),
        start: () => {
          started = true
          send(initial(device))
        }
      }
    }
  )

/**
 * A Subscription to a source: its current value when it starts, then each
 * change.
 *
 * @internal
 */
export const onSource = <A, Msg>(
  name: string,
  sourceOf: (device: Native.Device) => Source<A>,
  handler: View.Handler<Msg, A>
): Subscription.Subscription<Msg> =>
  subscription(
    name,
    handler,
    (device, listener) => sourceOf(device).subscribe(listener),
    (device) => sourceOf(device).get()
  )

/**
 * Calls a native method that returns a Promise. A rejection fails with
 * `DeviceError`, and a missing module or method with one whose cause says
 * so.
 *
 * @internal
 */
export const promise = <A>(
  name: string,
  method: string,
  call: (module: any, device: Native.Device) => Promise<A> | undefined
): Effect.Effect<A, Native.DeviceError> =>
  Native.Device.use((device) =>
    Effect.tryPromise({
      try: () =>
        call(device.module(name), device) ??
          Promise.reject(new Error(`${name}.${method} isn't available`)),
      catch: (cause) => new Native.DeviceError({ module: name, method, cause })
    })
  )

/**
 * Calls a native method that takes a success and an error callback.
 *
 * @internal
 */
export const callback = <A>(
  name: string,
  method: string,
  call: (
    module: any,
    resolve: (value: A) => void,
    reject: (cause: unknown) => void,
    device: Native.Device
  ) => void
): Effect.Effect<A, Native.DeviceError> =>
  promise(name, method, (module, device) =>
    module === undefined
      ? undefined
      : new Promise<A>((resolve, reject) =>
        call(module, resolve, reject, device)
      ))

/**
 * A Command body that can't fail: the Effect's outcome as a `Result`.
 *
 * @internal
 */
export const result = <A, E>(
  effect: Effect.Effect<A, E>
): Effect.Effect<Result.Result<A, E>> => Effect.result(effect)
