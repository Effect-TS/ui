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
    // As React Native's processColor: a string it knows becomes a number,
    // and one it doesn't null. A PlatformColor passes through.
    color: (color) =>
      typeof color === "string"
        ? ({ red: 0xffff0000 } as Record<string, number>)[color] ?? null
        : color
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
 * with `answers[method]` when it's a function. A method in `arity` throws
 * when called with another number of arguments, as Android's bridge does.
 */
export const module = (
  answers: Record<string, (...args: ReadonlyArray<any>) => unknown> = {},
  arity: Record<string, number> = {}
) => {
  const calls: Array<readonly [string, ...ReadonlyArray<unknown>]> = []
  const proxy = new Proxy({}, {
    get: (_, method: string) =>
      // Not a thenable.
      method === "then" ? undefined : (...args: ReadonlyArray<unknown>) => {
        calls.push([method, ...args])
        if (arity[method] !== undefined && args.length !== arity[method]) {
          throw new Error(
            `${method} takes ${arity[method]} arguments, got ${args.length}`
          )
        }
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
