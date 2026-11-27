// @vitest-environment happy-dom
import { Mount, UiSchema } from "@effect/ui"
import { Dialog, Dismissal } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, click, container, popovers, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  ClosedEditor: {},
  RequestedCloseDialog: { reason: Schema.String },
  RequestedDismissEditor: { request: Dismissal.Request }
})

const Config = Schema.Struct({
  refuse: Schema.Boolean,
  insideSelector: Schema.optional(Schema.String),
  reasons: Schema.optional(Schema.Array(Dismissal.Reason))
})
type Config = typeof Config.Type

const Page = Html.component({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    dialog: Schema.Boolean,
    editor: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ dialog: true, editor: true, log: [] }),
  update: {
    ClosedEditor: ($) => ({ ...$.model, editor: false }),
    RequestedCloseDialog: ($, { reason }) => ({
      ...$.model,
      dialog: false,
      log: [...$.model.log, `dialog:${reason}`]
    }),
    RequestedDismissEditor: ($, { request }) => ({
      ...$.model,
      editor: $.props.refuse ? $.model.editor : false,
      log: [
        ...$.model.log,
        `editor:${request.reason}:${request.pointerType}`
      ]
    })
  },
  view: (h, model) =>
    Dialog(h, {
      props: { open: model.dialog, modal: true },
      onEmit: {
        RequestedOpen: () => undefined,
        RequestedClose: ({ reason }) =>
          Message.RequestedCloseDialog({ reason }),
        Settled: () => undefined
      },
      view: (dialog) =>
        h.div(
          dialog.portal(h.dialog)?.children(
            dialog.backdrop(h.div.attr("id", "backdrop")),
            dialog.popup(h.div.attr("id", "popup")).children(
              h.button.attr("id", "anchor").children("Edit"),
              model.editor
                ? h.div.attr("id", "editor").onMount(
                  Dismissal.TrackDismissal({
                    ...(h.props.insideSelector === undefined
                      ? {}
                      : { insideSelector: h.props.insideSelector }),
                    ...(h.props.reasons === undefined
                      ? {}
                      : { reasons: h.props.reasons })
                  }).pipe(
                    Mount.map((request) =>
                      Message.RequestedDismissEditor({ request })
                    )
                  )
                ).children(h.input.attr("id", "editor-input"))
                : null,
              h.button.attr("id", "save").children("Save")
            )
          )
        )
    })
})

const mountPage = Effect.fnUntraced(function*(overrides: Partial<Config> = {}) {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(
    Page,
    { refuse: false, ...overrides },
    app
  )
  yield* tick
  return { log: () => root.model()!.log, send: root.send }
})

const escape = (target: EventTarget = document) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    })
  )

const tab = (shiftKey = false) => {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true
  })
  document.dispatchEvent(event)
  return event.defaultPrevented
}

describe("Dismissal in a document", { concurrent: false }, () => {
  it.effect("Escape reaches only the dismissal layer, including when refused, and reaches the dialog once the layer closes", () =>
    Effect.gen(function*() {
      const { log, send } = yield* mountPage({ refuse: true })
      byId("editor-input").focus()
      escape(byId("editor-input"))
      escape(byId("editor-input"))
      yield* tick
      assert.deepStrictEqual(log(), [
        "editor:escape-key:",
        "editor:escape-key:"
      ])
      send(Message.ClosedEditor())
      yield* tick
      escape(byId("anchor"))
      yield* tick
      assert.deepStrictEqual(log(), [
        "editor:escape-key:",
        "editor:escape-key:",
        "dialog:escape-key"
      ])
    }))

  it.effect("outside press on the backdrop reaches only the dismissal layer with pointerType, while insideSelector counts as inside", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ insideSelector: "#anchor" })
      click(byId("anchor"), "mouse")
      yield* tick
      assert.deepStrictEqual(log(), [])
      click(byId("backdrop"), "mouse")
      yield* tick
      assert.deepStrictEqual(log(), ["editor:outside-press:mouse"])
    }))

  it.effect("Tab still wraps inside a modal dialog while a dismissal layer is open", () =>
    Effect.gen(function*() {
      yield* mountPage({ refuse: true })
      byId("save").focus()
      assert.isTrue(tab())
      assert.strictEqual(document.activeElement?.id, "anchor")
      assert.isTrue(tab(true))
      assert.strictEqual(document.activeElement?.id, "save")
    }))

  it.effect("leaving escape-key out of reasons lets the underlying dialog hear Escape", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({
        refuse: true,
        reasons: ["outside-press"]
      })
      byId("editor-input").focus()
      escape(byId("editor-input"))
      yield* tick
      assert.deepStrictEqual(log(), ["dialog:escape-key"])
    }))
})
