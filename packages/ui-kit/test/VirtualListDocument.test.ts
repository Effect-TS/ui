// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { VirtualList, type VirtualListProps, VirtualListScrollTarget, VirtualListScrollTo } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { click, container, tick } from "./utils/document.ts"

const itemSize = 20

const padding = (element: Element, side: "start" | "end") =>
  Number(new RegExp("padding-block-" + side + ":([\\d.]+)px").exec(element.getAttribute("style") ?? "")?.[1] ?? 0)

const rect = (top: number, height: number, width = 300) => DOMRect.fromRect({ x: 0, y: top, width, height })

const layout = Effect.acquireRelease(
  Effect.sync(() => {
    const original = Element.prototype.getBoundingClientRect
    let scrollTop = 0
    const scroller = () => document.querySelector<HTMLElement>(".viewport")!
    const list = () => document.querySelector<HTMLElement>(".list")!
    const listHeight = () =>
      padding(list(), "start") + list().querySelectorAll(".item").length * itemSize + padding(list(), "end")
    Element.prototype.getBoundingClientRect = function(this: Element) {
      if (this.classList.contains("viewport")) return rect(0, 100)
      if (this.classList.contains("list")) return rect(-scrollTop, listHeight())
      if (this.classList.contains("item")) {
        return rect(-scrollTop + Number(this.getAttribute("data-index")) * itemSize, itemSize)
      }
      return original.call(this)
    }
    const install = () => {
      const element = scroller()
      Object.defineProperty(element, "clientHeight", { configurable: true, value: 100 })
      Object.defineProperty(element, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = Math.max(0, Math.min(value, listHeight() - 100))
        }
      })
      element.scrollTo = ((options: ScrollToOptions) => {
        element.scrollTop = options.top ?? scrollTop
        setTimeout(() => element.dispatchEvent(new Event("scroll")), 0)
      }) as typeof element.scrollTo
    }
    const scrollTo = (top: number) => {
      scroller().scrollTop = top
      scroller().dispatchEvent(new Event("scroll"))
    }
    return { install, scrollTo, scrollTop: () => scrollTop, original }
  }),
  ({ original }) => Effect.sync(() => (Element.prototype.getBoundingClientRect = original))
)

const mountList = Effect.fnUntraced(function*(props: Partial<VirtualListProps> = {}) {
  const geometry = yield* layout
  const Demo = Component.define({
    name: "Demo",
    scoped: false,
    model: Schema.Struct({}),
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => ({}),
    update: (model) => model,
    view: (_model, h) =>
      VirtualList(h, {
        props: { count: 1000, itemSize, ...props },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("viewport")).children(
            virtualList.list(h.ul.class("list")).children(
              virtualList.items.map((index) =>
                virtualList.item({ element: h.li.class("item").key(String(index)), index }).children(
                  h.button.children("Item " + index)
                )
              )
            )
          )
      })
  })
  const app = yield* container
  yield* BrowserHost.mountEffect(Demo, {}, app)
  geometry.install()
  yield* tick
  const indices = () => Array.from(app.querySelectorAll(".item"), (item) => Number(item.getAttribute("data-index")))
  const item = (index: number) => app.querySelector<HTMLElement>(`.item[data-index="${index}"]`)
  return { ...geometry, indices, item, list: app.querySelector<HTMLElement>(".list")! }
})

const Loader = Effect.fnUntraced(function*(scrollTo: VirtualListScrollTo) {
  const geometry = yield* layout
  const Message = UiSchema.TaggedEnum({ Loaded: {}, Retargeted: {} })
  const Demo = Component.define({
    name: "Demo",
    scoped: false,
    model: Schema.Struct({ count: Schema.Number, scrollTo: Schema.optional(VirtualListScrollTo) }),
    message: Message,
    elements: Html
  }).make({
    init: () => ({ count: 0, scrollTo }),
    update: {
      Loaded: () => ({ count: 1000 }),
      Retargeted: (model) => ({
        ...model,
        scrollTo: { target: VirtualListScrollTarget.Index({ index: 100 }) }
      })
    },
    view: (model, h) =>
      h.div.children(
        h.button.class("load").onClick(Message.Loaded()).children("Load"),
        h.button.class("retarget").onClick(Message.Retargeted()).children("Retarget"),
        VirtualList(h, {
          props: { count: model.count, itemSize, scrollTo: model.scrollTo },
          view: (virtualList) =>
            virtualList.viewport(h.div.class("viewport")).children(
              virtualList.list(h.ul.class("list")).children(
                virtualList.items.map((index) =>
                  virtualList.item({ element: h.li.class("item").key(String(index)), index })
                )
              )
            )
        })
      )
  })
  const app = yield* container
  yield* BrowserHost.mountEffect(Demo, {}, app)
  geometry.install()
  yield* tick
  return { ...geometry, press: (name: string) => click(app.querySelector(".".concat(name))!) }
})

const span = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i)

describe("VirtualList in a document", { concurrent: false }, () => {
  it.effect("renders the rows the viewport scrolls to", () =>
    Effect.gen(function*() {
      const { indices, list, scrollTo } = yield* mountList()
      scrollTo(0)
      yield* tick
      assert.deepStrictEqual(indices(), span(0, 7))

      scrollTo(1000)
      yield* tick
      assert.deepStrictEqual(indices(), span(47, 57))
      assert.strictEqual(padding(list, "start"), 940)
      assert.strictEqual(padding(list, "end"), 18840)
    }))

  it.effect("keeps the focused item rendered while the list scrolls away from it", () =>
    Effect.gen(function*() {
      const { indices, item, scrollTo } = yield* mountList()
      scrollTo(0)
      yield* tick
      const button = item(2)!.querySelector("button")!
      button.focus()
      yield* tick

      scrollTo(1000)
      yield* tick
      assert.deepStrictEqual(indices(), [...span(1, 3), ...span(47, 57)])
      assert.strictEqual(document.activeElement, button)
      assert.strictEqual(item(47)!.style.marginBlockStart, "860px")

      button.blur()
      yield* tick
      assert.deepStrictEqual(indices(), span(47, 57))
    }))

  it.effect("scrolls to a requested item once it's rendered", () =>
    Effect.gen(function*() {
      const { indices, scrollTop } = yield* mountList({
        scrollTo: { target: VirtualListScrollTarget.Index({ index: 500 }), align: "end" }
      })
      yield* tick
      assert.strictEqual(scrollTop(), 500 * itemSize + itemSize - 100)
      assert.deepStrictEqual(indices(), span(493, 503))
    }))

  it.effect("scrolls to the first request once the items load, after the parent drops it", () =>
    Effect.gen(function*() {
      const { press, scrollTop } = yield* Loader({ target: VirtualListScrollTarget.Index({ index: 500 }) })
      press("load")
      yield* tick
      yield* tick
      assert.strictEqual(scrollTop(), 500 * itemSize)
    }))

  it.effect("scrolls to a newer request that replaced the first while the list was empty", () =>
    Effect.gen(function*() {
      const { press, scrollTop } = yield* Loader({ target: VirtualListScrollTarget.Index({ index: 500 }) })
      press("retarget")
      yield* tick
      press("load")
      yield* tick
      yield* tick
      assert.strictEqual(scrollTop(), 100 * itemSize)
    }))
})
