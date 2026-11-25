// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Dialog, DialogTrigger, ToastProvider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  byId,
  click,
  container,
  focusability,
  focusVisibility,
  holdExits,
  popovers,
  press,
  tick
} from "./utils/document.ts"

// The dialog's document work, in a DOM: what a press, a focus move or a
// close does once the dialog shows.

const OpenMethod = Schema.NullOr(
  Schema.Literals(["mouse", "touch", "pen", "keyboard"])
)

const Message = UiSchema.TaggedEnum({
  Closed: {},
  Switched: {},
  ShowedToasts: {},
  AddedControl: {},
  AllowedFocus: {},
  Removed: {},
  RequestedOpen: {
    which: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    method: OpenMethod
  },
  RequestedClose: { which: Schema.String, reason: Schema.String },
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
  keepMounted: Schema.optional(Schema.Boolean),
  finalFocus: Schema.optional(Schema.Boolean),
  openMethod: OpenMethod,
  refuse: Schema.Boolean,
  toast: Schema.Boolean,
  nested: Schema.Boolean,
  viewport: Schema.Boolean,
  finalMark: Schema.Boolean,
  initialFocus: Schema.optional(Schema.Boolean),
  skips: Schema.Boolean,
  topLayer: Schema.optional(Schema.Boolean)
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
  toast: false,
  nested: false,
  viewport: false,
  finalMark: false,
  skips: false,
  ...overrides
})

const Page = Html.component({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    config: Config,
    a: Schema.Boolean,
    b: Schema.Boolean,
    triggerId: Schema.NullOr(Schema.String),
    method: OpenMethod,
    toasts: Schema.Boolean,
    late: Schema.Boolean,
    removed: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: ($) => ({
    config: $.props,
    a: $.props.a,
    b: $.props.b,
    triggerId: $.props.triggers ? "ta" : null,
    method: null,
    toasts: $.props.toast,
    late: false,
    removed: false,
    log: []
  }),
  update: {
    Closed: ($) => ({ ...$.model, a: false }),
    ShowedToasts: ($) => ({ ...$.model, toasts: true }),
    AddedControl: ($) => ({ ...$.model, late: true }),
    Switched: ($) => ({
      ...$.model,
      config: { ...$.model.config, modal: $.model.config.modal === false }
    }),
    Removed: ($) => ({ ...$.model, removed: true }),
    AllowedFocus: ($) => ({
      ...$.model,
      config: { ...$.model.config, initialFocus: true }
    }),
    RequestedOpen: ($, { method, triggerId, which }) => ({
      ...$.model,
      [which]: true,
      triggerId,
      method,
      log: [...$.model.log, `RequestedOpen ${which} ${triggerId} ${method}`]
    }),
    RequestedClose: ($, { reason, which }) => ({
      ...$.model,
      [which]: $.model.config.refuse ? $.model[which as "a" | "b"] : false,
      log: [...$.model.log, `RequestedClose ${which} ${reason}`]
    }),
    Settled: ($, { open, which }) => ({
      ...$.model,
      log: [...$.model.log, `Settled ${which} ${open}`]
    })
  },
  view: (h, model) => {
    const props = model.config
    const on = (which: string) => ({
      RequestedOpen: ({ triggerId }: { readonly triggerId: string | null }) =>
        Message.RequestedOpen({ which, triggerId, method: null }),
      RequestedClose: ({ reason }: { readonly reason: string }) =>
        Message.RequestedClose({ which, reason }),
      Settled: ({ open }: { readonly open: boolean }) =>
        Message.Settled({ which, open })
    })
    return ToastProvider(h, {
      view: (toastProvider) =>
        h.div(
          h.button.attr("id", "page").children("Page"),
          h.div(
            model.late ? h.button.attr("id", "late").children("Late") : null
          ),
          h.button.attr("id", "shut").on("click", Message.Closed()).children(
            "Shut"
          ),
          h.button.attr("id", "switch").on("click", Message.Switched())
            .children(
              "Switch"
            ),
          h.button.attr("id", "reopen").on(
            "click",
            Message.RequestedOpen({ which: "a", triggerId: null, method: null })
          )
            .children(
              "Reopen"
            ),
          model.toasts
            ? toastProvider.viewport(h.div.attr("id", "toasts")).children(
              h.button.attr("id", "toast").children("Undo")
            )
            : null,
          props.detached
            ? DialogTrigger(h, {
              element: h.button.attr("id", "detached"),
              props: { open: model.a, popupId: "settings" },
              onPress: ({ method, triggerId }) =>
                Message.RequestedOpen({ which: "a", triggerId, method })
            }).children("Settings")
            : null,
          model.removed && !props.nested ? null : Dialog(h, {
            key: "a",
            props: {
              open: model.a,
              modal: props.modal,
              id: props.detached ? "settings" : undefined,
              keepMounted: props.keepMounted,
              triggerId: model.triggerId,
              finalFocus: props.finalFocus,
              initialFocus: props.initialFocus,
              openMethod: props.openMethod ?? model.method,
              topLayer: props.topLayer
            },
            onEmit: on("a"),
            view: (dialog) => {
              const popup = dialog.popup(h.div.attr("class", "popup-a"))
                .children(
                  props.skips
                    ? [
                      h.fieldset.attr("disabled", "").children(
                        h.input.attr("id", "in-fieldset")
                      ),
                      h.input.attrs({
                        id: "invisible",
                        style: "visibility:hidden"
                      }),
                      h.input.attrs({ id: "r1", type: "radio", name: "size" }),
                      h.input.attrs({
                        id: "r2",
                        type: "radio",
                        name: "size",
                        checked: ""
                      })
                    ]
                    : null,
                  h.input.attr("id", "first"),
                  props.marked
                    ? dialog.initialFocus(h.input.attr("id", "second"))
                    : h.input.attr("id", "second"),
                  props.siblings
                    ? h.button.attr("id", "open-b").on(
                      "click",
                      Message.RequestedOpen({
                        which: "b",
                        triggerId: null,
                        method: null
                      })
                    )
                      .children("Open B")
                    : null,
                  props.nested
                    ? Dialog(h, {
                      key: "b",
                      props: { open: model.b, modal: props.modal },
                      onEmit: on("b"),
                      view: (nestedDialog) =>
                        h.div(
                          nestedDialog.trigger(h.button.attr("id", "trigger-b"))
                            .children("B"),
                          model.removed
                            ? null
                            : nestedDialog.finalFocus(
                              h.button.attr("id", "final-b")
                            ).children("Back"),
                          model.removed ?
                            null :
                            nestedDialog.portal(h.dialog)?.children(
                              nestedDialog.popup(h.div).children(
                                h.input.attr("id", "b-field")
                              )
                            )
                        )
                    })
                    : null
                )
              return h.div(
                props.triggers
                  ? h.div(
                    dialog.trigger(h.button.attr("id", "ta")).children("A"),
                    dialog.trigger(h.button.attr("id", "tb")).children("B")
                  )
                  : props.detached
                  ? null
                  : dialog.trigger(h.button.attr("id", "trigger")).children(
                    "Open"
                  ),
                props.finalMark
                  ? dialog.finalFocus(h.button.attr("id", "final")).children(
                    "Final"
                  )
                  : null,
                h.output.attr("id", "close-method").children(
                  String(dialog.closeMethod)
                ),
                dialog.portal(h.dialog)?.children(
                  props.viewport
                    ? dialog.viewport(h.div.attr("id", "viewport")).children(
                      popup
                    )
                    : popup
                )
              )
            }
          }),
          props.siblings
            ? Dialog(h, {
              key: "b",
              props: { open: model.b, modal: props.modal },
              onEmit: on("b"),
              view: (dialog) =>
                h.div(
                  dialog.trigger(h.button.attr("id", "trigger-b")).children(
                    "B"
                  ),
                  dialog.portal(h.dialog)?.children(
                    dialog.popup(h.div).children(h.input.attr("id", "b-field"))
                  )
                )
            })
            : null
        )
    })
  }
})

