import type { Component, Mount, View } from "@effect/ui"
import { VirtualList, VirtualListEvents, type VirtualListProps, VirtualListScrollTarget } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof VirtualList>
type H = View.Helper<never, VirtualListProps> & View.Tags<Html.Elements, never>

const viewportLoc = Locator.attr("class", "viewport")
const listLoc = Locator.attr("class", "list")
const itemLoc = Locator.attr("class", "item")

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered): Track =>
  (s.get(listLoc) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Track
const argsOf = (s: Rendered) => tracked(s).args as Record<string, unknown>
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never
const moved = (start: number, height = 100, fields: object = {}) =>
  sent("MovedViewport", { start, height, anchor: null, atStart: start <= 0, atEnd: false, scrolled: null, ...fields })
const scrolled = (first: number, last: number, edges: { readonly atStart?: boolean; readonly atEnd?: boolean } = {}) =>
  VirtualListEvents.Scrolled({ first, last, atStart: edges.atStart ?? first === 0, atEnd: edges.atEnd ?? false })

type Scene = { readonly all: (locator: Locator.Locator) => ReadonlyArray<Locator.Node> }
const indices = (s: Scene) => s.all(itemLoc).map((node) => Number(node.attrs?.["data-index"]))
const span = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i)

const makeStandIn = (snapshot: (parts: Parts) => void = () => {}) => ({
  elements: Html,
  view: (virtualList: Parts, h: H) => {
    snapshot(virtualList)
    return virtualList.viewport(h.div.class("viewport")).children(
      virtualList.list(h.ul.class("list").attr("style", "color:red")).children(
        virtualList.items.map((index) =>
          virtualList.item({ element: h.li.class("item").key(String(index)), index }).children(String(index))
        )
      )
    )
  }
})

const base: VirtualListProps = { count: 1000, itemSize: 20 }

