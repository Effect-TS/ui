import { Cause, Effect, Exit } from "effect"
import type { Scope } from "effect"

/**
 * Runs a test body in a scope of its own and returns the messages of the defects it ended with: the
 * body's, or the end check's, which runs as the scope closes. Dies when the body succeeded.
 */
export const defects = <A>(body: Effect.Effect<A, never, Scope.Scope>): Effect.Effect<ReadonlyArray<string>> =>
  Effect.flatMap(Effect.exit(Effect.scoped(body)), (exit) =>
    Exit.isSuccess(exit)
      ? Effect.die(new Error("expected the test body to fail, and it succeeded"))
      : Effect.succeed(Cause.prettyErrors(exit.cause).map((error) => error.message)))

/**
 * Runs a test body in a scope of its own and returns the message of the one defect it ended with. Dies
 * when it succeeded or ended with several.
 */
export const defect = <A>(body: Effect.Effect<A, never, Scope.Scope>): Effect.Effect<string> =>
  Effect.flatMap(defects(body), (messages) =>
    messages.length === 1
      ? Effect.succeed(messages[0]!)
      : Effect.die(new Error(`expected one defect, got ${messages.length}: ${messages.join(" | ")}`)))