const mountPage = Effect.fnUntraced(
  function*(overrides: Partial<Config>, into?: Element) {
    if (into === undefined) yield* popovers
    const app = into ?? (yield* container)
    const root = yield* BrowserHost.mountEffect(Page, config(overrides), app)
    yield* tick
    return { app, log: () => root.model()!.log, send: root.send }
  }
)

const escape = (init: KeyboardEventInit = {}, target: EventTarget = document) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
      ...init
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
const layerOf = (dialog: Element) => dialog.firstElementChild!

const elsewhere = Effect.acquireRelease(
  Effect.sync(() => {
    const other = document.implementation.createHTMLDocument()
    return other.body.appendChild(other.createElement("div"))
  }),
  (element) => Effect.sync(() => element.remove())
)

const inIframe = Effect.acquireRelease(
  Effect.sync(() => {
    const iframe = document.createElement("iframe")
    iframe.srcdoc = "<!doctype html><html><body></body></html>"
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument!
    const view = iframe.contentWindow!
    const RealHTMLElement = globalThis.HTMLElement
    // happy-dom shares HTMLElement across frames; give the parent realm its own constructor.
    class ParentHTMLElement extends RealHTMLElement {}
    Object.defineProperty(view, "HTMLElement", {
      value: RealHTMLElement,
      configurable: true
    })
    Object.defineProperty(globalThis, "HTMLElement", {
      value: ParentHTMLElement,
      configurable: true
    })
    return {
      app: doc.body.appendChild(doc.createElement("div")),
      iframe,
      RealHTMLElement
    }
  }),
  ({ RealHTMLElement, iframe }) =>
    Effect.sync(() => {
      Object.defineProperty(globalThis, "HTMLElement", {
        value: RealHTMLElement,
        configurable: true
      })
      iframe.remove()
    })
)

