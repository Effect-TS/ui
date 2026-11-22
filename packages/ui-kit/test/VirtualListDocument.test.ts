// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { VirtualList, type VirtualListProps, VirtualListScrollTarget, type VirtualListScrollTo } from "@effect/ui-kit"
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
    let stored = 0
    const scroller = () => document.querySelector<HTMLElement>(".viewport")!
    const list = () => document.querySelector<HTMLElement>(".list")!
    const listHeight = () =>
      padding(list(), "start") + list().querySelectorAll(".item").length * itemSize + padding(list(), "end")
    const top = () => (stored = Math.max(0, Math.min(stored, listHeight() - 100)))
    Element.prototype.getBoundingClientRect = function(this: Element) {
      if (this.classList.contains("viewport")) return rect(0, 100)
      if (this.classList.contains("list")) return rect(-top(), listHeight())
      if (this.classList.contains("item")) {
        return rect(-top() + Number(this.getAttribute("data-index")) * itemSize, itemSize)
      }
      return original.call(this)
    }
    const install = () => {
      const element = scroller()
      Object.defineProperty(element, "clientHeight", { configurable: true, value: 100 })
      Object.defineProperty(element, "scrollHeight", { configurable: true, get: listHeight })
      Object.defineProperty(element, "scrollTop", {
        configurable: true,
        get: top,
        set: (value: number) => {
          stored = value
          top()
        }
      })
      element.scrollTo = ((options: ScrollToOptions) => {
        element.scrollTop = options.top ?? top()
        setTimeout(() => element.dispatchEvent(new Event("scroll")), 0)
      }) as typeof element.scrollTo
    }
    const scrollTo = (top: number) => {
      scroller().scrollTop = top
      scroller().dispatchEvent(new Event("scroll"))
    }
    const relayout = () => scroller().dispatchEvent(new Event("scroll"))
    return { install, scrollTo, relayout, scrollTop: top, original }
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

const Steps = Effect.fnUntraced(function*(steps: ReadonlyArray<Partial<VirtualListProps>>) {
  const geometry = yield* layout
  const Message = UiSchema.TaggedEnum({ Advanced: {} })
  const Demo = Component.define({
    name: "Demo",
    scoped: false,
    model: Schema.Struct({ step: Schema.Number }),
    message: Message,
    elements: Html
  }).make({
    init: () => ({ step: 0 }),
    update: { Advanced: (model) => ({ step: model.step + 1 }) },
    view: (model, h) =>
      h.div.children(
        h.button.class("next").onClick(Message.Advanced()).children("Next"),
        VirtualList(h, {
          props: { count: 1000, itemSize, ...steps[model.step] },
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
  yield* tick
  const next = Effect.gen(function*() {
    click(app.querySelector(".next")!)
    yield* tick
    yield* tick
  })
  return { ...geometry, next }
})

const keysWith = (count: number, index: number, key: string) =>
  Array.from({ length: count }, (_, i) => (i === index ? key : "k" + i))

const toKey = (key: string, id?: string): VirtualListScrollTo => ({
  target: VirtualListScrollTarget.Key({ key }),
  ...(id === undefined ? {} : { id })
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
      const { next, scrollTop } = yield* Steps([
        { count: 0, scrollTo: { target: VirtualListScrollTarget.Index({ index: 500 }) } },
        {}
      ])
      yield* next
      assert.strictEqual(scrollTop(), 500 * itemSize)
    }))

  it.effect("scrolls to a newer request that replaced the first while the list was empty", () =>
    Effect.gen(function*() {
      const { next, scrollTop } = yield* Steps([
        { count: 0, scrollTo: { target: VirtualListScrollTarget.Index({ index: 500 }) } },
        { count: 0, scrollTo: { target: VirtualListScrollTarget.Index({ index: 100 }) } },
        {}
      ])
      yield* next
      yield* next
      assert.strictEqual(scrollTop(), 100 * itemSize)
    }))

  it.effect("keeps waiting for a key when shrinking the list clamps the scroll position", () =>
    Effect.gen(function*() {
      const { next, relayout, scrollTop } = yield* Steps([
        { scrollTo: { target: VirtualListScrollTarget.End() } },
        { scrollTo: toKey("wanted") },
        { count: 500 },
        { count: 500, keys: keysWith(500, 100, "wanted") }
      ])
      assert.strictEqual(scrollTop(), 1000 * itemSize - 100)
      yield* next
      yield* next
      assert.strictEqual(scrollTop(), 500 * itemSize - 100)
      relayout()
      yield* tick
      yield* next
      assert.strictEqual(scrollTop(), 100 * itemSize)
    }))

  it.effect("drops a waiting key when the user scrolls", () =>
    Effect.gen(function*() {
      const { next, scrollTo, scrollTop } = yield* Steps([
        { scrollTo: { target: VirtualListScrollTarget.End() } },
        { scrollTo: toKey("wanted") },
        { count: 500 },
        { count: 500, keys: keysWith(500, 100, "wanted") }
      ])
      yield* next
      yield* next
      scrollTo(4000)
      yield* tick
      yield* next
      assert.strictEqual(scrollTop(), 4000)
    }))

  it.effect("scrolls to a key requested again after another request replaced it", () =>
    Effect.gen(function*() {
      const { next, scrollTop } = yield* Steps([
        {},
        { scrollTo: toKey("wanted") },
        { scrollTo: { target: VirtualListScrollTarget.Index({ index: 200 }) } },
        { scrollTo: toKey("wanted") },
        {},
        { keys: keysWith(1000, 100, "wanted") }
      ])
      yield* next
      yield* next
      assert.strictEqual(scrollTop(), 200 * itemSize)
      yield* next
      yield* next
      yield* next
      assert.strictEqual(scrollTop(), 100 * itemSize)
    }))

  it.effect("ignores a key passed again unchanged, and follows it again with a new id", () =>
    Effect.gen(function*() {
      const keys = keysWith(1000, 100, "wanted")
      const { next, scrollTo, scrollTop } = yield* Steps([
        { keys, scrollTo: toKey("wanted") },
        { keys },
        { keys, scrollTo: toKey("wanted") },
        { keys, scrollTo: toKey("wanted", "again") }
      ])
      assert.strictEqual(scrollTop(), 100 * itemSize)
      scrollTo(6000)
      yield* tick
      yield* next
      yield* next
      assert.strictEqual(scrollTop(), 6000)
      yield* next
      assert.strictEqual(scrollTop(), 100 * itemSize)
    }))
})
