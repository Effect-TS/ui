// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Menu, Menubar, type MenuItem } from "@effect/ui-kit"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, popovers, tick } from "./utils/document.ts"

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const saved = (window as any).ResizeObserver
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    return () => {
      ;(window as any).ResizeObserver = saved
    }
  }),
  (restore) => Effect.sync(restore)
)

const menus: ReadonlyArray<
  { readonly name: string; readonly items: ReadonlyArray<MenuItem> }
> = [
  {
    name: "file",
    items: [{ value: "new", label: "New" }, { value: "share", label: "Share" }]
  },
  {
    name: "edit",
    items: [{ value: "copy", label: "Copy" }, {
      value: "paste",
      label: "Paste"
    }]
  },
  { name: "view", items: [{ value: "zoom", label: "Zoom" }] }
]

const shareItems: ReadonlyArray<MenuItem> = [
  { value: "email", label: "Email" },
  { value: "print", label: "Print" }
]

const Config = Schema.Struct({
  orientation: Schema.Literals(["horizontal", "vertical"]),
  disabled: Schema.Boolean,
  fileDisabled: Schema.Boolean,
  independent: Schema.Boolean,
  rtl: Schema.Boolean,
  initial: Schema.Array(Schema.String),
  twin: Schema.Boolean
})
type Config = typeof Config.Type

const Message = UiSchema.TaggedEnum({
  RequestedOpen: { menu: Schema.String, reason: Schema.String },
  RequestedClose: { menu: Schema.String, reason: Schema.String },
  Picked: { menu: Schema.String, value: Schema.String },
  ChangedModal: { modal: Schema.Boolean }
})

const Page = Html.component({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    open: Schema.Array(Schema.String),
    modal: Schema.Boolean,
    share: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: ($) => ({ open: $.props.initial, modal: true, share: false, log: [] }),
  update: {
    RequestedOpen: ($, { menu, reason }) => ({
      ...$.model,
      ...(menu === "share"
        ? { share: true }
        : { open: $.props.independent ? [...$.model.open, menu] : [menu] }),
      log: [...$.model.log, menu + " RequestedOpen " + reason]
    }),
    RequestedClose: ($, { menu, reason }) => ({
      ...$.model,
      ...(menu === "share"
        ? { share: false }
        : { open: $.model.open.filter((name) => name !== menu) }),
      log: [...$.model.log, menu + " RequestedClose " + reason]
    }),
    Picked: ($, { menu, value }) => ({
      ...$.model,
      log: [...$.model.log, menu + " Picked " + value]
    }),
    ChangedModal: ($, { modal }) => ({ ...$.model, modal })
  },
  view: (h, model) => {
    const onEmit = (menu: string) => ({
      RequestedOpen: ({ reason }: { readonly reason: string }) =>
        Message.RequestedOpen({ menu, reason }),
      RequestedClose: ({ reason }: { readonly reason: string }) =>
        Message.RequestedClose({ menu, reason }),
      Picked: ({ value }: { readonly value: string }) =>
        Message.Picked({ menu, value }),
      Highlighted: () => undefined,
      RequestedQuery: () => undefined,
      Settled: () => undefined
    })
    return h.div(
      h.button.attrs({ id: "before", type: "button" }).children("Before"),
      Menubar(h, {
        props: {
          orientation: h.props.orientation,
          disabled: h.props.disabled,
          modal: model.modal
        },
        view: (menubar) =>
          menubar.root(
            h.div.attrs({
              id: "bar",
              "data-part-state":
                `${menubar.orientation}:${menubar.modal}:${menubar.disabled}:${menubar.hasSubmenuOpen}`,
              ...(h.props.rtl ? { style: "direction: rtl" } : {})
            })
          ).children(
            ...menus.map(({ items, name }) =>
              Menu(h, {
                key: name,
                props: {
                  open: model.open.includes(name),
                  items,
                  disabled: name === "file" && h.props.fileDisabled
                },
                onEmit: onEmit(name),
                view: (menu) =>
                  h.div(
                    menu.trigger({
                      element: h.button.attrs({
                        id: name,
                        role: "button",
                        tabindex: "5"
                      })
                    }).children(
                      name
                    ),
                    name === "view" && h.props.twin
                      ? menu.trigger({ element: h.button.attr("id", "view2") })
                        .children("view 2")
                      : null,
                    menu.positioner(h.div.attr("id", name + "-positioner"))
                      .children(
                        menu.popup(h.div).children(
                          ...items.map((item) =>
                            item.value === "share"
                              ? Menu(h, {
                                props: {
                                  open: model.share,
                                  items: shareItems,
                                  parentItem: "share"
                                },
                                onEmit: onEmit("share"),
                                view: (share) =>
                                  h.div(
                                    menu.item({
                                      element: share.submenuTrigger(
                                        h.div.attr("data-testid", "share")
                                      ),
                                      value: "share"
                                    })
                                      .children("Share"),
                                    share.positioner(
                                      h.div.attr("id", "share-positioner")
                                    ).children(
                                      share.popup(h.div).children(
                                        ...shareItems.map((sub) =>
                                          share.item({
                                            element: h.div.attr(
                                              "data-testid",
                                              sub.value
                                            ),
                                            value: sub.value
                                          })
                                            .children(sub.label)
                                        )
                                      )
                                    )
                                  )
                              })
                              : menu.item({
                                element: h.div.attr("data-testid", item.value),
                                value: item.value
                              }).children(
                                item.label
                              )
                          )
                        )
                      )
                  )
              })
            )
          )
      }),
      h.button.attrs({ id: "after", type: "button" }).children("After")
    )
  }
})

