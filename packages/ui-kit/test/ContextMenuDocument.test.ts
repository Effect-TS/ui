// @vitest-environment happy-dom
import { UiSchema, type View } from "@effect/ui"
import { ContextMenu, Menu } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, popovers, press, tick } from "./utils/document.ts"

const items = [{ value: "copy", label: "Copy" }]

const PageMessage = UiSchema.TaggedEnum({
  RequestedOpen: { menu: Schema.String, reason: Schema.String },
  RequestedClose: { menu: Schema.String, reason: Schema.String },
  Picked: { menu: Schema.String, value: Schema.String }
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({
    disabled: Schema.Boolean,
    refuseClose: Schema.Boolean
  }),
  model: Schema.Struct({
    outer: Schema.Boolean,
    inner: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: PageMessage
}).make({
  init: () => ({ outer: false, inner: false, log: [] }),
  update: {
    RequestedOpen: ($, { menu, reason }) => ({
      ...$.model,
      [menu]: true,
      log: [...$.model.log, menu + " RequestedOpen " + reason]
    }),
    RequestedClose: ($, { menu, reason }) => ({
      ...$.model,
      [menu]: $.props.refuseClose && $.model[menu as "outer" | "inner"],
      log: [...$.model.log, menu + " RequestedClose " + reason]
    }),
    Picked: ($, { menu, value }) => ({
      ...$.model,
      log: [...$.model.log, menu + " Picked " + value]
    })
  },
  view: (h, model) => {
    const menu = (
      name: "outer" | "inner",
      inside?: View.Content<typeof PageMessage.Type, any>
    ) =>
      ContextMenu(h, {
        key: name,
        props: { open: model[name], items, disabled: h.props.disabled },
        onEmit: {
          RequestedOpen: ({ reason }) =>
            PageMessage.RequestedOpen({ menu: name, reason }),
          RequestedClose: ({ reason }) =>
            PageMessage.RequestedClose({ menu: name, reason }),
          Picked: ({ value }) => PageMessage.Picked({ menu: name, value }),
          Highlighted: () => undefined,
          Settled: () => undefined
        },
        view: (contextMenu) =>
          h.div(
            contextMenu.trigger(h.div.attr("id", name)).children(
              name,
              inside ?? ""
            ),
            contextMenu.backdrop(h.div.attr("id", name + "-backdrop")),
            contextMenu.positioner(h.div.attr("id", name + "-positioner"))
              .children(
                contextMenu.popup(h.div).children(
                  contextMenu.item({
                    element: h.div.attr("data-testid", name + "-copy"),
                    value: "copy"
                  }).children("Copy")
                )
              )
          )
      })
    return h.div(
      h.button.attr("id", "before").attr("type", "button").children("Before"),
      menu("outer", menu("inner"))
    )
  }
})

const HybridMessage = UiSchema.TaggedEnum({
  RequestedOpen: {},
  RequestedClose: {}
})

const Hybrid = Html.component({
  name: "Hybrid",
  props: Schema.Struct({}),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: HybridMessage
}).make({
  init: () => ({ open: false }),
  update: {
    RequestedOpen: () => ({ open: true }),
    RequestedClose: () => ({ open: false })
  },
  view: (h, model) =>
    Menu(h, {
      props: { open: model.open, items },
      onEmit: {
        RequestedOpen: () => HybridMessage.RequestedOpen(),
        RequestedClose: () => HybridMessage.RequestedClose(),
        Picked: () => undefined,
        Highlighted: () => undefined,
        RequestedQuery: () => undefined,
        Settled: () => undefined
      },
      view: (menu) =>
        h.div(
          menu.trigger({ element: h.button.attr("id", "more") }).children(
            "More"
          ),
          menu.contextTrigger(h.div.attr("id", "area")).children("Area"),
          menu.positioner(h.div.attr("id", "hybrid-positioner")).children(
            menu.popup(h.div).children(
              menu.item({ element: h.div, value: "copy" }).children("Copy")
            )
          )
        )
    })
})

const withGeometry = (
  boxes: Readonly<
    Record<
      string,
      {
        readonly x: number
        readonly y: number
        readonly width: number
        readonly height: number
      }
    >
  >
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const element = window.Element.prototype as any
      const root = document.documentElement as any
      const saved = {
        rect: element.getBoundingClientRect,
        ResizeObserver: (window as any).ResizeObserver
      }
      ;(window as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      element.getBoundingClientRect = function(this: Element) {
        const { height, width, x, y } = boxes[this.id] ??
          { x: 0, y: 0, width: 0, height: 0 }
        return {
          x,
          y,
          width,
          height,
          left: x,
          top: y,
          right: x + width,
          bottom: y + height
        }
      }
      Object.defineProperty(root, "clientWidth", {
        configurable: true,
        value: 1000
      })
      Object.defineProperty(root, "clientHeight", {
        configurable: true,
        value: 800
      })
      return () => {
        element.getBoundingClientRect = saved.rect
        ;(window as any).ResizeObserver = saved.ResizeObserver
        delete root.clientWidth
        delete root.clientHeight
      }
    }),
    (restore) => Effect.sync(restore)
  )

const withPlatform = (platform: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const prevPlatform = Object.getOwnPropertyDescriptor(
        window.navigator,
        "platform"
      )
      const prevTouch = Object.getOwnPropertyDescriptor(
        window.navigator,
        "maxTouchPoints"
      )
      Object.defineProperty(window.navigator, "platform", {
        configurable: true,
        value: platform
      })
      Object.defineProperty(window.navigator, "maxTouchPoints", {
        configurable: true,
        value: 0
      })
      return () => {
        if (prevPlatform) {
          Object.defineProperty(window.navigator, "platform", prevPlatform)
        } else delete (window.navigator as any).platform
        if (prevTouch) {
          Object.defineProperty(window.navigator, "maxTouchPoints", prevTouch)
        } else delete (window.navigator as any).maxTouchPoints
      }
    }),
    (restore) => Effect.sync(restore)
  )

