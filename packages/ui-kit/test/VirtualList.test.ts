import type { Component, Mount, View } from "@effect/ui"
import { VirtualList, VirtualListEvents, type VirtualListProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof VirtualList>
type H = View.Helper<never, VirtualListProps> & View.Tags<Html.Elements, never>

const listLoc = Locator.attr("class", "list")
const itemLoc = Locator.attr("class", "item")

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered): Track =>
  (s.get(listLoc) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Track
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
    return virtualList.viewport(
      h.div.class("viewport").attr("data-virtual-list-viewport", "wrong")
    ).children(
      virtualList.list(h.ul.class("list").attr("style", "color:red")).children(
        virtualList.items.map((index) =>
          virtualList.item({
            element: h.li.class("item").key(String(index)).attrs({
              "data-virtual-list-item": "wrong",
              "data-index": "99",
              "data-key": "stale",
              "aria-posinset": "99",
              "aria-setsize": "1"
            }),
            index
          }).children(String(index))
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
      assert.strictEqual(s.get(listLoc).attrs?.role, "list")
      assert.strictEqual(
        s.get(listLoc).attrs?.style,
        "color:red;padding-block-start:0px;padding-block-end:19920px;overflow-anchor:none"
      )
      const viewportId = s.get(Locator.attr("class", "viewport")).attrs?.["data-virtual-list-viewport"]
      assert.isString(viewportId)
      assert.notStrictEqual(viewportId, "wrong")
      const first = s.all(itemLoc)[0]!
      assert.strictEqual(first.attrs?.role, "listitem")
      assert.strictEqual(first.attrs?.["aria-posinset"], "1")
      assert.strictEqual(first.attrs?.["aria-setsize"], "1000")
      assert.strictEqual(first.attrs?.["data-index"], "0")
      assert.strictEqual(first.attrs?.["data-key"], undefined)
      assert.strictEqual(first.attrs?.["data-virtual-list-item"], viewportId)
      s.props({ ...base, keys: ["row-0"] })
      assert.strictEqual(s.all(itemLoc)[0]!.attrs?.["data-key"], "row-0")
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
      assert.deepStrictEqual(indices(s), span(0, 14))

      s.mounted(tracked(s), sent("MeasuredItems", { epoch: 1, width: 300, items: span(0, 14).map(cell) }))
        .emitted(scrolled(0, 11))
      assert.deepStrictEqual(indices(s), span(0, 11))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-end:9900px")
      assert.isUndefined(s.get(Locator.attr("data-index", "0")).attrs?.style)
      assert.isUndefined(s.get(Locator.attr("data-index", "1")).attrs?.style)
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

  it.effect("places a short list at the end of its viewport", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(VirtualList, { ...base, count: 2, contentAlignment: "end" }, makeStandIn())
      s.mounted(tracked(s), moved(0, 100)).emitted(scrolled(0, 1))
      assert.include(s.get(listLoc).attrs?.style ?? "", "padding-block-start:60px")
    }))

  it.effect("uses the given sizes as they are without measuring", () =>
    Effect.gen(function*() {
      const sizes = [50, 50, 10, 10, 10, 10, 10, 10]
      const s = yield* Scene.make(
        VirtualList,
        { count: 8, itemSize: 0, sizes, measure: false, overscan: 0 },
        makeStandIn()
      )
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
      assert.deepStrictEqual(indices(s), span(0, 4))
      s.mounted(
        tracked(s),
        sent("MeasuredItems", {
          epoch: 1,
          width: 300,
          items: span(0, 4).map((index) => ({ index, key: null, top: index * 40, left: 0, size: 40 }))
        })
      )
      assert.deepStrictEqual(indices(s), span(0, 2))
      s.props({ ...base, overscan: 0 })
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