const mountPage = Effect.fnUntraced(function*(config: Partial<Config> = {}) {
  yield* popovers
  yield* geometry
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, {
    orientation: "horizontal",
    disabled: false,
    fileDisabled: false,
    independent: false,
    rtl: false,
    initial: [],
    twin: false,
    ...config
  }, app)
  yield* tick
  return { root, log: () => root.model()?.log ?? [] }
})

const item = (value: string) =>
  document.querySelector<HTMLElement>("[data-testid=" + value + "]")!
const keydown = (target: Element, key: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )
const mousedown = (target: Element) => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      isPrimary: true,
      pointerType: "mouse",
      button: 0
    })
  )
  target.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
  )
}
const shown = (id: string) => byId(id).matches(":popover-open")
const tabindexes = () =>
  ["file", "edit", "view"].map((id) => byId(id).getAttribute("tabindex"))

describe("Menubar in a document", { concurrent: false }, () => {
  it.effect("the arrow keys, Home and End move focus between the triggers without opening a menu", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      assert.strictEqual(byId("bar").getAttribute("role"), "menubar")
      assert.strictEqual(
        byId("bar").getAttribute("aria-orientation"),
        "horizontal"
      )
      assert.strictEqual(
        byId("bar").getAttribute("data-orientation"),
        "horizontal"
      )
      assert.strictEqual(byId("bar").getAttribute("data-modal"), "")
      assert.strictEqual(
        byId("bar").getAttribute("data-part-state"),
        "horizontal:true:false:false"
      )
      assert.strictEqual(byId("file").getAttribute("role"), "menuitem")
      assert.deepStrictEqual(tabindexes(), ["0", "-1", "-1"])
      byId("file").focus()
      keydown(byId("file"), "ArrowRight")
      yield* tick
      assert.strictEqual(document.activeElement, byId("edit"))
      assert.deepStrictEqual(tabindexes(), ["-1", "0", "-1"])
      keydown(byId("edit"), "End")
      yield* tick
      assert.strictEqual(document.activeElement, byId("view"))
      keydown(byId("view"), "ArrowRight")
      yield* tick
      assert.strictEqual(document.activeElement, byId("file"))
      keydown(byId("file"), "ArrowLeft")
      yield* tick
      keydown(byId("view"), "Home")
      yield* tick
      assert.strictEqual(document.activeElement, byId("file"))
      assert.deepStrictEqual(log(), [])
      keydown(byId("file"), "ArrowDown")
      yield* tick
      assert.isTrue(shown("file-positioner"))
      assert.strictEqual(
        byId("file-positioner").getAttribute("data-side"),
        "bottom"
      )
      assert.strictEqual(
        byId("file-positioner").getAttribute("data-align"),
        "start"
      )
      assert.strictEqual(document.activeElement, item("new"))
      assert.deepStrictEqual(log(), ["file RequestedOpen list-navigation"])
    }))

  it.effect("an arrow key in an open menu opens the next menu, after a click or the keyboard", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      mousedown(byId("file"))
      yield* tick
      assert.isTrue(shown("file-positioner"))
      assert.strictEqual(byId("bar").getAttribute("data-has-submenu-open"), "")
      assert.strictEqual(
        byId("bar").getAttribute("data-part-state"),
        "horizontal:true:false:true"
      )
      keydown(document.activeElement!, "ArrowRight")
      yield* tick
      assert.isFalse(shown("file-positioner"))
      assert.isTrue(shown("edit-positioner"))
      assert.strictEqual(document.activeElement, item("copy"))
      assert.strictEqual(
        byId("edit-positioner").getAttribute("data-instant"),
        "group"
      )
      keydown(item("copy"), "ArrowLeft")
      yield* tick
      assert.isTrue(shown("file-positioner"))
      assert.isFalse(shown("edit-positioner"))
      assert.strictEqual(document.activeElement, item("new"))
      keydown(item("new"), "ArrowLeft")
      yield* tick
      assert.isTrue(shown("view-positioner"))
      keydown(item("zoom"), "Escape")
      yield* tick
      assert.isFalse(shown("view-positioner"))
      assert.strictEqual(document.activeElement, byId("view"))
      assert.isUndefined(byId("bar").dataset.hasSubmenuOpen)
      assert.strictEqual(
        byId("bar").getAttribute("data-part-state"),
        "horizontal:true:false:false"
      )
      assert.deepStrictEqual(log(), [
        "file RequestedOpen trigger-press",
        "edit RequestedOpen list-navigation",
        "file RequestedOpen list-navigation",
        "view RequestedOpen list-navigation",
        "view RequestedClose escape-key"
      ])
    }))

  it.effect("hovering a trigger opens its menu only while another menu is open", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ independent: true })
      byId("edit").dispatchEvent(new MouseEvent("mouseenter"))
      yield* tick
      assert.isFalse(shown("edit-positioner"))
      mousedown(byId("file"))
      yield* tick
      let refocused = false
      byId("file").addEventListener("focus", () => {
        refocused = true
      })
      byId("edit").dispatchEvent(new MouseEvent("mouseenter"))
      yield* tick
      assert.isTrue(shown("edit-positioner"))
      assert.isFalse(shown("file-positioner"))
      assert.isFalse(refocused)
      byId("edit").dispatchEvent(new MouseEvent("mouseleave"))
      yield* tick
      assert.isTrue(shown("edit-positioner"))
      mousedown(byId("edit"))
      yield* tick
      assert.isFalse(shown("edit-positioner"))
      assert.deepStrictEqual(log(), [
        "file RequestedOpen trigger-press",
        "edit RequestedOpen trigger-hover",
        "file RequestedClose sibling-open",
        "edit RequestedClose trigger-press"
      ])
    }))

  it.effect("ArrowRight opens a submenu from its trigger, and moves to the next menu from a submenu item", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      keydown(byId("file"), "ArrowDown")
      yield* tick
      keydown(item("new"), "ArrowDown")
      yield* tick
      assert.strictEqual(document.activeElement, item("share"))
      keydown(item("share"), "ArrowRight")
      yield* tick
      assert.isTrue(shown("share-positioner"))
      assert.isTrue(shown("file-positioner"))
      assert.strictEqual(document.activeElement, item("email"))
      keydown(item("email"), "ArrowRight")
      yield* tick
      assert.isFalse(shown("share-positioner"))
      assert.isFalse(shown("file-positioner"))
      assert.isTrue(shown("edit-positioner"))
      assert.strictEqual(document.activeElement, item("copy"))
      assert.includeMembers([...log()], [
        "share RequestedOpen list-navigation",
        "edit RequestedOpen list-navigation"
      ])
    }))

  it.effect("a vertical menubar moves with ArrowDown, opens with ArrowRight and closes with ArrowLeft", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const { log } = yield* mountPage({ orientation: "vertical" })
        assert.strictEqual(
          byId("bar").getAttribute("aria-orientation"),
          "vertical"
        )
        assert.strictEqual(
          byId("bar").getAttribute("data-orientation"),
          "vertical"
        )
        byId("file").focus()
        keydown(byId("file"), "ArrowDown")
        yield* tick
        assert.strictEqual(document.activeElement, byId("edit"))
        assert.isFalse(shown("edit-positioner"))
        keydown(byId("edit"), "ArrowLeft")
        yield* tick
        assert.isFalse(shown("edit-positioner"))
        keydown(byId("edit"), "ArrowRight")
        yield* tick
        assert.isTrue(shown("edit-positioner"))
        assert.strictEqual(
          byId("edit-positioner").getAttribute("data-side"),
          "inline-end"
        )
        assert.strictEqual(
          byId("edit-positioner").getAttribute("data-align"),
          "start"
        )
        assert.strictEqual(document.activeElement, item("copy"))
        keydown(item("copy"), "ArrowDown")
        yield* tick
        assert.strictEqual(document.activeElement, item("paste"))
        keydown(item("paste"), "ArrowLeft")
        yield* tick
        assert.isFalse(shown("edit-positioner"))
        assert.strictEqual(document.activeElement, byId("edit"))
        assert.deepStrictEqual(log(), [
          "edit RequestedOpen list-navigation",
          "edit RequestedClose list-navigation"
        ])
      }))
      yield* mountPage({ orientation: "vertical", rtl: true })
      byId("edit").focus()
      keydown(byId("edit"), "ArrowLeft")
      yield* tick
      assert.isTrue(shown("edit-positioner"))
    }))

  it.effect("a menu open from the start counts as open, so hovering another trigger switches to it", () =>
    Effect.gen(function*() {
      yield* mountPage({ initial: ["file"] })
      assert.isTrue(shown("file-positioner"))
      assert.isTrue(byId("bar").hasAttribute("data-has-submenu-open"))
      let refocused = false
      byId("file").addEventListener("focus", () => {
        refocused = true
      })
      byId("edit").dispatchEvent(new MouseEvent("mouseenter"))
      yield* tick
      assert.isTrue(shown("edit-positioner"))
      assert.isFalse(shown("file-positioner"))
      assert.isFalse(refocused)
    }))

  it.effect("focus on another trigger while a menu is open switches to its menu, and a tap after it keeps it open", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      byId("edit").focus()
      yield* tick
      assert.isFalse(shown("edit-positioner"))
      mousedown(byId("file"))
      yield* tick
      byId("edit").focus()
      yield* tick
      assert.isTrue(shown("edit-positioner"))
      assert.isFalse(shown("file-positioner"))
      assert.strictEqual(
        document.activeElement?.getAttribute("aria-labelledby"),
        "edit"
      )
      byId("edit").dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          pointerType: "touch"
        })
      )
      byId("edit").dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "touch"
        })
      )
      yield* tick
      assert.isTrue(shown("edit-positioner"))
      assert.deepStrictEqual(log(), [
        "file RequestedOpen trigger-press",
        "edit RequestedOpen trigger-focus"
      ])
    }))

  it.effect("two triggers of one menu hand its popup over with the arrow keys and the pointer", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        yield* mountPage({ twin: true })
        byId("view").focus()
        keydown(byId("view"), "ArrowDown")
        yield* tick
        assert.strictEqual(byId("view").getAttribute("aria-expanded"), "true")
        keydown(document.activeElement!, "ArrowRight")
        yield* tick
        assert.strictEqual(byId("view2").getAttribute("aria-expanded"), "true")
        assert.strictEqual(byId("view").getAttribute("aria-expanded"), "false")
        assert.isTrue(shown("view-positioner"))
        assert.strictEqual(document.activeElement, item("zoom"))
        byId("view").dispatchEvent(new MouseEvent("mouseenter"))
        yield* tick
        assert.strictEqual(byId("view").getAttribute("aria-expanded"), "true")
        assert.strictEqual(byId("view2").getAttribute("aria-expanded"), "false")
      }))
      yield* mountPage({ initial: ["view"], twin: true })
      assert.strictEqual(byId("view").getAttribute("aria-expanded"), "true")
      keydown(
        byId("view-positioner").querySelector("[role=menu]")!,
        "ArrowRight"
      )
      yield* tick
      assert.strictEqual(byId("view2").getAttribute("aria-expanded"), "true")
      assert.strictEqual(byId("view").getAttribute("aria-expanded"), "false")
      assert.strictEqual(document.activeElement, item("zoom"))
    }))

  it.effect("a menu that becomes modal while open blocks the page but for the menubar", () =>
    Effect.gen(function*() {
      const { root } = yield* mountPage()
      root.send(Message.ChangedModal({ modal: false }))
      mousedown(byId("file"))
      yield* tick
      assert.isFalse(byId("bar").hasAttribute("data-modal"))
      assert.isNull(
        byId("file-positioner").querySelector("[data-menu-blocker]")
      )
      root.send(Message.ChangedModal({ modal: true }))
      yield* tick
      assert.strictEqual(byId("bar").getAttribute("data-modal"), "")
      const blocker = byId("file-positioner").querySelector<HTMLElement>(
        "[data-menu-blocker]"
      )!
      assert.isFalse(blocker.inert)
      assert.notStrictEqual(blocker.style.getPropertyValue("clip-path"), "")
    }))

  it.effect("a disabled first menu hands the Tab stop to the next trigger, on the server too", () =>
    Effect.gen(function*() {
      const { html } = yield* HtmlServer.renderToHtml(Page, {
        orientation: "horizontal",
        disabled: false,
        fileDisabled: true,
        independent: false,
        rtl: false,
        initial: [],
        twin: false
      })
      assert.deepStrictEqual(
        Array.from(
          html.matchAll(
            /<button id="(?:file|edit|view)"[^>]*?tabindex="([^"]*)"/g
          ),
          (match) => match[1]
        ),
        ["-1", "0", "-1"]
      )
      yield* mountPage({ fileDisabled: true })
      assert.isTrue(byId("file").hasAttribute("disabled"))
      assert.deepStrictEqual(tabindexes(), ["-1", "0", "-1"])
      byId("edit").focus()
      keydown(byId("edit"), "ArrowLeft")
      yield* tick
      assert.strictEqual(document.activeElement, byId("view"))
    }))

  it.effect("a disabled menubar disables every trigger and keeps none in the Tab order", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ disabled: true })
      assert.deepStrictEqual(tabindexes(), ["-1", "-1", "-1"])
      assert.isTrue(
        ["file", "edit", "view"].every((id) =>
          byId(id).hasAttribute("disabled")
        )
      )
      mousedown(byId("file"))
      yield* tick
      assert.isFalse(shown("file-positioner"))
      assert.deepStrictEqual(log(), [])
    }))
})
