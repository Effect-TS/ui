// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlCommand, HtmlFiles } from "@effect/ui/html"
import { assert, describe, expect, it } from "@effect/vitest"
import { Context, Effect, Fiber, Layer, Schema } from "effect"

const pickers = Effect.acquireRelease(
  Effect.sync(() => {
    const state = { opened: [] as Array<HTMLInputElement>, refuse: false }
    const proto = window.HTMLInputElement.prototype as HTMLInputElement
    proto.showPicker = function(this: HTMLInputElement) {
      if (state.refuse) {
        throw new DOMException("No user activation", "NotAllowedError")
      }
      state.opened.push(this)
    }
    return state
  }),
  () =>
    Effect.sync(() =>
      delete (window.HTMLInputElement.prototype as Partial<HTMLInputElement>)
        .showPicker
    )
)

const choose = (input: HTMLInputElement, files: ReadonlyArray<File>) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

class Chunked extends Blob {
  constructor(readonly chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>) {
    super([...chunks])
  }
  override stream() {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start: (controller) => {
        for (const chunk of this.chunks) controller.enqueue(chunk)
        controller.close()
      }
    })
  }
}

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

describe("HtmlFiles", { concurrent: false }, () => {
  it.effect("reads a Blob's bytes, text and data URL, and a failed read is a FileReadError with its cause", () =>
    Effect.gen(function*() {
      const chunks = [
        new Uint8Array([0x68, 0xc3]),
        new Uint8Array([0xa9, 0x21])
      ]
      assert.deepStrictEqual(
        yield* HtmlFiles.readAsBytes(new Chunked(chunks)),
        new Uint8Array([0x68, 0xc3, 0xa9, 0x21])
      )
      assert.strictEqual(
        yield* HtmlFiles.readAsText(new Chunked(chunks)),
        "hé!"
      )
      assert.strictEqual(
        yield* HtmlFiles.readAsText(
          new Blob([new Uint8Array([0xe9])]),
          "latin1"
        ),
        "é"
      )
      assert.strictEqual(
        yield* HtmlFiles.readAsDataUrl(new Blob(["hi"])),
        "data:application/octet-stream;base64,aGk="
      )
      assert.strictEqual(
        yield* HtmlFiles.readAsDataUrl(
          new Blob(["hi"], { type: "text/plain" })
        ),
        "data:text/plain;base64,aGk="
      )

      const cause = new DOMException("The file changed", "NotReadableError")
      class Changed extends Blob {
        override stream() {
          return new ReadableStream<Uint8Array<ArrayBuffer>>({
            start: (controller) => controller.error(cause)
          })
        }
      }
      const error = yield* Effect.flip(HtmlFiles.readAsText(new Changed()))
      assert.strictEqual(error._tag, "FileReadError")
      assert.strictEqual(error.cause, cause)
    }))

  it.effect("BrowserHost's pick opens a detached file input and reports a choice, a dismissal and a refusal", () =>
    Effect.gen(function*() {
      const picker = yield* pickers
      const context = yield* Layer.build(BrowserHost.layer())
      const pick = (options: HtmlFiles.PickOptions) =>
        HtmlFiles.Files.use((files) => files.pick(options)).pipe(
          Effect.provide(context),
          Effect.forkChild
        )
      const file = new File(["hi"], "notes.txt")

      const chosen = yield* pick({
        accept: ["image/*", ".pdf"],
        multiple: true,
        capture: "environment"
      })
      yield* tick
      const [input] = picker.opened
      expect([
        input.type,
        input.accept,
        input.multiple,
        input.getAttribute("capture"),
        input.isConnected
      ])
        .toEqual(["file", "image/*,.pdf", true, "environment", false])
      choose(input, [file])
      assert.deepStrictEqual(yield* Fiber.join(chosen), {
        opened: true,
        files: [file]
      })

      const dismissed = yield* pick({})
      yield* tick
      picker.opened[1].dispatchEvent(new Event("cancel"))
      assert.deepStrictEqual(yield* Fiber.join(dismissed), {
        opened: true,
        files: []
      })

      picker.refuse = true
      assert.deepStrictEqual(yield* Fiber.join(yield* pick({})), {
        opened: false,
        files: []
      })
    }).pipe(Effect.scoped))

  it.effect("HtmlCommand.showPicker opens a rendered input's picker, whose files arrive in its change", () =>
    Effect.gen(function*() {
      const picker = yield* pickers
      const Attachment = Html.ref("Attachment", "input")
      const Message = UiSchema.TaggedEnum({
        PressedOpen: {},
        ShowedPicker: { found: Schema.Boolean, opened: Schema.Boolean },
        Chose: { files: Schema.Array(Schema.instanceOf(File)) }
      })
      const Attach = Component.define({
        name: "Attach",
        model: Schema.Array(Schema.String),
        message: Message,
        elements: Html
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, message) =>
          Message.match(message, {
            PressedOpen: () =>
              $.run(HtmlCommand.showPicker(Attachment, Message.ShowedPicker)),
            ShowedPicker: (
              { found, opened }
            ) => [...$.model, `found ${found}, opened ${opened}`],
            Chose: ({ files }) => [
              ...$.model,
              `chose ${files.map((file) => file.name).join(", ")}`
            ]
          }),
        view: (h) =>
          h.input.attrs({ type: "file", "aria-label": "Attachment" }).ref(
            Attachment
          ).value("")
            .onChange(({ files }) => Message.Chose({ files }))
      })
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      const root = yield* BrowserHost.mountEffect(Attach, {}, app)
      root.send(Message.PressedOpen())
      yield* tick
      const input = app.querySelector("input")!
      expect(picker.opened).toEqual([input])
      choose(input, [new File(["hi"], "notes.txt")])
      picker.refuse = true
      root.send(Message.PressedOpen())
      yield* tick
      expect(root.model()).toEqual([
        "found true, opened true",
        "chose notes.txt",
        "found true, opened false"
      ])
      expect(input.files!.length).toBe(0)
    }).pipe(Effect.scoped))

  it.effect("without showPicker, HtmlCommand.showPicker falls back to click only on an enabled file input and never submits a form", () =>
    Effect.gen(function*() {
      const Submit = Html.ref("Submit", "input")
      const Attachment = Html.ref("Attachment", "input")
      const Locked = Html.ref("Locked", "input")
      const Message = UiSchema.TaggedEnum({
        OpenSubmit: {},
        OpenFile: {},
        OpenLocked: {},
        ShowedPicker: { found: Schema.Boolean, opened: Schema.Boolean },
        Submitted: {}
      })
      const Form = Component.define({
        name: "Form",
        model: Schema.Array(Schema.String),
        message: Message,
        elements: Html
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, message) =>
          Message.match(message, {
            OpenSubmit: () =>
              $.run(HtmlCommand.showPicker(Submit, Message.ShowedPicker)),
            OpenFile: () =>
              $.run(HtmlCommand.showPicker(Attachment, Message.ShowedPicker)),
            OpenLocked: () =>
              $.run(HtmlCommand.showPicker(Locked, Message.ShowedPicker)),
            ShowedPicker: (
              { found, opened }
            ) => [...$.model, `found ${found}, opened ${opened}`],
            Submitted: () => [...$.model, "submitted"]
          }),
        view: (h) =>
          h.form.onSubmit(Message.Submitted()).children(
            h.input.attr("type", "submit").ref(Submit),
            h.input.attr("type", "file").ref(Attachment),
            h.input.attr("type", "file").disabled(true).ref(Locked)
          )
      })
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      const root = yield* BrowserHost.mountEffect(Form, {}, app)
      let fileClicks = 0
      for (const input of app.querySelectorAll("input[type='file']")) {
        input.addEventListener("click", () => {
          fileClicks++
        })
      }
      root.send(Message.OpenSubmit())
      root.send(Message.OpenFile())
      root.send(Message.OpenLocked())
      yield* tick
      expect(root.model()).toEqual([
        "found true, opened false",
        "found true, opened true",
        "found true, opened false"
      ])
      expect(fileClicks).toBe(1)
    }).pipe(Effect.scoped))

  it.effect("BrowserHost provides a document-bound Files service outside its context and honors overrides", () =>
    Effect.gen(function*() {
      const picker = yield* pickers
      picker.refuse = true
      const Page = Component.define({
        name: "FilesPage",
        props: Schema.Struct({ opened: Schema.Boolean }),
        model: Schema.Boolean,
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.props.opened,
        update: ($) => $.model,
        view: (h, opened) => h.p(String(opened))
      })
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      let acquired: HtmlFiles.Files | undefined
      const readPicked = Effect.gen(function*() {
        const files = yield* HtmlFiles.Files
        acquired = files
        const picked = yield* files.pick({})
        return { opened: picked.opened }
      })
      const root = yield* BrowserHost.mountEffect(Page, readPicked, app)
      assert.strictEqual(root.model(), false)

      assert.deepStrictEqual(
        yield* Effect.race(
          acquired!.pick({}),
          Effect.as(tick, "timeout" as const)
        ),
        { opened: false, files: [] }
      )

      const layerContext = yield* Layer.build(BrowserHost.layer())
      assert.deepStrictEqual(
        yield* Effect.race(
          Context.get(layerContext, HtmlFiles.Files).pick({}),
          Effect.as(tick, "timeout" as const)
        ),
        { opened: false, files: [] }
      )

      const custom = yield* BrowserHost.mountEffect(
        Page,
        readPicked.pipe(
          Effect.provideService(HtmlFiles.Files, {
            pick: () => Effect.succeed({ opened: true, files: [] })
          })
        ),
        app
      )
      assert.strictEqual(custom.model(), true)
    }).pipe(Effect.scoped))
})
