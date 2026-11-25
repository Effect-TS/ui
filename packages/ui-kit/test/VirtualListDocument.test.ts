// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import {
  VirtualList,
  type VirtualListEvents,
  type VirtualListProps,
  VirtualListScrollTarget,
  type VirtualListScrollTo
} from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { click, container, tick } from "./utils/document.ts"

const itemSize = 20

const padding = (element: Element, side: "start" | "end") =>
  Number(
    new RegExp("padding-block-" + side + ":([\\d.]+)px").exec(
      element.getAttribute("style") ?? ""
    )?.[1] ?? 0
  )

const rect = (top: number, height: number, width = 300) =>
  DOMRect.fromRect({ x: 0, y: top, width, height })

const layout = Effect.acquireRelease(
  Effect.sync(() => {
    const original = Element.prototype.getBoundingClientRect
    let stored = 0
    const scroller = () => document.querySelector<HTMLElement>(".viewport")!
    const list = () => document.querySelector<HTMLElement>(".list")!
    const listHeight = () =>
      padding(list(), "start") +
      list().querySelectorAll(".item").length * itemSize +
      padding(list(), "end")
    const top =
      () => (stored = Math.max(0, Math.min(stored, listHeight() - 100)))
    Element.prototype.getBoundingClientRect = function(this: Element) {
      if (this.classList.contains("viewport")) return rect(0, 100)
      if (this.classList.contains("list")) return rect(-top(), listHeight())
      if (this.classList.contains("item")) {
        return rect(
          -top() + Number(this.getAttribute("data-index")) * itemSize,
          itemSize
        )
      }
      return original.call(this)
    }
    const install = () => {
      const element = scroller()
      Object.defineProperty(element, "clientHeight", {
        configurable: true,
        value: 100
      })
      Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        get: listHeight
      })
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
  ({ original }) =>
    Effect.sync(() => (Element.prototype.getBoundingClientRect = original))
)

const Steps = Effect.fnUntraced(function*(
  steps: ReadonlyArray<Partial<VirtualListProps>>,
  { ownViewport = false }: { readonly ownViewport?: boolean } = {}
) {
  const geometry = yield* layout
  const events: Array<VirtualListEvents> = []
  const Message = UiSchema.TaggedEnum({ Advanced: {} })
  const Demo = Html.component({
    name: "Demo",
    model: Schema.Struct({ step: Schema.Number }),
    message: Message
  }).make({
    init: () => ({ step: 0 }),
    update: { Advanced: ($) => ({ step: $.model.step + 1 }) },
    view: (h, model) =>
      h.div.children(
        h.button.class("next").onClick(Message.Advanced()).children("Next"),
        VirtualList(h, {
          props: { count: 1000, itemSize, ...steps[model.step] },
          onEmit: (event) => {
            events.push(event)
            return undefined
          },
          view: (virtualList) =>
            (ownViewport
              ? h.div.class("viewport").attr("style", "overflow-y:visible")
              : virtualList.viewport(h.div.class("viewport"))).children(
                virtualList.list(h.ul.class("list")).children(
                  virtualList.items.map((index) =>
                    virtualList.item({
                      element: h.li.class("item").key(
                        steps[model.step]?.keys?.[index] ?? String(index)
                      ),
                      index
                    }).children(
                      h.button.children("Item " + index)
                    )
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
  const indices = () =>
    Array.from(
      app.querySelectorAll(".item"),
      (item) => Number(item.getAttribute("data-index"))
    )
  const item = (index: number) =>
    app.querySelector<HTMLElement>(`.item[data-index="${index}"]`)!
  return { ...geometry, next, indices, item, events }
})

const keysWith = (count: number, index: number, key: string) =>
  Array.from({ length: count }, (_, i) => (i === index ? key : "k" + i))

const toKey = (key: string, id?: string): VirtualListScrollTo => ({
  target: VirtualListScrollTarget.Key({ key }),
  ...(id === undefined ? {} : { id })
})

const span = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i)

describe("VirtualList in a document", { concurrent: false }, () => {
  it.effect("keeps the focused item rendered while the list scrolls away from it", () =>
    Effect.gen(function*() {
      const { indices, item, scrollTo } = yield* Steps([{}])
      const button = item(2).querySelector("button")!
      button.focus()
      yield* tick

      scrollTo(1000)
      yield* tick
      assert.deepStrictEqual(indices(), [...span(1, 3), ...span(47, 57)])
      assert.strictEqual(document.activeElement, button)
      assert.strictEqual(item(47).style.marginBlockStart, "860px")

      button.blur()
      yield* tick
      assert.deepStrictEqual(indices(), span(47, 57))
    }))

  it.effect("lets the keyboard reach the viewport while its content overflows", () =>
    Effect.gen(function*() {
      const { next } = yield* Steps([{}, { count: 2 }])
      const viewport = document.querySelector(".viewport")!
      assert.strictEqual(viewport.getAttribute("tabindex"), "0")
      yield* next
      assert.strictEqual(viewport.getAttribute("tabindex"), "-1")
    }))

  it.effect("moves the focus from a removed item to the next one, the one before, then the viewport", () =>
    Effect.gen(function*() {
      const keys = Array.from({ length: 1000 }, (_, i) => "k" + i)
      const added = [...Array.from({ length: 100 }, (_, i) => "n" + i), ...keys]
      const { item, next, scrollTo } = yield* Steps([
        { keys },
        { keys: added },
        { keys: added.filter((key) => key !== "k1") },
        { keys: ["k0", "k2"] },
        { keys: ["k0"] },
        { keys: [] }
      ])
      const focusedKey = () =>
        document.activeElement?.closest(".item")?.getAttribute("data-key")
      item(1).querySelector("button")!.focus()
      yield* tick
      yield* next
      scrollTo(10000)
      yield* tick
      yield* next
      assert.strictEqual(focusedKey(), "k2")
      yield* next
      yield* next
      assert.strictEqual(focusedKey(), "k0")
      yield* next
      assert.strictEqual(
        document.activeElement,
        document.querySelector(".viewport")
      )
    }))

  it.effect("moves the focus from the last item to the list without a viewport", () =>
    Effect.gen(function*() {
      const { item, next } = yield* Steps([{ count: 1 }, { count: 0 }], {
        ownViewport: true
      })
      item(0).querySelector("button")!.focus()
      yield* tick
      yield* next
      const list = document.querySelector<HTMLElement>(".list")!
      assert.strictEqual(document.activeElement, list)
      list.blur()
      assert.strictEqual(list.getAttribute("tabindex"), null)
    }))

  it.effect("scrolls with the nearest element that scrolls, once it starts to after the list mounts", () =>
    Effect.gen(function*() {
      const { indices, next, scrollTo, scrollTop } = yield* Steps([
        { scrollContainer: "nearest" },
        {
          scrollContainer: "nearest",
          scrollTo: { target: VirtualListScrollTarget.Index({ index: 500 }) }
        }
      ], { ownViewport: true })
      document.querySelector(".viewport")!.setAttribute(
        "style",
        "overflow-y:auto"
      )
      yield* tick
      scrollTo(1000)
      yield* tick
      assert.deepStrictEqual(indices(), span(47, 57))
      yield* next
      assert.strictEqual(scrollTop(), 500 * itemSize)
    }))

  it.effect("scrolls to a request once its items load, after the parent drops it", () =>
    Effect.gen(function*() {
      const { next, scrollTop } = yield* Steps([
        {
          count: 0,
          scrollTo: {
            target: VirtualListScrollTarget.Index({ index: 500 }),
            align: "end"
          }
        },
        {}
      ])
      yield* next
      assert.strictEqual(scrollTop(), 501 * itemSize - 100)
    }))

  it.effect("scrolls to a newer request that replaced the first while the list was empty", () =>
    Effect.gen(function*() {
      const { next, scrollTop } = yield* Steps([
        {
          count: 0,
          scrollTo: { target: VirtualListScrollTarget.Index({ index: 500 }) }
        },
        {
          count: 0,
          scrollTo: { target: VirtualListScrollTarget.Index({ index: 100 }) }
        },
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

  it.effect("drops a waiting key when the user scrolls 1px up from a clamped position", () =>
    Effect.gen(function*() {
      const { next, relayout, scrollTo, scrollTop } = yield* Steps([
        { scrollTo: { target: VirtualListScrollTarget.End() } },
        { scrollTo: toKey("wanted") },
        { count: 500 },
        { count: 500, keys: keysWith(500, 100, "wanted") }
      ])
      yield* next
      yield* next
      relayout()
      yield* tick
      assert.strictEqual(scrollTop(), 500 * itemSize - 100)
      scrollTo(500 * itemSize - 101)
      yield* tick
      yield* next
      assert.strictEqual(scrollTop(), 500 * itemSize - 101)
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

  it.effect("keeps the item in view in place when keyed items are added before it", () =>
    Effect.gen(function*() {
      const keys = Array.from({ length: 1000 }, (_, i) => "k" + i)
      const added = (
        count: number
      ) => [...Array.from({ length: count }, (_, i) => "n" + i), ...keys]
      const { next, scrollTo, scrollTop } = yield* Steps([
        { keys, scrollTo: toKey("k100") },
        { count: 1010, keys: added(10), scrollTo: toKey("k100") },
        { count: 1020, keys: added(20), scrollTo: toKey("k100") }
      ])
      assert.strictEqual(scrollTop(), 100 * itemSize)
      yield* next
      assert.strictEqual(scrollTop(), 110 * itemSize)

      scrollTo(4000)
      yield* tick
      yield* next
      assert.strictEqual(scrollTop(), 4200)
    }))

  it.effect("reports a list that grows without a scroll once with trackScroll, and not without it", () =>
    Effect.gen(function*() {
      const tracked = yield* Steps([{ trackScroll: true }, {
        trackScroll: true,
        count: 1001
      }])
      tracked.events.length = 0
      yield* tracked.next
      assert.deepStrictEqual(tracked.events.map((event) => event.length), [
        1001 * itemSize
      ])

      const quiet = yield* Steps([{}, { count: 1001 }])
      quiet.events.length = 0
      yield* quiet.next
      assert.deepStrictEqual(quiet.events, [])
    }))

  it.effect("follows the end as the list grows until the user scrolls away from it", () =>
    Effect.gen(function*() {
      const { next, scrollTo, scrollTop } = yield* Steps([
        { followEnd: true },
        { followEnd: true, count: 1010 },
        { followEnd: true, count: 1020 }
      ])
      scrollTo(1000 * itemSize - 100)
      yield* tick
      yield* next
      assert.strictEqual(scrollTop(), 1010 * itemSize - 100)

      scrollTo(4000)
      yield* tick
      yield* next
      assert.strictEqual(scrollTop(), 4000)
    }))
})