const closeWatchers = (
  platform: { readonly android: boolean; readonly closeWatcher: boolean }
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const made: Array<
        { destroyed: boolean; request: (cancelable: boolean) => boolean }
      > = []
      class Watcher extends EventTarget {
        destroyed = false
        constructor() {
          super()
          made.push(this)
        }
        destroy() {
          this.destroyed = true
        }
        request(cancelable: boolean) {
          const cancel = new Event("cancel", { cancelable })
          this.dispatchEvent(cancel)
          if (cancel.defaultPrevented) return true
          this.destroyed = true
          this.dispatchEvent(new Event("close"))
          return false
        }
      }
      const userAgent = platform.android
        ? "Mozilla/5.0 (Linux; Android 14) Chrome/130.0"
        : navigator.userAgent
      Object.defineProperty(navigator, "userAgent", {
        value: userAgent,
        configurable: true
      })
      if (platform.closeWatcher) {
        Object.assign(window, { CloseWatcher: Watcher })
      }
      return () => made.filter((watcher) => !watcher.destroyed)
    }),
    () =>
      Effect.sync(() => {
        delete (navigator as { userAgent?: string }).userAgent
        delete (window as { CloseWatcher?: unknown }).CloseWatcher
      })
  )
const android = { android: true, closeWatcher: true }
const back = (
  live: () => ReadonlyArray<{ request: (cancelable: boolean) => boolean }>,
  cancelable = true
) => {
  const watchers = live()
  assert.strictEqual(watchers.length, 1)
  return watchers[0]!.request(cancelable)
}

const dismissals = (log: ReadonlyArray<string>) =>
  log.filter((line) => line.startsWith("RequestedClose"))
const opens = (log: ReadonlyArray<string>) =>
  log.filter((line) => line.startsWith("RequestedOpen"))

