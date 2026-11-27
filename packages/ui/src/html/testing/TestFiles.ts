/**
 * A fake `HtmlFiles.Files` for whole-app tests, so a test decides what the
 * user chooses in each file picker, and sees the files the app downloads,
 * without a document, in Node too.
 *
 * Provide `layer` next to `TestHost.layer()`. Every pick stays pending
 * until `choose` or `dismiss` settles it. Run `TestHost.settle` after it
 * to see the update. `downloads` returns the downloaded files.
 *
 * **Example** (Choosing a file in a whole-app test)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlFiles } from "@effect/ui/html"
 * import { TestFiles } from "@effect/ui/html/testing"
 * import { TestHost } from "@effect/ui/testing"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   ClickedAttach: {},
 *   Picked: { names: Schema.Array(Schema.String) }
 * })
 *
 * const Attach = Html.component({
 *   name: "Attach",
 *   model: Schema.Array(Schema.String),
 *   message: Message
 * }).make({
 *   init: () => [],
 *   update: {
 *     ClickedAttach: ($) =>
 *       $.run(HtmlFiles.pick(({ files }) => Message.Picked({ names: files.map((file) => file.name) }))),
 *     Picked: (_, { names }) => names
 *   },
 *   view: (h, names) => h.button.on("click", Message.ClickedAttach()).children(names.join(", ") || "Attach")
 * })
 *
 * Effect.gen(function*() {
 *   const root = yield* TestHost.mount(Attach, {})
 *   root.send(Message.ClickedAttach())
 *   yield* TestHost.settle
 *   yield* TestFiles.choose([new File(["hi"], "notes.txt")])
 *   yield* TestHost.settle
 *   root.model() // => ["notes.txt"]
 * }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestFiles.layer)), Effect.scoped, Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HtmlFiles from "../HtmlFiles.ts"

/**
 * The `TestFiles` service: the fake's control.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestFiles {
  /** The options of each pending pick, oldest first. */
  readonly pending: () => ReadonlyArray<HtmlFiles.PickOptions>
  /** Settles every pending pick with `picked`. Throws when none is pending. */
  readonly settle: (picked: HtmlFiles.Picked) => void
  /** The files downloaded, oldest first. */
  readonly downloads: () => ReadonlyArray<File>
}

/**
 * The `TestFiles` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestFiles: Context.Service<TestFiles, TestFiles> = Context.Service<
  TestFiles
>(
  "@effect/ui/html/testing/TestFiles"
)

interface Pending {
  readonly options: HtmlFiles.PickOptions
  readonly settle: (picked: HtmlFiles.Picked) => void
}

/**
 * Makes a fake picker and its control. `layer` provides a new one per build.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (): HtmlFiles.Files & TestFiles => {
  const pending = new Set<Pending>()
  const downloads: Array<File> = []
  return {
    pick: (options) =>
      Effect.callback((resume) => {
        const entry: Pending = {
          options,
          settle: (picked) => resume(Effect.succeed(picked))
        }
        pending.add(entry)
        return Effect.sync(() => {
          pending.delete(entry)
        })
      }),
    pending: () => Array.from(pending, (entry) => entry.options),
    settle: (picked) => {
      if (pending.size === 0) throw new Error("TestFiles: no pick is pending")
      const entries = Array.from(pending)
      pending.clear()
      for (const entry of entries) entry.settle(picked)
    },
    download: (file) =>
      Effect.sync(() => {
        downloads.push(file)
      }),
    downloads: () => downloads.slice()
  }
}

/**
 * Provides a fake `HtmlFiles.Files` with its control, `TestFiles`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<TestFiles> = Layer.effectContext(
  Effect.sync(() => {
    const files = make()
    return Context.make(TestFiles, files).pipe(
      Context.add(HtmlFiles.Files, files)
    )
  })
)

/**
 * Settles the pending picks with `files`, as the user choosing them.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const choose = (
  files: ReadonlyArray<File>
): Effect.Effect<void, never, TestFiles> =>
  TestFiles.useSync((control) => control.settle({ opened: true, files }))

/**
 * Settles the pending picks with no files, as the user dismissing the picker.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const dismiss: Effect.Effect<void, never, TestFiles> = TestFiles.useSync(
  (control) => control.settle({ opened: true, files: [] })
)

/**
 * The files the app downloaded, oldest first.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const downloads: Effect.Effect<ReadonlyArray<File>, never, TestFiles> =
  TestFiles.useSync((control) => control.downloads())
