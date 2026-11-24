// @vitest-environment happy-dom
import { Command, Component, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { afterEach, assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer, Schema, Scope } from "effect"
import { play } from "./fixtures/TwoEditors.ts"

const wait = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
const token = "tok_live_9f2c"

interface FakeTool {
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

const installModelContext = () => {
  const tools = new Map<string, FakeTool>()
  const waited: Array<Promise<unknown>> = []
  const modelContext = {
    registerTool: (
      tool: FakeTool,
      options?: { readonly signal?: AbortSignal | undefined }
    ) => {
      if (options?.signal?.aborted) return Promise.resolve()
      tools.set(tool.name, tool)
      options?.signal?.addEventListener("abort", () => {
        if (tools.get(tool.name) === tool) tools.delete(tool.name)
      }, { once: true })
      return Promise.resolve()
    },
    waitForToolsUntil: (promise: Promise<unknown>) => {
      waited.push(promise)
    }
  }
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: modelContext
  })
  const call = <A = any>(
    name: string,
    input?: unknown,
    client?: { readonly signal?: AbortSignal | undefined }
  ): Effect.Effect<A> =>
    Effect.promise(() => {
      const tool = tools.get(name)
      if (tool === undefined) {
        return Promise.reject(new Error("Missing tool " + name))
      }
      return tool.execute(input, client) as Promise<A>
    })
  return { tools, waited, call }
}

const clearModelContext = () => {
  delete (document as { modelContext?: unknown }).modelContext
}

const overlay = () =>
  document.querySelector<HTMLIFrameElement>("iframe[data-effect-ui-devtools]")!
    .contentDocument!.body

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim()

