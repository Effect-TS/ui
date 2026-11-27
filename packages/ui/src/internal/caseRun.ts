/** @internal */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as Case from "../testing/Case.ts"
import type * as runtime from "./runtime.ts"

/**
 * A case's fields, or a component and props alone.
 *
 * @internal
 */
export type Start = Pick<
  Case.Case<any, any>,
  "component" | "props" | "model" | "messages" | "layer"
>

const none: runtime.HotSession = {
  hasSnapshot: false,
  init: () => undefined,
  restored: () => false,
  hold: () => undefined,
  attach: () => {},
  flushed: () => {},
  clear: () => {},
  detach: () => {}
}

/**
 * The hot session a case root mounts with: `hot`, minus any saved snapshot,
 * with the root starting from the case's Model. What `init` returned is
 * dropped, Commands, events and sends included.
 *
 * @internal
 */
export const session = (
  c: Start,
  hot?: runtime.HotSession
): runtime.HotSession | undefined =>
  "model" in c
    ? {
      ...(hot ?? none),
      init: (inst, first) =>
        inst.parent === undefined
          ? { model: c.model, commands: [], events: [] }
          : hot?.init(inst, first)
    }
    : hot

/**
 * Runs `mount` with the case's Layer, built in the current Scope, then sends
 * the case's messages to the root in one synchronous pass.
 *
 * @internal
 */
export const mount = <
  Root extends { readonly send: (message: any) => void },
  E,
  R
>(
  c: Start,
  mount: Effect.Effect<Root, E, R>
): Effect.Effect<Root, E, R | Scope.Scope> => {
  const sent = Effect.tap(mount, (root) =>
    Effect.sync(() => {
      for (const message of c.messages ?? []) root.send(message)
    }))
  return c.layer === undefined ? sent : Effect.flatMap(
    Layer.build(c.layer),
    (context) => Effect.provide(sent, context)
  )
}
