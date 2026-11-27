// @vitest-environment happy-dom
import { Mount, UiSchema } from "@effect/ui"
import { Dialog, Dismissal } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"
import {
  byId,
  click,
  container,
  popovers,
  press,
  tick
} from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  ClosedEditor: {},
  RequestedCloseDialog: { reason: Schema.String },
  RequestedDismissEditor: { request: Dismissal.Request }
})

const Config = Schema.Struct({
  refuse: Schema.Boolean,
  modal: Schema.optional(Schema.Boolean),
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
      props: { open: model.dialog, modal: h.props.modal ?? true },
      onEmit: {
        RequestedOpen: () => undefined,
        RequestedClose: ({ reason }) =>
          Message.RequestedCloseDialog({ reason }),
        Settled: () => undefined
      },
      view: (dialog) =>
        h.div(
          h.button.attr("id", "outside").children("Outside"),
          dialog.portal(h.dialog)?.children(
            dialog.backdrop(h.div.attr("id", "backdrop")),
            dialog.popup(h.div.attr("id", "popup")).children(
              h.button.attr("id", "anchor").children("Edit"),
              h.label.attr("for", "name").attr("id", "name-label").children(
                "Name"
              ),
              h.input.attr("id", "name"),
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

const AboveMessage = UiSchema.TaggedEnum({
  OpenedDialog: {},
  RequestedCloseDialog: { reason: Schema.String },
  RequestedDismissEditor: { request: Dismissal.Request }
})

// A layer with a dialog opened above it, which ignores presses outside.
const Above = Html.component({
  name: "Above",
  model: Schema.Struct({
    dialog: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: AboveMessage
}).make({
  init: () => ({ dialog: false, log: [] }),
  update: {
    OpenedDialog: ($) => ({ ...$.model, dialog: true }),
    RequestedCloseDialog: ($, { reason }) => ({
      dialog: false,
      log: [...$.model.log, `dialog:${reason}`]
    }),
    RequestedDismissEditor: ($, { request }) => ({
      ...$.model,
      log: [...$.model.log, `editor:${request.reason}`]
    })
  },
  view: (h, model) =>
    h.div(
      h.div.attr("id", "editor").onMount(
        Dismissal.TrackDismissal().pipe(
          Mount.map((request) =>
            AboveMessage.RequestedDismissEditor({ request })
          )
        )
      ),
      Dialog(h, {
        props: { open: model.dialog, disablePointerDismissal: true },
        onEmit: {
          RequestedOpen: () => undefined,
          RequestedClose: ({ reason }) =>
            AboveMessage.RequestedCloseDialog({ reason }),
          Settled: () => undefined
        },
        view: (dialog) =>
          h.div(
            dialog.portal(h.dialog)?.children(
              dialog.backdrop(h.div.attr("id", "backdrop")),
              dialog.popup(h.div).children(h.button.children("OK"))
            )
          )
      })
    )
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
      const { log } = yield* mountPage({
        refuse: true,
        insideSelector: "#anchor"
      })
      click(byId("anchor"), "mouse")
      yield* tick
      assert.deepStrictEqual(log(), [])
      click(byId("backdrop"), "mouse")
      yield* tick
      assert.deepStrictEqual(log(), ["editor:outside-press:mouse"])
      // A label forwards the tap's click to its field: still one press.
      click(byId("name-label"), "touch")
      yield* tick
      assert.deepStrictEqual(log(), [
        "editor:outside-press:mouse",
        "editor:outside-press:touch"
      ])
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

  it.effect("focus leaving the layer asks with focus-out, unless a press outside already asked", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ refuse: true })
      const save = byId("save")
      press(save)
      save.focus()
      save.dispatchEvent(
        new PointerEvent("click", { bubbles: true, detail: 1 })
      )
      yield* tick
      assert.deepStrictEqual(log(), ["editor:outside-press:mouse"])
      byId("anchor").focus()
      yield* tick
      assert.deepStrictEqual(log(), [
        "editor:outside-press:mouse",
        "editor:focus-out:"
      ])
      // A cancelled tap, as for a scroll, doesn't pair with a later focus change.
      press(save, "touch")
      save.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }))
      save.focus()
      yield* tick
      assert.deepStrictEqual(log(), [
        "editor:outside-press:mouse",
        "editor:focus-out:",
        "editor:focus-out:"
      ])
    }))

  it.effect("a press the layer takes doesn't also close a non-modal dialog when it moves focus, after the layer closes", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ modal: false })
      const outside = byId("outside")
      press(outside)
      yield* tick
      outside.focus()
      outside.dispatchEvent(
        new PointerEvent("click", { bubbles: true, detail: 1 })
      )
      yield* tick
      assert.deepStrictEqual(log(), ["editor:outside-press:mouse"])
    }))

  it.effect("a dialog above a layer takes the reasons it ignores, so the layer doesn't hear them", () =>
    Effect.gen(function*() {
      yield* popovers
      const app = yield* container
      const root = yield* BrowserHost.mountEffect(Above, {}, app)
      yield* tick
      root.send(AboveMessage.OpenedDialog())
      yield* tick
      click(byId("backdrop"), "mouse")
      escape()
      yield* tick
      assert.deepStrictEqual(root.model()!.log, ["dialog:escape-key"])
    }))

  it.effect("inside an open shadow root, the layer and its insideSelector stay inside, and another element there is outside", () =>
    Effect.gen(function*() {
      const app = yield* container
      const host = app.appendChild(document.createElement("div"))
      const root = host.attachShadow({ mode: "open" })
      root.innerHTML =
        "<div id=\"editor\"><input id=\"field\"></div><button id=\"anchor\"></button><button id=\"other\"></button>"
      // happy-dom doesn't retarget, so the document sees the host as a browser does.
      const send = (id: string, event: Event) => {
        Object.defineProperty(event, "target", { get: () => host })
        root.getElementById(id)!.dispatchEvent(event)
      }
      const tap = (id: string, pointerType: string) => {
        const init = { bubbles: true, composed: true, pointerType }
        send(id, new PointerEvent("pointerdown", { ...init, isPrimary: true }))
        send(id, new PointerEvent("click", { ...init, detail: 1 }))
      }
      const log: Array<string> = []
      yield* Effect.forkScoped(
        Stream.runForEach(
          Dismissal.trackDismissal(root.getElementById("editor")!, {
            insideSelector: "#anchor"
          }),
          ({ pointerType, reason }) =>
            Effect.sync(() => log.push(`${reason}:${pointerType}`))
        )
      )
      yield* tick
      send(
        "field",
        new FocusEvent("focusin", { bubbles: true, composed: true })
      )
      tap("field", "mouse")
      tap("anchor", "touch")
      yield* tick
      assert.deepStrictEqual(log, [])
      tap("other", "touch")
      yield* tick
      assert.deepStrictEqual(log, ["outside-press:touch"])
    }))
})
