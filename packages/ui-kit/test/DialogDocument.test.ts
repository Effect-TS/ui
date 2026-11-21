// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Dialog, DialogTrigger } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, popovers, press, tick } from "./utils/document.ts"

// The dialog's document work, in a DOM: what a press, a focus move or a
// close does once the dialog shows.

const OpenMethod = Schema.NullOr(Schema.Literals(["mouse", "touch", "pen", "keyboard"]))

const Message = UiSchema.TaggedEnum({
  Opened: { which: Schema.String, triggerId: Schema.NullOr(Schema.String), method: OpenMethod },
  Dismissed: { which: Schema.String, reason: Schema.String },
  Settled: { which: Schema.String, open: Schema.Boolean }
})

const Config = Schema.Struct({
  modal: Schema.Union([Schema.Boolean, Schema.Literal("trap-focus")]),
  a: Schema.Boolean,
  b: Schema.Boolean,
  // Two sibling dialogs, a second one drawn after the first.
  siblings: Schema.Boolean,
  // Two triggers, and the dialog open for one of them.
  triggers: Schema.Boolean,
  detached: Schema.Boolean,
  marked: Schema.Boolean,
  finalFocus: Schema.optional(Schema.Boolean),
  openMethod: OpenMethod,
  refuse: Schema.Boolean
})
type Config = typeof Config.Type

const config = (overrides: Partial<Config>): Config => ({
  modal: true,
  a: true,
  b: false,
  siblings: false,
  triggers: false,
  detached: false,
  marked: false,
  openMethod: null,
  refuse: false,
  ...overrides
})

const Page = Component.define({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    config: Config,
    a: Schema.Boolean,
    b: Schema.Boolean,
    triggerId: Schema.NullOr(Schema.String),
    method: OpenMethod,
    log: Schema.Array(Schema.String)
  }),
  message: Message,
  elements: Html
}).make({
  init: ($) => ({
    config: $.props,
    a: $.props.a,
    b: $.props.b,
    triggerId: $.props.triggers ? "ta" : null,
    method: null,
    log: []
  }),
  update: {
    Opened: (model, { method, triggerId, which }) => ({
      ...model,
      [which]: true,
      triggerId,
      method,
      log: [...model.log, `Opened ${which} ${triggerId} ${method}`]
    }),
    Dismissed: (model, { reason, which }) => ({
      ...model,
      [which]: model.config.refuse ? model[which as "a" | "b"] : false,
      log: [...model.log, `Dismissed ${which} ${reason}`]
    }),
    Settled: (model, { open, which }) => ({ ...model, log: [...model.log, `Settled ${which} ${open}`] })
  },
  view: (model, h) => {
    const props = model.config
    const on = (which: string) => ({
      Opened: ({ triggerId }: { readonly triggerId: string | null }) =>
        Message.Opened({ which, triggerId, method: null }),
      Dismissed: ({ reason }: { readonly reason: string }) => Message.Dismissed({ which, reason }),
      Settled: ({ open }: { readonly open: boolean }) => Message.Settled({ which, open })
    })
    return h.div(
      h.button.attr("id", "page").children("Page"),
      props.detached
        ? DialogTrigger(h, {
          element: h.button.attr("id", "detached"),
          props: { open: model.a, popupId: "settings" },
          onPress: ({ method, triggerId }) => Message.Opened({ which: "a", triggerId, method })
        }).children("Settings")
        : null,
      Dialog(h, {
        key: "a",
        props: {
          open: model.a,
          modal: props.modal,
          id: props.detached ? "settings" : undefined,
          triggerId: model.triggerId,
          finalFocus: props.finalFocus,
          openMethod: props.openMethod ?? model.method
        },
        onEmit: on("a"),
        view: (s) =>
          h.div(
            props.triggers
              ? h.div(
                s.trigger(h.button.attr("id", "ta")).children("A"),
                s.trigger(h.button.attr("id", "tb")).children("B")
              )
              : props.detached
              ? null
              : s.trigger(h.button.attr("id", "trigger")).children("Open"),
            s.portal(h.dialog)?.children(
              s.popup(h.div.attr("class", "popup-a")).children(
                h.input.attr("id", "first"),
                props.marked ? s.initialFocus(h.input.attr("id", "second")) : h.input.attr("id", "second"),
                props.siblings
                  ? h.button.attr("id", "open-b").onClick(Message.Opened({ which: "b", triggerId: null, method: null }))
                    .children("Open B")
                  : null
              )
            )
          )
      }),
      props.siblings
        ? Dialog(h, {
          key: "b",
          props: { open: model.b, modal: props.modal },
          onEmit: on("b"),
          view: (s) =>
            h.div(
              s.trigger(h.button.attr("id", "trigger-b")).children("B"),
              s.portal(h.dialog)?.children(s.popup(h.div).children(h.input.attr("id", "b-field")))
            )
        })
        : null
    )
  }
})

const mountPage = Effect.fnUntraced(function*(overrides: Partial<Config>) {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, config(overrides), app)
  yield* tick
  return { app, log: () => root.model()!.log }
})

const dismissals = (log: ReadonlyArray<string>) => log.filter((line) => line.startsWith("Dismissed"))
const opens = (log: ReadonlyArray<string>) => log.filter((line) => line.startsWith("Opened"))

