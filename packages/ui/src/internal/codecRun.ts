import * as Cause from "effect/Cause"
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../Component.ts"
import type * as Kernel from "./kernel.ts"
import { redactedIssue } from "./stateCodec.ts"

/** @internal */
export const runCodec = <A, E>(
  effect: Effect.Effect<A, E>
): Exit.Exit<A, E> | Fiber.Fiber<A, E> => {
  const exit = Effect.runSyncExit(effect)
  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause)
    if (Result.isSuccess(defect) && Cause.isAsyncFiberError(defect.success)) {
      return defect.success.fiber as Fiber.Fiber<A, E>
    }
  }
  return exit
}

const warned = new WeakMap<object, Set<string>>()

/** @internal */
export const warnOnce = (
  kind: string,
  inst: Kernel.Instance,
  ctx: Context.Context<any>,
  message: () => string
): void => {
  const component = inst.component as unknown as Component.Any
  let kinds = warned.get(component)
  if (kinds === undefined) warned.set(component, kinds = new Set())
  if (kinds.has(kind)) return
  kinds.add(kind)
  Effect.runForkWith(ctx)(
    Effect.logWarning(`${component.definition.name}: ${message()}`)
  )
}

const formatIssue = SchemaIssue.makeFormatterDefault()

/** @internal */
export const isRedacted = (cause: Cause.Cause<SchemaIssue.Issue>): boolean => {
  const error = Cause.findErrorOption(cause)
  return Option.isSome(error) && error.value === redactedIssue
}

/** @internal */
export const formatCause = (cause: Cause.Cause<SchemaIssue.Issue>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => Cause.pretty(cause),
    onSome: formatIssue
  })

/** @internal */
export const warnUnencoded = (
  inst: Kernel.Instance,
  ctx: Context.Context<any>,
  cause: Cause.Cause<SchemaIssue.Issue>
): void => {
  if (isRedacted(cause)) return
  warnOnce(
    "unencoded",
    inst,
    ctx,
    () =>
      "its state doesn't encode as JSON, so the server sends no state for it and the client builds it and " +
      "everything under it fresh, without hydration, and history doesn't restore it. " +
      formatCause(cause)
  )
}
