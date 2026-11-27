/**
 * A stand-in for the device `NativeApp` provides: events a test sends, and
 * native modules it fakes.
 */
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import type * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as FakeFabric from "./FakeFabric.ts"

export const make = (
  os: string,
  modules: Record<string, unknown> = {}
) => {
  const listeners = new Map<string, Set<(payload: any) => void>>()
  const state = { blurs: 0 }
  const device: Native.Device = {
    os,
    on(event, listener) {
      const set = listeners.get(event) ?? new Set()
      listeners.set(event, set)
      // A copy, so the same listener can listen twice.
      const own = (payload: unknown) => listener(payload)
      set.add(own)
      return () => set.delete(own)
    },
    module: (name) => modules[name],
    blur: () => {
      state.blurs++
    },
    color: (color) => ({ processed: color })
  }
  return {
    device,
    state,
    emit: (event: string, payload?: unknown) => {
      for (const listener of Array.from(listeners.get(event) ?? [])) {
        listener(payload)
      }
    },
    listening: (event: string) => listeners.get(event)?.size ?? 0
  }
}

/**
 * A native module whose methods record their calls in `calls`, and answer
 * with `answers[method]` when it's a function.
 */
export const module = (
  answers: Record<string, (...args: ReadonlyArray<any>) => unknown> = {}
) => {
  const calls: Array<readonly [string, ...ReadonlyArray<unknown>]> = []
  const proxy = new Proxy({}, {
    get: (_, method: string) =>
      // Not a thenable.
      method === "then" ? undefined : (...args: ReadonlyArray<unknown>) => {
        calls.push([method, ...args])
        return answers[method]?.(...args)
      }
  })
  return { module: proxy as any, calls }
}

/** Runs `effect` on `device`. */
export const run = <A, E>(
  device: Native.Device,
  effect: Effect.Effect<A, E>
): Promise<A> =>
  Effect.runPromise(Effect.provideService(effect, Native.Device, device))

const Message = UiSchema.TaggedEnum({ Got: { value: Schema.Unknown } })
type Got = typeof Message.Type

/**
 * Mounts a component on `device` whose only Subscription is
 * `subscription`, and keeps the values its messages carry.
 */
export const listen = async (
  device: Native.Device,
  subscription: (
    got: (value: unknown) => Got
  ) => Subscription.Subscription<Got>
) => {
  const Listener = Native.component({
    name: "Listener",
    model: Schema.Struct({ values: Schema.Array(Schema.Unknown) }),
    message: Message
  }).make({
    init: () => ({ values: [] }),
    update: {
      Got: ($, { value }) =>
        $.evolve({ values: (values) => [...values, value] })
    },
    subscriptions: () => [subscription((value) => Message.Got({ value }))],
    view: (h) => h.text.children("listening")
  })
  const mounted = await FakeFabric.mount((root) =>
    Effect.provideService(
      Renderer.mount(Listener, {}, root),
      Native.Device,
      device
    )
  )
  const values = () => mounted.root.model()?.values ?? []
  return { ...mounted, values }
}
