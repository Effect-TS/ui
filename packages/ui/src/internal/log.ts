import * as Cause from "effect/Cause"
import type * as Clock from "effect/Clock"
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"

type LogLevel = "Warn" | "Error"

interface LoggerLike {
  readonly log: (options: {
    readonly cause: Cause.Cause<unknown>
    readonly fiber: unknown
    readonly date: Date
    readonly logLevel: LogLevel
    readonly message: ReadonlyArray<unknown>
  }) => void
}

// Reads Effect's logger, console, and clock references via `mapUnsafe` so apps
// that don't configure them don't bundle Effect's default logger/formatter/clock.
const getLoggers = (
  ctx: Context.Context<any>,
  level: LogLevel
): ReadonlySet<LoggerLike> | undefined | null => {
  const min = ctx.mapUnsafe.get("effect/References/MinimumLogLevel") as
    | string
    | undefined
  if (
    min === "None" || min === "Fatal" || (level === "Warn" && min === "Error")
  ) return null
  return ctx.mapUnsafe.get("effect/Logger/CurrentLoggers") as
    | ReadonlySet<LoggerLike>
    | undefined
}

const writeConsole = (
  ctx: Context.Context<any>,
  level: LogLevel,
  message: string,
  cause: Cause.Cause<unknown>
): void => {
  const out = (ctx.mapUnsafe.get("effect/Console") as Console | undefined) ??
    globalThis.console
  if (level === "Warn") {
    // oxlint-disable-next-line no-console
    out.warn(message)
  } else {
    // oxlint-disable-next-line no-console
    out.error(message, cause)
  }
}

const withLoggers = (
  ctx: Context.Context<any>,
  loggers: ReadonlySet<LoggerLike>,
  level: LogLevel,
  message: string,
  cause: Cause.Cause<unknown>
): Effect.Effect<void> => {
  const clock = ctx.mapUnsafe.get("effect/Clock") as Clock.Clock | undefined
  return Effect.withFiber((fiber) => {
    const date = new Date(
      clock === undefined ? Date.now() : clock.currentTimeMillisUnsafe()
    )
    for (const logger of loggers) {
      logger.log({ cause, fiber, date, logLevel: level, message: [message] })
    }
    return Effect.void
  })
}

const emit = (
  ctx: Context.Context<any>,
  level: LogLevel,
  message: string,
  cause: Cause.Cause<unknown>
): void => {
  const loggers = getLoggers(ctx, level)
  if (loggers === null) return
  if (loggers !== undefined) {
    if (loggers.size > 0) {
      Effect.runFork(
        Effect.provideContext(
          withLoggers(ctx, loggers, level, message, cause),
          ctx
        )
      )
    }
    return
  }
  writeConsole(ctx, level, message, cause)
}

/** @internal */
export const errorEffect = (
  ctx: Context.Context<any>,
  message: string,
  cause: Cause.Cause<unknown>
): Effect.Effect<void> => {
  const loggers = getLoggers(ctx, "Error")
  if (loggers === null) return Effect.void
  if (loggers !== undefined) {
    return loggers.size === 0
      ? Effect.void
      : withLoggers(ctx, loggers, "Error", message, cause)
  }
  return Effect.sync(() => writeConsole(ctx, "Error", message, cause))
}

/** @internal */
export const error = (
  ctx: Context.Context<any>,
  message: string,
  cause: Cause.Cause<unknown>
): void => emit(ctx, "Error", message, cause)

/** @internal */
export const warn = (
  ctx: Context.Context<any>,
  message: string
): void => emit(ctx, "Warn", message, Cause.empty)