// The tests share one document, and move focus.
describe("Dialog in a document", { concurrent: false }, () => {
  it.effect("a press inside the upper of two sibling dialogs is no press outside the lower one", () =>
    Effect.gen(function*() {
      for (const modal of [true, "trap-focus"] as const) {
        yield* Effect.scoped(Effect.gen(function*() {
          const { log } = yield* mountPage({ modal, siblings: true, b: true })
          press(byId("b-field"))
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [], String(modal))
          // A press outside both is the upper dialog's alone.
          press(byId("page"))
          yield* tick
          assert.deepStrictEqual(dismissals(log()), ["Dismissed b outside-press"], String(modal))
        }))
      }
    }))

  it.effect("a dialog that isn't a modal takes no sibling's focus handoff as focus leaving it, but the user's", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ modal: false, siblings: true })
      // A button in A opens B, and B takes focus as it shows.
      byId("open-b").click()
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      assert.strictEqual(document.activeElement?.id, "b-field")
      // One Escape closes B, which gives focus back to its trigger, outside A.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["Dismissed b escape-key"])
      assert.strictEqual(document.activeElement?.id, "trigger-b")
      assert.strictEqual(app.querySelectorAll("dialog").length, 1)
      // Focus the user moves out of A still closes it.
      byId("page").focus()
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["Dismissed b escape-key", "Dismissed a focus-out"])
    }))

  it.effect("of two dialogs open from the start, the upper one takes focus, and neither closes", () =>
    Effect.gen(function*() {
      const focused: Array<string> = []
      const record = (event: FocusEvent) => focused.push((event.target as Element).id)
      document.addEventListener("focusin", record)
      yield* Effect.addFinalizer(() => Effect.sync(() => document.removeEventListener("focusin", record)))
      const { log } = yield* mountPage({ modal: false, siblings: true, b: true })
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      assert.strictEqual(document.activeElement?.id, "b-field")
      // The lower one doesn't take focus after the browser gave it to the upper one.
      assert.notInclude(focused.slice(focused.indexOf("b-field")), "first")
    }))

  it.effect("a press on another of the dialog's triggers is no press outside, and focus goes back to the latest", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ modal: false, triggers: true })
      press(byId("tb"))
      byId("tb").click()
      yield* tick
      assert.deepStrictEqual(opens(log()), ["Opened a tb null"])
      assert.deepStrictEqual(dismissals(log()), [])
      byId("first").focus()
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "tb")
    }))

  it.effect("a touch-opened dialog honors marked initial focus and can skip return focus", () =>
    Effect.gen(function*() {
      const { app } = yield* mountPage({ openMethod: "touch", marked: true, finalFocus: false })
      assert.strictEqual(document.activeElement?.id, "second")
      app.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }))
      yield* tick
      yield* tick
      assert.isNull(app.querySelector("dialog"))
      assert.strictEqual(document.activeElement, document.body)
    }))

  it.effect("a close the browser forces after a refused Escape is one request, and focus stays where it was", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ refuse: true })
      const dialog = app.querySelector("dialog")!
      byId("second").focus()
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["Dismissed a escape-key"])
      assert.isTrue(dialog.open)
      // The browser won't let the next one be cancelled, and closes the dialog.
      dialog.dispatchEvent(new Event("cancel", { cancelable: false }))
      HTMLDialogElement.prototype.close.call(dialog)
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["Dismissed a escape-key", "Dismissed a escape-key"])
      assert.isTrue(dialog.open)
      assert.strictEqual(document.activeElement?.id, "second")
    }))

  it.effect("a looping animation inside the dialog doesn't hold its close", () =>
    Effect.gen(function*() {
      const looping = {
        effect: { getComputedTiming: () => ({ endTime: Infinity }) },
        finished: new Promise(() => {})
      }
      const original = Element.prototype.getAnimations
      Element.prototype.getAnimations = () => [looping as unknown as Animation]
      yield* Effect.addFinalizer(() => Effect.sync(() => (Element.prototype.getAnimations = original)))
      const { app, log } = yield* mountPage({ modal: false })
      byId("page").focus()
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["Dismissed a focus-out"])
      assert.isNull(app.querySelector("dialog"))
      assert.include(log(), "Settled a false")
    }))

  it.effect("a detached trigger reports how it was pressed, points at the dialog, and gets focus back", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ modal: false, detached: true, a: false })
      const trigger = byId("detached")
      assert.isNull(trigger.getAttribute("aria-controls"))
      press(trigger, "touch")
      trigger.dispatchEvent(new PointerEvent("click", { bubbles: true, detail: 1, pointerType: "touch" }))
      yield* tick
      yield* tick
      assert.deepStrictEqual(opens(log()), ["Opened a detached touch"])
      assert.strictEqual(trigger.getAttribute("aria-controls"), "settings")
      assert.strictEqual(document.querySelector("dialog")?.id, "settings")
      assert.strictEqual(document.activeElement, document.querySelector(".popup-a"))
      press(trigger)
      yield* tick
      // A press on the trigger is the trigger's, not one outside.
      assert.deepStrictEqual(dismissals(log()), [])
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["Dismissed a escape-key"])
      assert.strictEqual(document.activeElement?.id, "detached")
    }))
})