describe("DevTools WebMCP", { concurrent: false }, () => {
  afterEach(() => {
    clearModelContext()
    localStorage.clear()
  })

  it.live(
    "registers page tools, reads redacted historical state, shares pause, and unregisters on close",
    () =>
      Effect.gen(function*() {
        const mc = installModelContext()
        const scope = yield* Scope.make()
        const services = yield* Layer.build(DevTools.layer()).pipe(
          Scope.provide(scope)
        )
        const app = yield* play("interrupted").pipe(
          Effect.provide(services),
          Scope.provide(scope)
        )
        yield* wait(20)

        assert.strictEqual(mc.waited.length, 1)
        yield* Effect.promise(() => mc.waited[0]!)
        assert.deepStrictEqual(Array.from(mc.tools.keys()), [
          "effect_ui_list_sessions",
          "effect_ui_list_instances",
          "effect_ui_list_entries",
          "effect_ui_count_entries",
          "effect_ui_get_entry",
          "effect_ui_get_chain",
          "effect_ui_get_state",
          "effect_ui_diff_state",
          "effect_ui_show_entry",
          "effect_ui_resume",
          "effect_ui_get_message_schema",
          "effect_ui_wait"
        ])
        for (const tool of mc.tools.values()) {
          assert.isTrue(tool.annotations?.debugging, tool.name)
          assert.isDefined(tool.inputSchema, tool.name)
        }
        assert.isTrue(
          mc.tools.get("effect_ui_get_state")?.annotations?.readOnlyHint
        )
        assert.isFalse(
          mc.tools.get("effect_ui_show_entry")?.annotations?.readOnlyHint
        )

        const [session] = yield* mc.call("effect_ui_list_sessions")
        assert.strictEqual(session.app, "Workspace")
        assert.strictEqual(session.host, "browser")
        assert.isTrue(session.connected)
        assert.isTrue(session.controllable)

        const instances: ReadonlyArray<any> = yield* mc.call(
          "effect_ui_list_instances"
        )
        const n2 = instances.find((instance) =>
          instance.path === "/Workspace/Editor[n2]"
        )
        const { rows } = yield* mc.call("effect_ui_list_entries", {
          instance: n2.instance,
          filter: "messages"
        })
        const draft = rows.find((row: any) => row.label === "UpdatedDraft")
        const save = rows.find((row: any) => row.label === "ClickedSave")
        assert.isDefined(draft)
        assert.isDefined(save)

        const historical = yield* mc.call("effect_ui_get_state", {
          instance: n2.instance,
          at: save.seq
        })
        assert.strictEqual(historical.model.status, "Saving")
        assert.deepStrictEqual(historical.props.token, { "~redacted": true })
        assert.notInclude(JSON.stringify(historical), token)

        const diff = yield* mc.call("effect_ui_diff_state", {
          seq: save.seq,
          from: draft.seq
        })
        assert.deepInclude(diff.changes, {
          path: ["status"],
          kind: "changed",
          before: "Dirty",
          after: "Saving"
        })
        assert.notInclude(JSON.stringify(diff), token)

        const shown = yield* mc.call("effect_ui_show_entry", { seq: save.seq })
        assert.strictEqual(shown.paused, save.seq)
        assert.strictEqual(app.style.display, "none")
        yield* wait(20)
        assert.strictEqual(
          text(overlay().querySelector(".paused-label")),
          "Paused at #" + save.seq
        )
        const resumed = yield* mc.call("effect_ui_resume")
        assert.deepStrictEqual(resumed, { resumed: true })
        assert.notStrictEqual(app.style.display, "none")

        const bad = yield* mc.call("effect_ui_get_entry", { seq: "bad" })
        assert.isTrue(bad.isError)
        assert.isString(bad.error)

        yield* Scope.close(scope, Exit.void)
        assert.strictEqual(mc.tools.size, 0)
      })
  )

  it.live(
    "gates dispatch behind webMcp options, skips waiting on excluded dispatches, cancels wait, and respects webMcp: false",
    () =>
      Effect.gen(function*() {
        const mc = installModelContext()
        yield* Effect.scoped(Layer.build(DevTools.layer({ webMcp: false })))
        assert.strictEqual(mc.tools.size, 0)

        class Slow extends Command.Service<Slow>()(
          "test/Slow",
          { args: {} },
          Effect.succeed(() => Effect.never)
        ) {}
        const Message = UiSchema.TaggedEnum({
          Move: { x: Schema.Number },
          Start: {}
        })
        const Widget = Component.define({
          name: "Widget",
          model: Schema.Struct({ x: Schema.Number }),
          message: Message,
          elements: Html
        }).make({
          init: () => ({ x: 0 }),
          update: {
            Move: ($, { x }) => $.evolve({ x }),
            Start: ($) => $.run(Slow.make({}))
          },
          view: (h, model) => h.output.children(String(model.x))
        }).pipe(
          Component.provide(Slow.layer)
        )

        yield* Effect.scoped(Effect.gen(function*() {
          const services = yield* Layer.build(
            DevTools.layer({
              exclude: ["Move"],
              webMcp: { dispatch: true }
            })
          )
          const app = document.body.appendChild(document.createElement("div"))
          yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
          yield* BrowserHost.mountEffect(Widget, {}, app).pipe(
            Effect.provide(services)
          )
          yield* wait(20)

          assert.strictEqual(mc.tools.size, 13)
          assert.isTrue(
            mc.tools.get("effect_ui_dispatch")?.annotations?.consequentialHint
          )
          const [widget] = yield* mc.call("effect_ui_list_instances")

          const startedAt = Date.now()
          const excluded = yield* mc.call("effect_ui_dispatch", {
            instance: widget.instance,
            messages: [
              { _tag: "Move", x: 1 },
              { _tag: "Move", x: 7 }
            ]
          })
          assert.isBelow(Date.now() - startedAt, 1_000)
          assert.strictEqual(excluded.applied, 2)
          assert.deepStrictEqual(excluded.unavailable, [{
            seq: excluded.outcomes[0].seq,
            reason: "excluded"
          }])
          const state = yield* mc.call("effect_ui_get_state", {
            instance: widget.instance,
            at: excluded.outcomes[1].seq
          })
          assert.strictEqual(state.model.x, 7)

          yield* mc.call("effect_ui_dispatch", {
            instance: widget.instance,
            messages: [{ _tag: "Start" }]
          })
          const abort = new AbortController()
          const pending = mc.tools.get("effect_ui_wait")!.execute(
            { instance: widget.instance, timeout: 10_000 },
            { signal: abort.signal }
          )
          yield* wait(20)
          const cancelAt = Date.now()
          abort.abort()
          const error = yield* Effect.promise(() =>
            pending.then(() => undefined, (err) => err)
          )
          assert.isDefined(error)
          assert.strictEqual((error as DOMException).name, "AbortError")
          assert.isBelow(Date.now() - cancelAt, 1_000)
        }))
        assert.strictEqual(mc.tools.size, 0)
      })
  )
})
