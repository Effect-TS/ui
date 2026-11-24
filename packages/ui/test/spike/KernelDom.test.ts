// @vitest-environment happy-dom
import { Component, Head, Mount, UiSchema } from "@effect/ui"
import { Html, HtmlCommand, HtmlHead } from "@effect/ui/html"
import * as KernelDom from "@effect/ui/html/KernelDom"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const frame = Effect.promise(() =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  )
)

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (app) => Effect.sync(() => app.remove())
)

const input = (field: HTMLInputElement, value: string, caret: number) => {
  field.value = value
  field.setSelectionRange(caret, caret)
  field.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" })
  )
}

describe("KernelDom", () => {
  it.effect("gives a handler its event's typed payload", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        Typed: { value: Schema.String },
        Clicked: { button: Schema.Number, shift: Schema.Boolean }
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
            Typed: ({ value }) => [...$.model, `typed ${value}`],
            Clicked: (
              { button, shift }
            ) => [...$.model, `clicked ${button} ${shift}`]
          }),
        view: (h) =>
          h.div(
            h.input.onInput(({ value }) => Message.Typed({ value })),
            h.button.onClick(({ button, shift }) =>
              Message.Clicked({ button, shift })
            ).children("go")
          )
      })
      const app = yield* container
      const root = yield* KernelDom.mountEffect(Form, {}, app)
      input(app.querySelector("input")!, "hi", 2)
      app.querySelector("button")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, shiftKey: true })
      )
      yield* Effect.yieldNow
      assert.deepStrictEqual(root.model(), ["typed hi", "clicked 0 true"])
    }).pipe(Effect.scoped))

  it.effect("puts back a controlled value the Model didn't follow, keeping a focused field's caret", () =>
    Effect.gen(function*() {
      const Fixed = Component.define({
        name: "Fixed",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.input.value("123456").onInput(() => undefined)
      })
      const app = yield* container
      yield* KernelDom.mountEffect(Fixed, {}, app)
      const field = app.querySelector("input")!
      field.focus()
      input(field, "123a456", 4)
      yield* frame
      assert.deepStrictEqual([
        field.value,
        field.selectionStart,
        field.selectionEnd
      ], ["123456", 3, 3])
    }).pipe(Effect.scoped))

  it.effect("writes attributes under their HTML names, keeps SVG's case, and owns a form's submission", () =>
    Effect.gen(function*() {
      const Shapes = Component.define({
        name: "Shapes",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.form(
            h.el("div").attrs({ "Data-Kind": "box", "a b": "dropped" }),
            h.el("svg", h.el("rect").attr("viewBox", "0 0 1 1"))
          )
      })
      const app = yield* container
      yield* KernelDom.mountEffect(Shapes, {}, app)
      assert.deepStrictEqual(
        Array.from(app.querySelector("div")!.attributes, (attr) => attr.name),
        ["data-kind"]
      )
      const rect = app.querySelector("rect")!
      assert.strictEqual(rect.namespaceURI, "http://www.w3.org/2000/svg")
      assert.strictEqual(rect.getAttribute("viewBox"), "0 0 1 1")
      const submit = new Event("submit", { bubbles: true, cancelable: true })
      app.querySelector("form")!.dispatchEvent(submit)
      assert.isTrue(submit.defaultPrevented)
    }).pipe(Effect.scoped))

  it.effect("runs a mount on its element, and a ref Command reaches it with the layer", () =>
    Effect.gen(function*() {
      const Field = Html.ref("Field", "input")
      const Message = UiSchema.TaggedEnum({
        Focus: {},
        Found: { found: Schema.Boolean },
        Mounted: { tag: Schema.String }
      })
      const ReadTag = Mount.make(
        "ReadTag",
        { args: {} },
        (element: HTMLElement) => Effect.succeed(element.localName)
      )
      const Refs = Component.define({
        name: "Refs",
        model: Schema.Array(Schema.String),
        message: Message,
        elements: Html
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, message) =>
          Message.match(message, {
            Focus: () =>
              $.run(
                HtmlCommand.focus(
                  Field,
                  ({ found }) => Message.Found({ found })
                )
              ),
            Found: ({ found }) => [...$.model, `found ${found}`],
            Mounted: ({ tag }) => [...$.model, `mounted ${tag}`]
          }),
        view: (h) =>
          h.input.ref(Field).onMount(
            ReadTag().pipe(Mount.map((tag) => Message.Mounted({ tag })))
          )
      })
      const app = yield* container
      const root = yield* KernelDom.mountEffect(Refs, {}, app).pipe(
        Effect.provide(KernelDom.layer())
      )
      yield* frame
      root.send(Message.Focus())
      yield* frame
      assert.strictEqual(document.activeElement, app.querySelector("input"))
      assert.deepStrictEqual(root.model(), ["mounted input", "found true"])
    }).pipe(Effect.scoped))

  const Titled = Component.define({
    name: "Titled",
    model: Schema.Null,
    message: Schema.Never,
    elements: HtmlHead.vocabulary
  }).make({
    init: () => null,
    update: ($) => $.model,
    head: () => [
      Head.title("Kernel"),
      HtmlHead.meta({ name: "description", content: "on the kernel" })
    ],
    view: (h) => h.p("titled")
  })

  it.effect("writes the folded head with syncHead, and leaves the head alone without it", () =>
    Effect.gen(function*() {
      document.title = "Shell"
      const description = () =>
        document.head.querySelector("meta[name=description]")?.getAttribute(
          "content"
        )
      yield* Effect.scoped(Effect.gen(function*() {
        yield* KernelDom.mountEffect(Titled, {}, yield* container)
        yield* frame
        assert.strictEqual(document.title, "Shell")
        assert.isUndefined(description())
      }))
      yield* Effect.scoped(Effect.gen(function*() {
        yield* KernelDom.mountEffect(Titled, {}, yield* container, {
          head: KernelDom.syncHead
        })
        yield* frame
        assert.strictEqual(document.title, "Kernel")
        assert.strictEqual(description(), "on the kernel")
      }))
      assert.strictEqual(document.title, "Shell")
      assert.isUndefined(description())
    }))

  it.effect("runs an update that asks for a view transition in one, with its types", () =>
    Effect.gen(function*() {
      const started: Array<ReadonlyArray<string>> = []
      const doc = document as any
      const win = window as any
      win.ViewTransition = class {
        get types() {
          return new Set()
        }
      }
      doc.startViewTransition = (
        update: (() => void) | { update: () => void; types: Array<string> }
      ) => {
        started.push(typeof update === "function" ? [] : update.types)
        ;(typeof update === "function" ? update : update.update)()
        const done = Promise.resolve()
        return {
          ready: done,
          finished: done,
          updateCallbackDone: done,
          skipTransition: () => {}
        }
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          delete doc.startViewTransition
          delete win.ViewTransition
        })
      )
      const Message = UiSchema.TaggedEnum({ Swap: {}, Plain: {} })
      const Swap = Component.define({
        name: "Swap",
        model: Schema.Number,
        message: Message,
        elements: Html
      }).make({
        init: () => 0,
        update: {
          Swap: ($) => $.set($.model + 1).viewTransition(["swap"]),
          Plain: ($) => $.model + 1
        },
        view: (h, count) => h.p(String(count))
      })
      for (const viewTransitions of [true, false]) {
        const app = yield* container
        const root = yield* KernelDom.mountEffect(Swap, {}, app, {
          viewTransitions
        })
        root.send(Message.Swap())
        root.send(Message.Plain())
        yield* frame
        assert.strictEqual(app.textContent, "2")
      }
      assert.deepStrictEqual(started, [["swap"]])
    }).pipe(Effect.scoped))
})
