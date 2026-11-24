import * as Tool from "effect/ai/Tool"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import type * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Tools from "./tools.ts"

export const prefix = "effect_ui_"

interface ModelContextToolAnnotations {
  readonly readOnlyHint?: boolean | undefined
  readonly consequentialHint?: boolean | undefined
  readonly debugging?: boolean | undefined
}

interface ModelContextTool {
  readonly name: string
  readonly description: string
  readonly inputSchema?: object | undefined
  readonly annotations?: ModelContextToolAnnotations | undefined
  readonly execute: (
    input: unknown,
    client?: { readonly signal?: AbortSignal | undefined }
  ) => Promise<unknown>
}

interface ModelContext {
  readonly registerTool: (
    tool: ModelContextTool,
    options?: { readonly signal?: AbortSignal | undefined }
  ) => unknown
  readonly waitForToolsUntil?: ((promise: Promise<unknown>) => void) | undefined
}

const getModelContext = (): ModelContext | undefined => {
  if (typeof document === "undefined") return undefined
  const context = (document as { readonly modelContext?: unknown }).modelContext
  return typeof context === "object" && context !== null &&
      typeof (context as ModelContext).registerTool === "function"
    ? context as ModelContext
    : undefined
}

export const isAvailable = (): boolean => getModelContext() !== undefined

const combineSignals = (
  primary: AbortSignal,
  secondary: AbortSignal | undefined
): { readonly signal: AbortSignal; readonly cleanup: () => void } => {
  if (secondary === undefined) return { signal: primary, cleanup: () => {} }
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([primary, secondary]), cleanup: () => {} }
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (primary.aborted || secondary.aborted) {
    controller.abort()
    return { signal: controller.signal, cleanup: () => {} }
  }
  primary.addEventListener("abort", abort, { once: true })
  secondary.addEventListener("abort", abort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      primary.removeEventListener("abort", abort)
      secondary.removeEventListener("abort", abort)
    }
  }
}

const errorMessage = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return Predicate.hasProperty(error, "message") &&
      typeof error.message === "string"
    ? error.message
    : String(error)
}

export const register = Effect.fnUntraced(function*(backend: Tools.Backend) {
  const modelContext = getModelContext()
  if (modelContext === undefined) return
  const toolkit = yield* Tools.Tools.pipe(
    Effect.provide(Tools.handlers(backend))
  )
  const services = yield* Effect.context<never>()
  const runExit = Effect.runPromiseExitWith(services)
  const controller = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()))

  const registrations: Array<Promise<unknown>> = []
  for (const tool of Object.values(toolkit.tools)) {
    if (tool.name === "dispatch" && !backend.options.dispatch) continue
    const readOnly = Context.get(tool.annotations, Tool.Readonly)
    const destructive = Context.get(tool.annotations, Tool.Destructive)
    const definition: ModelContextTool = {
      name: prefix + tool.name,
      description: tool.description ?? "",
      inputSchema: Tool.getJsonSchema(tool),
      annotations: {
        debugging: true,
        readOnlyHint: readOnly,
        ...(destructive ? { consequentialHint: true } : undefined)
      },
      execute: async (input, client) => {
        const { cleanup, signal } = combineSignals(
          controller.signal,
          client?.signal
        )
        try {
          const exit = await runExit(
            toolkit.handle(
              tool.name,
              (input ?? {}) as Schema.Json
            ).pipe(Effect.flatMap(Stream.runLast)),
            { signal }
          )
          if (Exit.isSuccess(exit)) {
            return Option.isSome(exit.value)
              ? (exit.value.value.result as { readonly result: unknown }).result
              : undefined
          }
          if (Cause.hasInterruptsOnly(exit.cause)) {
            throw new DOMException("The operation was aborted.", "AbortError")
          }
          // Chromium replaces rejected execute errors with a generic
          // UnknownError, so return tool and validation failures in the payload.
          return { isError: true, error: errorMessage(exit.cause) }
        } finally {
          cleanup()
        }
      }
    }
    try {
      registrations.push(
        Promise.resolve(
          modelContext.registerTool(definition, { signal: controller.signal })
        ).catch(() => {})
      )
    } catch {
      continue
    }
  }
  if (typeof modelContext.waitForToolsUntil === "function") {
    try {
      modelContext.waitForToolsUntil(Promise.all(registrations))
    } catch {
      return
    }
  }
})