// The tests share one document, and move focus.
describe("Dialog in a document", { concurrent: false }, () => {
  it.effect("a press inside the upper of two sibling dialogs is no press outside the lower one", () =>
    Effect.gen(function*() {
      for (const modal of [true, "trap-focus"] as const) {
        yield* Effect.scoped(Effect.gen(function*() {
          const { log } = yield* mountPage({ modal, siblings: true, b: true })
          click(byId("b-field"))
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [], String(modal))
          // A press outside both is the upper dialog's alone.
          click(
            modal === true
              ? layerOf(document.querySelectorAll("dialog")[1]!)
              : byId("page")
          )
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            "RequestedClose b outside-press"
          ], String(modal))
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
      escape()
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose b escape-key"])
      assert.strictEqual(document.activeElement?.id, "trigger-b")
      assert.strictEqual(app.querySelectorAll("dialog").length, 1)
      // Focus the user moves out of A still closes it.
      byId("page").focus()
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose b escape-key",
        "RequestedClose a focus-out"
      ])
    }))

  it.effect("of two dialogs open from the start, the upper one takes focus, and neither closes", () =>
    Effect.gen(function*() {
      const focused: Array<string> = []
      const record = (event: FocusEvent) =>
        focused.push((event.target as Element).id)
      document.addEventListener("focusin", record)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => document.removeEventListener("focusin", record))
      )
      const { log } = yield* mountPage({
        modal: false,
        siblings: true,
        b: true
      })
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
      assert.deepStrictEqual(opens(log()), ["RequestedOpen a tb null"])
      assert.deepStrictEqual(dismissals(log()), [])
      byId("first").focus()
      escape()
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "tb")
    }))

  it.effect("a touch-opened dialog honors marked initial focus and can skip return focus", () =>
    Effect.gen(function*() {
      const { finish } = yield* holdExits
      const { app } = yield* mountPage({
        openMethod: "touch",
        marked: true,
        finalFocus: false
      })
      assert.strictEqual(document.activeElement?.id, "second")
      escape()
      yield* tick
      assert.isNotNull(app.querySelector("dialog"))
      assert.strictEqual(document.activeElement, document.body)
      finish()
      yield* tick
      yield* tick
      assert.isNull(app.querySelector("dialog"))
      assert.strictEqual(document.activeElement, document.body)
    }))

  it.effect("a refused Escape keeps the dialog open as often as it's pressed, but not an input method's", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ refuse: true })
      const dialog = app.querySelector("dialog")!
      byId("second").focus()
      for (let i = 0; i < 4; i++) escape()
      escape({ isComposing: true })
      escape({ keyCode: 229 })
      byId("second").dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true })
      )
      escape()
      yield* tick
      assert.deepStrictEqual(
        dismissals(log()),
        Array(4).fill("RequestedClose a escape-key")
      )
      assert.isTrue(dialog.matches(":popover-open"))
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
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => (Element.prototype.getAnimations = original))
      )
      const { app, log } = yield* mountPage({ modal: false })
      byId("page").focus()
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose a focus-out"])
      assert.isNull(app.querySelector("dialog"))
      assert.include(log(), "Settled a false")
    }))

  it.effect("a detached trigger reports how it was pressed, points at the dialog, and gets focus back", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({
        modal: false,
        detached: true,
        a: false
      })
      const trigger = byId("detached")
      assert.isNull(trigger.getAttribute("aria-controls"))
      press(trigger, "touch")
      trigger.dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "touch"
        })
      )
      yield* tick
      yield* tick
      assert.deepStrictEqual(opens(log()), ["RequestedOpen a detached touch"])
      assert.strictEqual(trigger.getAttribute("aria-controls"), "settings")
      assert.strictEqual(document.querySelector("dialog")?.id, "settings")
      assert.strictEqual(
        document.activeElement,
        document.querySelector(".popup-a")
      )
      press(trigger)
      yield* tick
      // A press on the trigger is the trigger's, not one outside.
      assert.deepStrictEqual(dismissals(log()), [])
      escape()
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose a escape-key"])
      assert.strictEqual(document.activeElement?.id, "detached")
    }))

  it.effect("a modal hides the page from screen readers and locks its scroll, until its close starts", () =>
    Effect.gen(function*() {
      yield* holdExits
      const { app, log } = yield* mountPage({ toast: true, refuse: true })
      const dialog = app.querySelector("dialog")!
      const hidden = () =>
        ["page", "shut", "trigger"].map((id) =>
          byId(id).getAttribute("aria-hidden")
        )
      assert.deepStrictEqual(hidden(), ["true", "true", "true"])
      for (
        const element of [
          byId("toasts"),
          app,
          app.firstElementChild!,
          dialog.parentElement!
        ]
      ) {
        assert.isNull(element.getAttribute("aria-hidden"))
      }
      assert.strictEqual(document.body.style.overflowY, "hidden")
      assert.isNull(layerOf(dialog).getAttribute("inert"))
      escape()
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose a escape-key"])
      assert.deepStrictEqual(hidden(), ["true", "true", "true"])
      byId("shut").click()
      yield* tick
      assert.isTrue(dialog.isConnected)
      assert.deepStrictEqual(hidden(), [null, null, null])
      assert.strictEqual(document.body.style.overflowY, "")
      assert.strictEqual(layerOf(dialog).getAttribute("inert"), "")
    }))

  it.effect("a modal in a shadow root hides its neighbours there and on the page, but not its host or a status region, and Tab moves through it", () =>
    Effect.gen(function*() {
      yield* popovers
      const host = yield* container
      const neighbour = yield* container
      const shadow = host.attachShadow({ mode: "open" })
      const sibling = shadow.appendChild(document.createElement("p"))
      const status = shadow.appendChild(document.createElement("div"))
      status.setAttribute("role", "status")
      yield* mountPage({}, shadow.appendChild(document.createElement("div")))
      assert.deepStrictEqual(
        [host, neighbour, sibling, status, shadow.getElementById("page")!]
          .map((element) => element.getAttribute("aria-hidden")),
        [null, "true", "true", null, "true"]
      )
      assert.strictEqual(shadow.activeElement?.id, "first")
      assert.isFalse(tab())
      shadow.getElementById("second")!.focus()
      assert.isTrue(tab())
      assert.strictEqual(shadow.activeElement?.id, "first")
    }))

  it.effect("trap-focus hides the page but leaves its scroll and focus alone", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ modal: "trap-focus" })
      assert.strictEqual(byId("page").getAttribute("aria-hidden"), "true")
      assert.strictEqual(document.body.style.overflowY, "")
      byId("page").focus()
      yield* tick
      assert.strictEqual(document.activeElement?.id, "page")
      assert.isFalse(tab())
      byId("first").focus()
      assert.isFalse(tab())
      assert.deepStrictEqual(dismissals(log()), [])
    }))

  it.effect("a modal takes a click on its layer as outside, and not a press on the toasts above it", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ toast: true })
      const layer = layerOf(app.querySelector("dialog")!)
      click(byId("toast"))
      press(layer)
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      press(byId("first"))
      layer.dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "mouse"
        })
      )
      press(layer, "mouse")
      layer.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          button: 2
        })
      )
      layer.dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "mouse"
        })
      )
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      escape({}, byId("toast"))
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      click(layer)
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a outside-press"
      ])
    }))

  it.effect("trap-focus takes a press on late toasts as outside, but not one on what the page added since", () =>
    Effect.gen(function*() {
      const { log, send } = yield* mountPage({ modal: "trap-focus" })
      const root = document.body.appendChild(document.createElement("div"))
      const label = document.createElement("span")
      label.setAttribute("role", "presentation")
      document.querySelector(".popup-a")!.appendChild(label)
      yield* Effect.addFinalizer(() => Effect.sync(() => root.remove()))
      send(Message.AddedControl())
      yield* tick
      click(root.appendChild(document.createElement("button")))
      click(byId("late"))
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      send(Message.ShowedToasts())
      yield* tick
      press(byId("toast"))
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a outside-press"
      ])
    }))

  it.effect("a non-modal dialog takes a click on late toasts as outside", () =>
    Effect.gen(function*() {
      const { log, send } = yield* mountPage({ modal: false })
      send(Message.ShowedToasts())
      yield* tick
      click(byId("toast"))
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a outside-press"
      ])
    }))

  it.effect("focus skips what Tab doesn't reach, and a focused element removed gives focus to the popup", () =>
    Effect.gen(function*() {
      const { app } = yield* mountPage({ skips: true })
      assert.strictEqual(document.activeElement?.id, "r2")
      byId("second").focus()
      byId("second").remove()
      yield* tick
      assert.strictEqual(document.activeElement, app.querySelector(".popup-a"))
    }))

  it.effect("Tab reaches editing hosts, media controls and a details without a summary, skipping a details with a summary or what a closed details hides", () =>
    Effect.gen(function*() {
      yield* mountPage({})
      const popup = document.querySelector(".popup-a")!
      for (
        const [html, wraps] of [
          ["<div contenteditable></div>", true],
          ["<div contenteditable=\"true\"></div>", true],
          ["<div contenteditable=\"plaintext-only\"></div>", true],
          ["<details>More</details>", true],
          ["<audio controls></audio>", true],
          ["<video controls></video>", true],
          ["<details><summary>More</summary></details>", false]
        ] as const
      ) {
        popup.insertAdjacentHTML("beforeend", html)
        const last = popup.lastElementChild as HTMLElement
        last.focus()
        assert.strictEqual(tab(), wraps, html)
        if (wraps) assert.strictEqual(document.activeElement?.id, "first", html)
        last.remove()
      }
      // When script can't focus the disclosure, the wrap leaves the move to the browser.
      yield* focusability
      const details = popup.appendChild(document.createElement("details"))
      details.appendChild(document.createElement("button")).id = "inner"
      byId("first").focus()
      assert.isFalse(tab(true))
      assert.strictEqual(
        document.activeElement?.previousElementSibling,
        details
      )
      details.open = true
      details.prepend(byId("first"), byId("second"))
      byId("inner").focus()
      assert.isFalse(tab())
      assert.strictEqual(document.activeElement?.nextElementSibling, details)
    }))

  it.effect("a kept-mounted modal keeps its popup element as it opens, closes and reopens", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ a: false, keepMounted: true })
      const popup = app.querySelector(".popup-a")
      assert.isNotNull(popup)
      byId("trigger").click()
      yield* tick
      assert.strictEqual(app.querySelector(".popup-a"), popup)
      click(layerOf(app.querySelector("dialog")!))
      yield* tick
      yield* tick
      assert.include(log(), "Settled a false")
      assert.strictEqual(app.querySelector(".popup-a"), popup)
      byId("reopen").click()
      yield* tick
      assert.strictEqual(app.querySelector(".popup-a"), popup)
    }))

  it.effect("a touch outside dismisses on its press, and its click reaches the page unless the dialog is modal", () =>
    Effect.gen(function*() {
      for (const modal of [true, false, "trap-focus"] as const) {
        yield* Effect.scoped(Effect.gen(function*() {
          const { log } = yield* mountPage({ modal })
          const page = byId("page")
          let clicks = 0
          page.addEventListener("click", () => clicks++)
          press(
            modal === true ? layerOf(document.querySelector("dialog")!) : page,
            "touch"
          )
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            "RequestedClose a outside-press"
          ], String(modal))
          page.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              pointerType: "touch"
            })
          )
          page.dispatchEvent(
            new PointerEvent("click", {
              bubbles: true,
              detail: 1,
              pointerType: "touch"
            })
          )
          const tapped = modal === true ? 0 : 1
          assert.strictEqual(clicks, tapped, String(modal))
          click(page)
          assert.strictEqual(clicks, tapped + 1, String(modal))
        }))
      }
    }))

  it.effect("drawn in place, it is an open dialog that leaves the page alone, whatever modal says", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ modal: true, topLayer: false })
      const dialog = app.querySelector("dialog")!
      assert.isFalse(dialog.hasAttribute("popover"))
      assert.isTrue(dialog.open)
      assert.isFalse(dialog.matches(":popover-open"))
      assert.include(dialog.getAttribute("style") ?? "", "position:static")
      assert.isNull(dialog.querySelector(":scope > [role=presentation]"))
      assert.isNull(byId("page").closest("[aria-hidden]"))
      assert.strictEqual(document.body.style.overflowY, "")
      assert.strictEqual(document.documentElement.style.overflowY, "")
      assert.strictEqual(document.activeElement?.id, "first")
      // A press on the page closes it and reaches the page, as without a modal.
      const page = byId("page")
      let clicks = 0
      page.addEventListener("click", () => clicks++)
      click(page, "touch")
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a outside-press"
      ])
      assert.strictEqual(clicks, 1)
    }))

  it.effect("a close before the first frame still exits and settles", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ a: false })
      byId("trigger").click()
      yield* Effect.promise(() =>
        new Promise((resolve) => setTimeout(resolve, 0))
      )
      assert.isNotNull(app.querySelector("dialog"))
      byId("shut").click()
      yield* tick
      yield* tick
      assert.isNull(app.querySelector("dialog"))
      assert.include(log(), "Settled a false")
    }))

  it.effect("a nested modal open with its parent hides the parent's content, its own trigger included", () =>
    Effect.gen(function*() {
      yield* mountPage({ nested: true, b: true })
      assert.isNotNull(byId("trigger-b").closest("[aria-hidden=true]"))
      assert.strictEqual(byId("first").getAttribute("aria-hidden"), "true")
      assert.isNull(byId("b-field").closest("[aria-hidden]"))
      assert.strictEqual(document.activeElement?.id, "b-field")
    }))

  it.effect("a dialog whose exit ends after another one opened leaves focus in the newer one", () =>
    Effect.gen(function*() {
      const { finish } = yield* holdExits
      const { log } = yield* mountPage({ siblings: true, finalMark: true })
      byId("shut").click()
      yield* tick
      byId("trigger-b").click()
      yield* tick
      assert.strictEqual(document.activeElement?.id, "b-field")
      finish()
      yield* tick
      yield* tick
      assert.include(log(), "Settled a false")
      assert.strictEqual(document.activeElement?.id, "b-field")
    }))

  it.effect("a dialog reopened during its exit takes focus back from the page and finishes entering", () =>
    Effect.gen(function*() {
      yield* holdExits
      const { app, log } = yield* mountPage({})
      const popup = app.querySelector(".popup-a")!
      byId("shut").click()
      yield* tick
      assert.strictEqual(popup.getAttribute("inert"), "")
      byId("page").focus()
      byId("reopen").click()
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "first")
      assert.isNull(popup.getAttribute("inert"))
      assert.strictEqual(popup.getAttribute("data-open"), "")
      assert.isNull(popup.getAttribute("data-starting-style"))
      assert.strictEqual(byId("page").getAttribute("aria-hidden"), "true")
      assert.strictEqual(
        log().filter((line) => line === "Settled a true").length,
        2
      )
    }))

  it.effect("reopening a lower sibling modal during its exit leaves the upper Escape recipient exposed", () =>
    Effect.gen(function*() {
      yield* holdExits
      const { log } = yield* mountPage({ siblings: true, b: true })
      byId("shut").click()
      yield* tick
      byId("reopen").click()
      yield* tick
      assert.isNull(byId("b-field").closest("[aria-hidden=true]"))
      escape()
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose b escape-key"])
    }))

  it.effect("a dialog closed before its first frame and reopened during the exit finishes entering", () =>
    Effect.gen(function*() {
      yield* holdExits
      const { app, log } = yield* mountPage({ a: false })
      byId("trigger").click()
      yield* Effect.promise(() =>
        new Promise((resolve) => setTimeout(resolve, 0))
      )
      byId("shut").click()
      yield* tick
      byId("reopen").click()
      yield* tick
      yield* tick
      assert.isNull(
        app.querySelector(".popup-a")!.getAttribute("data-starting-style")
      )
      assert.deepStrictEqual(
        log().filter((line) => line.startsWith("Settled")),
        ["Settled a true"]
      )
    }))

  it.effect("initialFocus: false takes back the focus the browser gives the dialog's first field", () =>
    Effect.gen(function*() {
      yield* mountPage({ a: false, initialFocus: false })
      byId("trigger").focus()
      byId("trigger").click()
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "trigger")
    }))

  it.effect("a dialog open without initial focus takes focus once initialFocus allows it", () =>
    Effect.gen(function*() {
      const { send } = yield* mountPage({ a: false, initialFocus: false })
      byId("trigger").focus()
      byId("trigger").click()
      yield* tick
      yield* tick
      send(Message.AllowedFocus())
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "first")
    }))

  it.effect("a press that ends inside the popup isn't outside, though its click lands around it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ viewport: true })
      const viewport = byId("viewport")
      press(viewport)
      byId("first").dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" })
      )
      viewport.dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "mouse"
        })
      )
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [])
      click(viewport)
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a outside-press"
      ])
    }))

  it.effect("switching modes while open takes and gives back the scroll lock and the hidden page", () =>
    Effect.gen(function*() {
      yield* mountPage({ refuse: true })
      const state = () => [
        byId("page").getAttribute("aria-hidden"),
        document.body.style.overflowY
      ]
      assert.deepStrictEqual(state(), ["true", "hidden"])
      byId("switch").click()
      yield* tick
      assert.deepStrictEqual(state(), [null, ""])
      byId("switch").click()
      yield* tick
      assert.deepStrictEqual(state(), ["true", "hidden"])
    }))

  it.effect("a nested dialog gives its finalFocus focus as its close starts, and its exit ending takes none back", () =>
    Effect.gen(function*() {
      const { finish } = yield* holdExits
      const { log } = yield* mountPage({ nested: true, b: true })
      escape()
      yield* tick
      assert.notInclude(log(), "Settled b false")
      assert.strictEqual(document.activeElement?.id, "final-b")
      byId("first").focus()
      finish()
      yield* tick
      yield* tick
      assert.include(log(), "Settled b false")
      assert.strictEqual(document.activeElement?.id, "first")
    }))

  it.effect("keyboard open, Tab wrap and Escape ask for a focus ring as the popup goes inert, while an external close leaves it to the browser", () =>
    Effect.gen(function*() {
      yield* holdExits
      const { calls } = yield* focusVisibility
      const { app, log } = yield* mountPage({ openMethod: "keyboard" })
      const popup = app.querySelector(".popup-a")!
      assert.deepStrictEqual(calls.at(-1), ["first", true])
      assert.isNull(popup.getAttribute("inert"))
      byId("second").focus()
      assert.isTrue(tab())
      assert.deepStrictEqual(calls.at(-1), ["first", true])
      escape()
      yield* tick
      assert.notInclude(log(), "Settled a false")
      assert.isTrue(popup.isConnected)
      assert.strictEqual(popup.getAttribute("inert"), "")
      assert.strictEqual(document.activeElement?.id, "trigger")
      assert.deepStrictEqual(calls.at(-1), ["trigger", true])
      byId("reopen").click()
      yield* tick
      byId("shut").click()
      yield* tick
      assert.deepStrictEqual(calls.at(-1), ["trigger", undefined])
    }))

  it.effect("focus leaving or a press that focuses the page keeps focus where it went as the close starts", () =>
    Effect.gen(function*() {
      for (const modal of [false, "trap-focus"] as const) {
        yield* Effect.scoped(Effect.gen(function*() {
          yield* holdExits
          const { log } = yield* mountPage({ modal, finalMark: true })
          if (modal === false) byId("page").focus()
          else {
            press(byId("page"))
            byId("page").focus()
            byId("page").dispatchEvent(
              new PointerEvent("pointerup", { bubbles: true })
            )
          }
          yield* tick
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            modal
              ? "RequestedClose a outside-press"
              : "RequestedClose a focus-out"
          ])
          assert.strictEqual(document.activeElement?.id, "page", String(modal))
        }))
      }
    }))

  it.effect("a touch that closes the dialog moves focus once it lifts, and leaves a field the tap focused", () =>
    Effect.gen(function*() {
      for (const focuses of [false, true]) {
        yield* Effect.scoped(Effect.gen(function*() {
          yield* holdExits
          const { log } = yield* mountPage({ modal: false })
          const page = byId("page")
          press(page, "touch")
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            "RequestedClose a outside-press"
          ])
          assert.notStrictEqual(
            document.activeElement?.id,
            "trigger",
            String(focuses)
          )
          if (focuses) page.focus()
          page.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              pointerType: "touch"
            })
          )
          yield* tick
          assert.strictEqual(
            document.activeElement?.id,
            focuses ? "page" : "trigger",
            String(focuses)
          )
        }))
      }
    }))

  it.effect("a press that opens another dialog leaves focus in it as the first one closes", () =>
    Effect.gen(function*() {
      yield* holdExits
      const { log } = yield* mountPage({
        modal: false,
        siblings: true,
        finalMark: true
      })
      click(byId("trigger-b"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a outside-press"
      ])
      assert.deepStrictEqual(opens(log()), ["RequestedOpen b trigger-b null"])
      assert.strictEqual(document.activeElement?.id, "b-field")
    }))

  it.effect("a dialog unmounted while open gives focus back, though its parent dialog took focus as it went", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const { send } = yield* mountPage({ a: false })
        byId("page").focus()
        byId("trigger").click()
        yield* tick
        assert.strictEqual(document.activeElement?.id, "first")
        send(Message.Removed())
        yield* tick
        assert.isNull(document.querySelector(".popup-a"))
        assert.strictEqual(document.activeElement?.id, "page")
      }))
      const { app, send } = yield* mountPage({ nested: true, b: true })
      assert.strictEqual(document.activeElement?.id, "b-field")
      const parent = app.querySelector<HTMLElement>(".popup-a")!
      const recovery = new MutationObserver(() => {
        if (byId("b-field") === null) parent.focus()
      })
      recovery.observe(app, { childList: true, subtree: true })
      send(Message.Removed())
      yield* tick
      recovery.disconnect()
      assert.isNull(byId("b-field"))
      assert.strictEqual(document.activeElement?.id, "trigger-b")
    }))

  it.effect("with the trigger disabled or gone, focus goes back to what had it before the open, over what had it since", () =>
    Effect.gen(function*() {
      yield* mountPage({ detached: true, a: false })
      byId("page").focus()
      byId("detached").click()
      yield* tick
      byId("detached").setAttribute("disabled", "")
      byId("shut").focus()
      byId("first").focus()
      escape()
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "page")
      byId("detached").removeAttribute("disabled")
      byId("detached").click()
      yield* tick
      byId("detached").remove()
      escape()
      yield* tick
      yield* tick
      assert.strictEqual(document.activeElement?.id, "page")
    }))

  it.effect("without a backdrop, a mouse press that focuses a late button keeps the dialog open, and Tab out closes it", () =>
    Effect.gen(function*() {
      const { log, send } = yield* mountPage({ modal: false })
      const root = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => root.remove()))
      send(Message.AddedControl())
      yield* tick
      for (
        const button of [
          byId("late"),
          root.appendChild(document.createElement("button"))
        ]
      ) {
        press(button)
        button.focus()
        button.dispatchEvent(
          new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" })
        )
        button.dispatchEvent(
          new PointerEvent("click", {
            bubbles: true,
            detail: 1,
            pointerType: "mouse"
          })
        )
        yield* tick
        assert.strictEqual(document.activeElement, button)
      }
      assert.deepStrictEqual(dismissals(log()), [])
      byId("first").focus()
      byId("late").focus()
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose a focus-out"])
    }))

  it.effect("a close the dialog didn't ask for, after a reopen, has no close method from the last close", () =>
    Effect.gen(function*() {
      for (const held of [false, true]) {
        yield* Effect.scoped(Effect.gen(function*() {
          if (held) yield* holdExits
          const { log } = yield* mountPage({})
          const closeMethod = () => byId("close-method").textContent
          escape()
          yield* tick
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            "RequestedClose a escape-key"
          ], String(held))
          assert.strictEqual(closeMethod(), "keyboard", String(held))
          byId("reopen").click()
          yield* tick
          yield* tick
          assert.strictEqual(closeMethod(), "null", String(held))
          byId("shut").click()
          yield* tick
          yield* tick
          assert.strictEqual(closeMethod(), "null", String(held))
        }))
      }
    }))

  it.effect("on Android, back asks the dialog to close, and a refused close keeps listening until it closes", () =>
    Effect.gen(function*() {
      const live = yield* closeWatchers(android)
      const { log } = yield* mountPage({ refuse: true })
      assert.isTrue(back(live))
      yield* tick
      assert.deepStrictEqual(dismissals(log()), [
        "RequestedClose a close-watcher"
      ])
      back(live, false)
      yield* tick
      back(live)
      yield* tick
      assert.deepStrictEqual(
        dismissals(log()),
        Array(3).fill("RequestedClose a close-watcher")
      )
      click(byId("shut"))
      yield* tick
      assert.strictEqual(live().length, 0)
    }))

  it.effect("on Android, only the upper of two dialogs, nested or side by side, hears back", () =>
    Effect.gen(function*() {
      for (const layout of [{ nested: true }, { siblings: true }]) {
        yield* Effect.scoped(Effect.gen(function*() {
          const live = yield* closeWatchers(android)
          yield* holdExits
          const { log } = yield* mountPage({ ...layout, b: true })
          back(live)
          yield* tick
          back(live)
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            "RequestedClose b close-watcher",
            "RequestedClose a close-watcher"
          ])
        }))
      }
    }))

  it.effect("on Android, an open dialog stops listening for back once it unmounts", () =>
    Effect.gen(function*() {
      const live = yield* closeWatchers(android)
      yield* Effect.scoped(mountPage({}))
      assert.strictEqual(live().length, 0)
    }))

  it.effect("off Android, or without CloseWatcher, the dialog makes no watcher and still hears Escape", () =>
    Effect.gen(function*() {
      for (
        const platform of [{ android: false, closeWatcher: true }, {
          android: true,
          closeWatcher: false
        }]
      ) {
        yield* Effect.scoped(Effect.gen(function*() {
          const live = yield* closeWatchers(platform)
          const { log } = yield* mountPage({})
          assert.strictEqual(live().length, 0)
          escape()
          yield* tick
          assert.deepStrictEqual(dismissals(log()), [
            "RequestedClose a escape-key"
          ])
        }))
      }
    }))

  it.effect("a dialog in another document leaves this one's topmost dialog, hidden page and scroll lock alone", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({})
      const app = yield* elsewhere
      const other = app.ownerDocument
      const second = yield* mountPage({}, app)
      assert.strictEqual(byId("page").getAttribute("aria-hidden"), "true")
      assert.strictEqual(
        other.getElementById("page")!.getAttribute("aria-hidden"),
        "true"
      )
      escape()
      yield* tick
      assert.deepStrictEqual(dismissals(log()), ["RequestedClose a escape-key"])
      assert.isNull(byId("page").getAttribute("aria-hidden"))
      assert.strictEqual(document.body.style.overflowY, "")
      assert.strictEqual(
        other.getElementById("page")!.getAttribute("aria-hidden"),
        "true"
      )
      escape({}, other)
      yield* tick
      assert.deepStrictEqual(dismissals(second.log()), [
        "RequestedClose a escape-key"
      ])
    }))

  it.effect("focus goes back to what had it before the open, and stays there without initialFocus, in an iframe", () =>
    Effect.gen(function*() {
      yield* popovers
      const { app } = yield* inIframe
      const other = app.ownerDocument
      yield* mountPage({ detached: true, a: false }, app)
      other.getElementById("page")!.focus()
      other.getElementById("detached")!.click()
      yield* tick
      assert.strictEqual(other.activeElement?.id, "first")
      other.getElementById("detached")!.remove()
      escape({}, other)
      yield* tick
      yield* tick
      assert.strictEqual(other.activeElement?.id, "page")

      const app2 = other.body.appendChild(other.createElement("div"))
      yield* mountPage({ detached: true, a: false, initialFocus: false }, app2)
      app2.querySelector<HTMLElement>("#page")!.focus()
      app2.querySelector<HTMLElement>("#detached")!.click()
      yield* tick
      assert.strictEqual(other.activeElement, app2.querySelector("#page"))
    }))
})
