/**
 * SPIKE (EFF-4218), not for release. The host-neutral half of hydration on `Kernel`, which doesn't
 * import this module: an app that only mounts doesn't carry it. `makeInit` is what a hydrating mount
 * passes as `init`. It gives an instance the Model the server rendered it with, read from the shipped
 * state by today's path and decoded through the component's model Schema, and runs `init` otherwise.
 *
 * As today, an instance whose parent started from `init` starts from `init` too, and a deferred
 * path, one the state lacks or one whose state doesn't decode takes `init`'s Model.
 *
 * Unlike today, an instance whose state decodes only asynchronously isn't held, inert on the server's
 * nodes, until it decodes: the kernel starts each instance at once. It starts from `init`'s Model, and
 * renders the decoded one when it arrives, unless an update came first.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as SchemaParser from "effect/SchemaParser"
import { segment } from "../internal/paths.ts"
import type * as Renderer from "../Renderer.ts"
import type * as View from "../View.ts"
import * as Kernel from "./Kernel.ts"

const decoders = new WeakMap<
  object,
  (encoded: unknown) => Effect.Effect<unknown, unknown>
>()

/** The decoded Model, or the fiber still decoding it. */
const decode = (
  component: Kernel.Runnable,
  encoded: unknown
): Exit.Exit<unknown, unknown> | Fiber.Fiber<unknown, unknown> => {
  const schema =
    (component as unknown as { readonly model: Schema.Codec<unknown, unknown> })
      .model
  let decoder = decoders.get(schema)
  if (decoder === undefined) {
    decoder = SchemaParser.decodeUnknownEffect(Schema.toCodecJson(schema))
    decoders.set(schema, decoder)
  }
  const exit = Effect.runSyncExit(decoder(encoded))
  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause)
    if (Result.isSuccess(defect) && Cause.isAsyncFiberError(defect.success)) {
      return defect.success.fiber
    }
  }
  return exit
}

/** Renders `model` once an instance's state decodes, if the instance still has `init`'s. */
const late = (
  inst: Kernel.Instance,
  initial: unknown,
  fiber: Fiber.Fiber<unknown, unknown>
): void => {
  fiber.addObserver((exit) => {
    if (Exit.isFailure(exit) || inst.closed || inst.model !== initial) return
    inst.model = exit.value
    if (!inst.dirty) {
      inst.dirty = true
      inst.tree.dirty.push(inst)
    }
    Kernel.flush(inst.tree)
  })
}

const noEvents: ReadonlyArray<unknown> = []

/**
 * Where the host's next server node is: the path of the innermost slot it's in under `base`, the path
 * of the instance that starts, given the paths of those that started before it. Today's paths put a slot's
 * content under the slot, which nothing in the kernel records.
 *
 * @stability experimental
 */
export type Slot = (
  base: string,
  started: ReadonlySet<string>
) => string | undefined

/**
 * What a hydrating mount passes as `init`, and `done`, which ends hydration once the mount has built
 * the tree.
 *
 * @stability experimental
 */
export const makeInit = (
  state: Renderer.State,
  slot: Slot
): {
  readonly init: (inst: Kernel.Instance) => Kernel.Next
  readonly done: () => void
} => {
  const paths = new WeakMap<Kernel.Instance, string>()
  const started = new Set<string>()
  const deferred = new Set(state["~deferred"])
  let hydrating = true
  const pathOf = (inst: Kernel.Instance): string | undefined => {
    const parent = inst.parent
    if (parent === undefined) return "/" + inst.component.definition.name
    const base = paths.get(parent)
    if (base === undefined) return undefined
    return (slot(base, started) ?? base) + "/" +
      segment(inst.at!.v as View.Child<any, any>)
  }
  return {
    init(inst) {
      const next = inst.component.init(inst.props)
      if (!hydrating) return next
      const path = pathOf(inst)
      if (
        path === undefined || deferred.has(path) || !Object.hasOwn(state, path)
      ) return next
      const decoded = decode(inst.component, state[path])
      if (Exit.isExit(decoded) && Exit.isFailure(decoded)) return next
      paths.set(inst, path)
      started.add(path)
      if (Exit.isExit(decoded)) {
        return {
          model: decoded.value,
          commands: next.commands,
          events: noEvents
        }
      }
      late(inst, next.model, decoded)
      return next
    },
    done() {
      hydrating = false
      started.clear()
    }
  }
}
