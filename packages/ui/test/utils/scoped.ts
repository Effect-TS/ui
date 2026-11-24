import { Cause, Effect, Exit } from "effect"
import type { Scope } from "effect"

/**
 * Runs a test body in a scope of its own and returns the message of the one defect it ended with: the
 * body's, or the end check's, which runs as the scope closes. Dies when it succeeded or ended with
 * several.
 */
export const defect = <A>(
  body: Effect.Effect<A, never, Scope.Scope>
): Effect.Effect<string> =>
  Effect.flatMap(Effect.exit(Effect.scoped(body)), (exit) => {
    const messages = Exit.isSuccess(exit)
      ? []
      : Cause.prettyErrors(exit.cause).map((error) => error.message)
    return messages.length === 1
      ? Effect.succeed(messages[0]!)
      : Effect.die(
        new Error(
          `expected one defect, got ${messages.length}: ${messages.join(" | ")}`
        )
      )
  })