const mountPage = Effect.fnUntraced(
  function*(
    config: { readonly disabled?: boolean; readonly refuseClose?: boolean } = {}
  ) {
    yield* popovers
    const app = yield* container
    const root = yield* BrowserHost.mountEffect(Page, {
      disabled: false,
      refuseClose: false,
      ...config
    }, app)
    yield* tick
    return () => root.model()?.log ?? []
  }
)

const contextmenu = (
  target: Element,
  init: MouseEventInit = { clientX: 100, clientY: 50 }
) => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    ...init
  })
  target.dispatchEvent(event)
  return event
}
const popupOf = (name: string) =>
  byId(name + "-positioner").querySelector<HTMLElement>("[data-menu-popup]")!
const shown = (id: string) => byId(id).matches(":popover-open")

describe("ContextMenu in a document", { concurrent: false }, () => {
  it.effect("a right click opens it without the browser's menu, which stays away from the backdrop and popup, and Tab returns focus", () =>
    Effect.gen(function*() {
      const log = yield* mountPage()
      byId("before").focus()
      assert.isTrue(contextmenu(byId("outer")).defaultPrevented)
      yield* tick
      assert.isTrue(shown("outer-positioner"))
      assert.isTrue(shown("outer-backdrop"))
      assert.strictEqual(byId("before").getAttribute("aria-hidden"), "true")
      assert.notInclude(
        byId("outer-backdrop").getAttribute("style"),
        "pointer-events:none"
      )
      assert.isTrue(contextmenu(byId("outer-backdrop")).defaultPrevented)
      assert.isTrue(
        contextmenu(document.querySelector("[data-testid=outer-copy]")!)
          .defaultPrevented
      )
      assert.strictEqual(document.activeElement, popupOf("outer"))
      popupOf("outer").dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.isFalse(shown("outer-positioner"))
      assert.strictEqual(document.activeElement, byId("before"))
      assert.isNull(byId("before").getAttribute("aria-hidden"))
      assert.deepStrictEqual(log(), [
        "outer RequestedOpen trigger-press",
        "outer RequestedClose focus-out"
      ])
    }))

  it.effect("Tab that the consumer refuses to close on leaves the popup open and interactive", () =>
    Effect.gen(function*() {
      const log = yield* mountPage({ refuseClose: true })
      byId("before").focus()
      contextmenu(byId("outer"))
      yield* tick
      popupOf("outer").dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.deepStrictEqual(log(), [
        "outer RequestedOpen trigger-press",
        "outer RequestedClose focus-out"
      ])
      assert.isTrue(shown("outer-positioner"))
      assert.isNull(popupOf("outer").closest("[inert]"))
      const copy = document.querySelector<HTMLElement>(
        "[data-testid=outer-copy]"
      )!
      copy.focus()
      copy.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.isTrue(shown("outer-positioner"))
      assert.deepStrictEqual(log().slice(-2), [
        "outer Picked copy",
        "outer RequestedClose item-press"
      ])
    }))

  it.effect("a context menu inside another's trigger takes the right clicks on its own trigger", () =>
    Effect.gen(function*() {
      const log = yield* mountPage()
      contextmenu(byId("inner"))
      yield* tick
      assert.isTrue(shown("inner-positioner"))
      assert.isFalse(shown("outer-positioner"))
      press(document.body)
      yield* tick
      assert.isFalse(shown("inner-positioner"))
      contextmenu(byId("outer"))
      yield* tick
      assert.isTrue(shown("outer-positioner"))
      assert.isFalse(shown("inner-positioner"))
      assert.deepStrictEqual(log(), [
        "inner RequestedOpen trigger-press",
        "inner RequestedClose outside-press",
        "outer RequestedOpen trigger-press"
      ])
    }))

  it.effect("disabled, it leaves the browser's menu alone", () =>
    Effect.gen(function*() {
      const log = yield* mountPage({ disabled: true })
      assert.isFalse(contextmenu(byId("outer")).defaultPrevented)
      yield* tick
      assert.deepStrictEqual(log(), [])
    }))

  it.effect("keyboard opening anchors to the context area rather than the menu button", () =>
    Effect.gen(function*() {
      yield* popovers
      yield* withGeometry({
        more: { x: 10, y: 10, width: 60, height: 20 },
        area: { x: 200, y: 300, width: 120, height: 40 },
        "hybrid-positioner": { x: 0, y: 0, width: 100, height: 50 }
      })
      const app = yield* container
      yield* BrowserHost.mountEffect(Hybrid, {}, app)
      yield* tick
      contextmenu(byId("area"), { clientX: 0, clientY: 0 })
      yield* tick
      const pos = byId("hybrid-positioner")
      assert.strictEqual(pos.style.left, "200px")
      assert.strictEqual(pos.style.top, "340px")
    }).pipe(Effect.scoped))

  it.effect("releasing the right button over an item after dragging picks it on macOS and ignores it off macOS", () =>
    Effect.gen(function*() {
      const release = Effect.fnUntraced(function*(platform: string) {
        return yield* Effect.scoped(
          Effect.gen(function*() {
            yield* withPlatform(platform)
            const log = yield* mountPage()
            contextmenu(byId("outer"), { clientX: 100, clientY: 50 })
            yield* tick
            const item = document.querySelector("[data-testid=outer-copy]")!
            item.dispatchEvent(
              new MouseEvent("mouseup", {
                bubbles: true,
                cancelable: true,
                button: 2,
                clientX: 110,
                clientY: 60
              })
            )
            yield* tick
            return log()
          })
        )
      })
      assert.deepStrictEqual(yield* release("Linux x86_64"), [
        "outer RequestedOpen trigger-press"
      ])
      assert.deepStrictEqual(yield* release("MacIntel"), [
        "outer RequestedOpen trigger-press",
        "outer Picked copy",
        "outer RequestedClose item-press"
      ])
    }))
})
