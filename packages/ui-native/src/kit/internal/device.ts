import * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { type Cell, cell } from "../../internal/cell.ts"
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

/** @internal */
export { observe } from "../../internal/observe.ts"

/**
 * A value native reports, kept current.
 *
 * @internal
 */
export type Source<A> = Cell<A>

/**
 * One `Source` per device. `listen` starts with the first use and lasts as
 * long as the device: some modules, such as `DeviceInfo`, report only their
 * first value when asked, so the source can't stop listening.
 *
 * @internal
 */
export const source = <A>(
  read: (device: Native.Device) => A,
  listen: (device: Native.Device, set: (value: A) => void) => void,
  equals?: (a: A, b: A) => boolean
): (device: Native.Device) => Source<A> =>
  perDevice((device) => {
    const value = cell(read(device), equals)
    listen(device, value.set)
    return value
  })

/**
 * The source's current value.
 *
 * @internal
 */
export const get = <A>(
  sourceOf: (device: Native.Device) => Source<A>
): Effect.Effect<A> => Native.Device.useSync((device) => sourceOf(device).get())

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
 * A handler that returns `undefined` sends nothing, and the listener
 * answers whether a message was sent.
 *
 * @internal
 */
export const subscription = <A, Msg>(
  name: string,
  handler: View.Handler<Msg, A>,
  listen: (
    device: Native.Device,
    listener: (value: A) => boolean
  ) => () => void,
  initial?: ((device: Native.Device) => A) | undefined
): Subscription.Subscription<Msg> =>
  Subscription.direct<View.Handler<Msg, A>, Msg>(
    name,
    undefined,
    handler,
    (context, { emit, enter, fail }) => {
      const device = Context.get(context, Native.Device)
      const send = (value: A) => {
        let sent = false
        enter((latest) => {
          try {
            const message = handle(latest, value)
            if (message === undefined) return
            sent = true
            emit(message)
          } catch (error) {
            fail(Cause.die(error))
          }
        })
        return sent
      }
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
 * `DeviceError`, and a missing module with one whose cause says so, as does
 * a `call` that returns `undefined`. `name` can pick the module by device.
 *
 * @internal
 */
export const promise = <A>(
  name: string | ((device: Native.Device) => string),
  method: string,
  call: (module: any, device: Native.Device) => Promise<A> | undefined
): Effect.Effect<A, Native.DeviceError> =>
  Native.Device.use((device) => {
    const module = typeof name === "string" ? name : name(device)
    return Effect.tryPromise({
      try: () => {
        const native = device.module(module)
        return (native && call(native, device)) ??
          Promise.reject(new Error(`${module}.${method} isn't available`))
      },
      catch: (cause) => new Native.DeviceError({ module, method, cause })
    })
  })

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
    reject: (cause: unknown) => void
  ) => void
): Effect.Effect<A, Native.DeviceError> =>
  promise(
    name,
    method,
    (module) =>
      new Promise<A>((resolve, reject) => call(module, resolve, reject))
  )