describe("VirtualList", () => {
  it.effect("renders the first rows with roles, positions and padding for the rest", () =>
    Effect.gen(function*() {
      let latest!: Parts
      const s = yield* Scene.make(VirtualList, base, makeStandIn((p) => (latest = p)))
      s.expectMount(tracked(s))

      assert.deepStrictEqual(indices(s), span(0, 3))
      assert.strictEqual(latest.count, 1000)
      assert.strictEqual(latest.atEnd, false)
      assert.strictEqual(s.get(viewportLoc).attrs?.["data-virtual-list-viewport"], argsOf(s).id)
      assert.strictEqual(s.get(listLoc).attrs?.role, "list")
      assert.strictEqual(
        s.get(listLoc).attrs?.style,
        "color:red;padding-block-start:0px;padding-block-end:19920px;overflow-anchor:none"
      )
      const first = s.all(itemLoc)[0]!
      assert.strictEqual(first.attrs?.role, "listitem")
      assert.strictEqual(first.attrs?.["aria-posinset"], "1")
      assert.strictEqual(first.attrs?.["aria-setsize"], "1000")
      assert.strictEqual(first.attrs?.["data-index"], "0")
      assert.strictEqual(first.attrs?.["data-key"], undefined)
    }))

  it.effect("keeps a role the consumer sets", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, { ...base, initialCount: 1 }, {
        elements: Html,
        view: (virtualList: Parts, h: H) =>
          virtualList.list(h.div.class("list").attr("role", "feed")).children(
            virtualList.items.map((index) =>
              virtualList.item({ element: h.div.class("item").attr("role", "article"), index })
            )
          )
      })
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(listLoc).attrs?.role, "feed")
      assert.strictEqual(s.get(itemLoc).attrs?.role, "article")
    }))

  it.effect("renders the rows around the viewport and reports the visible items", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, base, makeStandIn())

      s.mounted(tracked(s), moved(0)).emitted(scrolled(0, 4))
      assert.deepStrictEqual(indices(s), span(0, 7))

      s.mounted(tracked(s), moved(1000)).emitted(scrolled(50, 54))
      assert.deepStrictEqual(indices(s), span(47, 57))
      assert.strictEqual(
        s.get(listLoc).attrs?.style,
        "color:red;padding-block-start:940px;padding-block-end:18840px;overflow-anchor:none"
      )
      assert.deepStrictEqual(argsOf(s).first, { start: 1000, end: 1020 })
      assert.deepStrictEqual(argsOf(s).last, { start: 1080, end: 1100 })

      s.mounted(tracked(s), moved(1010, 90))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("keeps measured sizes and estimates the rest from their average", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, { ...base, overscan: 0 }, makeStandIn())
      s.mounted(tracked(s), moved(0)).emitted(scrolled(0, 4))
      s.mounted(
        tracked(s),
        sent("MeasuredItems", {
          epoch: 0,
          width: 300,
          items: span(0, 4).map((index) => ({ index, key: null, top: index * 40, left: 0, size: 40 }))
        })
      ).emitted(scrolled(0, 2))
      assert.deepStrictEqual(indices(s), span(0, 2))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-end:39880px")
    }))

  it.effect("reads the lanes and the gap of a grid from the rendered items", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, { ...base, overscan: 0, measure: false }, makeStandIn())
      s.mounted(tracked(s), moved(0)).emitted(scrolled(0, 4))
      const cell = (index: number) => ({
        index,
        key: null,
        top: Math.floor(index / 3) * 30,
        left: (index % 3) * 100,
        size: 20
      })
      s.mounted(tracked(s), sent("MeasuredItems", { epoch: 0, width: 300, items: span(0, 4).map(cell) }))
        .emitted(scrolled(0, 14))
      assert.strictEqual(argsOf(s).epoch, 1)
      assert.deepStrictEqual(indices(s), span(0, 14))

      s.mounted(tracked(s), sent("MeasuredItems", { epoch: 1, width: 300, items: span(0, 14).map(cell) }))
        .emitted(scrolled(0, 11))
      assert.deepStrictEqual(indices(s), span(0, 11))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-end:9900px")

      s.mounted(tracked(s), sent("MeasuredItems", { epoch: 0, width: 300, items: [cell(0)] }))
      assert.strictEqual(argsOf(s).epoch, 1)
    }))

  it.effect("keeps the focused item rendered apart from the visible rows", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, { ...base, overscan: 0 }, makeStandIn())
      s.mounted(tracked(s), moved(0)).emitted(scrolled(0, 4))
      s.mounted(tracked(s), sent("FocusedItem", { index: 2, key: null }))
      s.mounted(tracked(s), moved(1000)).emitted(scrolled(50, 54))

      assert.deepStrictEqual(indices(s), [...span(1, 3), ...span(50, 54)])
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-start:20px")
      const pushed = s.all(itemLoc).find((node) => node.attrs?.["data-index"] === "50")!
      assert.strictEqual(pushed.attrs?.style, "margin-block-start:920px")

      s.mounted(tracked(s), sent("BlurredItems"))
      assert.deepStrictEqual(indices(s), span(50, 54))
    }))

  it.effect("passes a scroll request to the mount until the list reports it", () =>
    Effect.gen(function*() {
      const scrollTo = { target: VirtualListScrollTarget.Index({ index: 500 }), align: "center" as const }
      const s = yield* Scene.make(VirtualList, { ...base, overscan: 0, scrollTo }, makeStandIn())
      assert.deepStrictEqual(argsOf(s).request, { scrollTo, index: 500, offset: null })
      assert.deepStrictEqual(indices(s), [500])

      s.mounted(tracked(s), moved(9960, 100, { scrolled: scrollTo }))
        .emitted(scrolled(498, 502))
      assert.strictEqual(argsOf(s).request, null)
      assert.deepStrictEqual(indices(s), span(498, 502))

      const again = { ...scrollTo, id: 2 }
      s.props({ ...base, overscan: 0, scrollTo: again })
      assert.deepStrictEqual(argsOf(s).request, { scrollTo: again, index: 500, offset: null })
      assert.deepStrictEqual(indices(s), span(498, 502))
    }))

  it.effect("keeps the first request until the items arrive, after the prop is dropped", () =>
    Effect.gen(function*() {
      const scrollTo = { target: VirtualListScrollTarget.Index({ index: 500 }) }
      const s = yield* Scene.make(VirtualList, { ...base, count: 0, overscan: 0, scrollTo }, makeStandIn())
      s.expectMount(tracked(s))
      assert.strictEqual(argsOf(s).request, null)
      assert.strictEqual(argsOf(s).waiting, true)

      s.props({ ...base, overscan: 0 })
      assert.deepStrictEqual(argsOf(s).request, { scrollTo, index: 500, offset: null })
      assert.deepStrictEqual(indices(s), [500])

      s.mounted(tracked(s), moved(10000, 100, { scrolled: scrollTo })).emitted(scrolled(500, 504))
      assert.strictEqual(argsOf(s).request, null)
      assert.strictEqual(argsOf(s).waiting, false)
    }))

  it.effect("drops a waiting request for a newer one", () =>
    Effect.gen(function*() {
      const first = { target: VirtualListScrollTarget.Index({ index: 500 }) }
      const newer = { target: VirtualListScrollTarget.Index({ index: 100 }) }
      const s = yield* Scene.make(VirtualList, { ...base, count: 0, overscan: 0, scrollTo: first }, makeStandIn())
      s.expectMount(tracked(s))

      s.props({ ...base, count: 0, overscan: 0, scrollTo: newer })
      assert.deepStrictEqual(argsOf(s).fresh, newer)
      s.mounted(tracked(s), sent("RequestedScroll", { scrollTo: newer }))
      assert.strictEqual(argsOf(s).fresh, null)

      s.props({ ...base, overscan: 0 })
      assert.deepStrictEqual(argsOf(s).request, { scrollTo: newer, index: 100, offset: null })
      assert.deepStrictEqual(indices(s), [100])
    }))

  it.effect("drops a waiting request when the user scrolls", () =>
    Effect.gen(function*() {
      const scrollTo = { target: VirtualListScrollTarget.Index({ index: 500 }) }
      const s = yield* Scene.make(VirtualList, { ...base, count: 0, overscan: 0, scrollTo }, makeStandIn())
      s.expectMount(tracked(s))
      s.mounted(tracked(s), sent("ScrolledByUser"))
      assert.strictEqual(argsOf(s).waiting, false)

      s.props({ ...base, overscan: 0, scrollTo })
      assert.strictEqual(argsOf(s).request, null)
      assert.deepStrictEqual(indices(s), [0])
    }))

  it.effect("waits for the key a request names", () =>
    Effect.gen(function*() {
      const scrollTo = { target: VirtualListScrollTarget.Key({ key: "k40" }) }
      const s = yield* Scene.make(VirtualList, { ...base, count: 100, overscan: 0, scrollTo }, makeStandIn())
      s.expectMount(tracked(s))
      assert.strictEqual(argsOf(s).request, null)
      assert.deepStrictEqual(indices(s), [0])

      const keys = span(0, 99).map((i) => "k" + i)
      s.props({ ...base, count: 100, keys, overscan: 0 })
      assert.deepStrictEqual(argsOf(s).request, { scrollTo, index: 40, offset: null })
      assert.deepStrictEqual(indices(s), [40])
    }))

  it.effect("reports reaching and leaving either edge while the rows stay", () =>
    Effect.gen(function*() {
      let latest!: Parts
      const s = yield* Scene.make(VirtualList, { ...base, overscan: 0 }, makeStandIn((p) => (latest = p)))
      s.mounted(tracked(s), moved(19908, 90)).emitted(scrolled(995, 999))
      s.mounted(tracked(s), moved(19910, 90, { atEnd: true })).emitted(scrolled(995, 999, { atEnd: true }))
      assert.strictEqual(latest.atEnd, true)
      assert.deepStrictEqual(indices(s), span(995, 999))
      s.mounted(tracked(s), moved(19909.5, 90, { atEnd: true }))
      assert.deepStrictEqual(s.current.emitted, [])
      s.mounted(tracked(s), moved(19900, 90)).emitted(scrolled(995, 999))
      assert.strictEqual(latest.atEnd, false)

      s.mounted(tracked(s), moved(0, 90)).emitted(scrolled(0, 4))
      assert.strictEqual(latest.atStart, true)
      s.mounted(tracked(s), moved(2, 90, { atStart: false })).emitted(scrolled(0, 4, { atStart: false }))
      assert.strictEqual(latest.atStart, false)
      assert.deepStrictEqual(indices(s), span(0, 4))
    }))

  it.effect("finds an item by key and keeps the position on it when items are added before it", () =>
    Effect.gen(function*() {
      const keys = span(0, 99).map((i) => "k" + i)
      const scrollTo = { target: VirtualListScrollTarget.Key({ key: "k40" }) }
      const s = yield* Scene.make(VirtualList, { ...base, count: 100, keys, overscan: 0, scrollTo }, makeStandIn())
      assert.deepStrictEqual(argsOf(s).request, { scrollTo, index: 40, offset: null })
      assert.strictEqual(s.get(itemLoc).attrs?.["data-key"], "k40")

      s.mounted(
        tracked(s),
        moved(800, 100, { anchor: { index: 40, key: "k40", offset: 0 }, scrolled: scrollTo })
      ).emitted(scrolled(40, 44))
      s.props({ ...base, count: 110, keys: [...span(0, 9).map((i) => "n" + i), ...keys], overscan: 0, scrollTo })
      assert.deepStrictEqual(indices(s), span(50, 54))
      assert.strictEqual(s.all(itemLoc)[0]!.attrs?.["data-key"], "k40")
      assert.strictEqual(s.all(itemLoc)[0]!.attrs?.["aria-posinset"], "51")
    }))

  it.effect("goes to the end and follows it while the list grows", () =>
    Effect.gen(function*() {
      const props = { ...base, count: 100, overscan: 0, followEnd: true, contentAlignment: "end" as const }
      let latest!: Parts
      const s = yield* Scene.make(VirtualList, props, makeStandIn((p) => (latest = p)))
      assert.strictEqual(argsOf(s).threshold, 1)
      s.mounted(tracked(s), moved(1900, 100, { atEnd: true })).emitted(scrolled(95, 99, { atEnd: true }))
      assert.strictEqual(latest.atEnd, true)

      s.props({ ...props, count: 103 })
      assert.deepStrictEqual(indices(s), span(98, 102))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-end:0px")
    }))

  it.effect("places a short list at the end of its viewport", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, { ...base, count: 2, contentAlignment: "end" }, makeStandIn())
      s.mounted(tracked(s), moved(0, 100)).emitted(scrolled(0, 1))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-start:60px")
      assert.strictEqual(argsOf(s).inset, 60)
    }))

  it.effect("uses the given sizes as they are without measuring", () =>
    Effect.gen(function*() {
      const sizes = [50, 50, 10, 10, 10, 10, 10, 10]
      const s = yield* Scene.make(
        VirtualList,
        { count: 8, itemSize: 0, sizes, measure: false, overscan: 0 },
        makeStandIn()
      )
      assert.strictEqual(argsOf(s).measure, false)
      s.mounted(tracked(s), moved(60, 60)).emitted(scrolled(1, 3))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-start:50px;padding-block-end:40px")
    }))

  it.effect("drops what it measured when the dataset changes", () =>
    Effect.gen(function*() {
      const props = { ...base, overscan: 0, dataset: "a" }
      const s = yield* Scene.make(VirtualList, props, makeStandIn())
      s.mounted(tracked(s), moved(0)).emitted(scrolled(0, 4))
      s.mounted(
        tracked(s),
        sent("MeasuredItems", {
          epoch: 0,
          width: 300,
          items: span(0, 4).map((index) => ({ index, key: null, top: index * 40, left: 0, size: 40 }))
        })
      ).emitted(scrolled(0, 2))
      s.props({ ...props, dataset: "b" })
      assert.strictEqual(argsOf(s).epoch, 1)
      assert.deepStrictEqual(indices(s), span(0, 4))
    }))

  it.effect("rejects tags the parts don't take", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<(virtualList: Parts, h: H) => View.Content<never>> = [
        (vl, h) => vl.viewport(h.span as never),
        (vl, h) => vl.list(h.span as never),
        (vl, h) => vl.list(h.div).children(vl.item({ element: h.span as never, index: 0 }))
      ]
      for (const render of cases) {
        const exit = yield* Effect.exit(Scene.make(VirtualList, base, { elements: Html, view: render }))
        assert.strictEqual(exit._tag, "Failure")
      }
    }))
})
