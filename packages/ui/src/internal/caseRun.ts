/** @internal */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as Case from "../testing/Case.ts"
import type * as runtime from "./runtime.ts"

/**
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
 * Discards the saved snapshot so a full reload replays messages from the
 * case's starting state, not the restored state. A supplied model replaces
 * init's result, including its Commands, events and sends.
 *
 * @internal
 */
export const session = (
  c: Start,
  hot?: runtime.HotSession
): runtime.HotSession | undefined => {
  hot?.clear()
  return c.model !== undefined
    ? {
      ...(hot ?? none),
      init: (inst, first) =>
        inst.parent === undefined
          ? { model: c.model, commands: [], events: [] }
          : hot?.init(inst, first)
    }
    : hot
}

/**
 * Sends all messages in one synchronous pass so Command results arrive
 * after the list, even when a Command completes immediately.
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
  const messages = c.messages
  const sent = messages === undefined ?
    mount :
    Effect.tap(mount, (root) =>
      Effect.sync(() => {
        for (const message of messages) root.send(message)
      }))
  return c.layer === undefined ? sent : Effect.flatMap(
    Layer.build(c.layer),
    (context) => Effect.provide(sent, context)
  )
}
