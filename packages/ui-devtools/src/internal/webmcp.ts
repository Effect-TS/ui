import * as Tool from "effect/ai/Tool"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import type * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Tools from "./tools.ts"

interface ModelContextTool {
  readonly name: string
  readonly description: string
  readonly inputSchema?: object | undefined
  readonly annotations?: {
    readonly readOnlyHint?: boolean | undefined
    readonly consequentialHint?: boolean | undefined
    readonly debugging?: boolean | undefined
  } | undefined
  readonly execute: (
    input: unknown,
    client?: { readonly signal?: AbortSignal | undefined }
  ) => Promise<unknown>
}

export interface ModelContext {
  readonly registerTool: (
    tool: ModelContextTool,
    options?: { readonly signal?: AbortSignal | undefined }
  ) => unknown
  readonly waitForToolsUntil?: ((promise: Promise<unknown>) => void) | undefined
}

export const modelContext = (): ModelContext | undefined => {
  const context = (document as { readonly modelContext?: ModelContext })
    .modelContext
  return typeof context?.registerTool === "function" ? context : undefined
}

export const register = Effect.fnUntraced(function*(
  context: ModelContext,
  backend: Tools.Backend
) {
  const toolkit = yield* Tools.Tools.pipe(
    Effect.provide(Tools.handlers(backend))
  )
  const runExit = Effect.runPromiseExitWith(yield* Effect.context<never>())
  const closed = yield* Effect.abortSignal

  const registered = Object.values(toolkit.tools).filter((tool) =>
    tool.name !== "dispatch" || backend.options.dispatch
  ).map(async (tool) => {
    try {
      await context.registerTool({
        name: "effect_ui_" + tool.name,
        description: Tool.getDescription(tool) ?? "",
        inputSchema: Tool.getJsonSchema(tool),
        annotations: {
          debugging: true,
          readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
          consequentialHint: Context.get(tool.annotations, Tool.Destructive)
        },
        execute: async (input, client) => {
          const exit = await runExit(
            toolkit.handle(tool.name, (input ?? {}) as Schema.Json).pipe(
              Effect.flatMap(Stream.runLast)
            ),
            {
              signal: client?.signal === undefined
                ? closed
                : AbortSignal.any([closed, client.signal])
            }
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
          const error = Cause.squash(exit.cause)
          return {
            isError: true,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }, { signal: closed })
    } catch {
      return
    }
  })
  try {
    context.waitForToolsUntil?.(Promise.all(registered))
  } catch {
    return
  }
})
