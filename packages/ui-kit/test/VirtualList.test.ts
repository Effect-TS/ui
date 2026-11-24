import type { Component, Mount, View } from "@effect/ui"
import {
  VirtualList,
  VirtualListEvents,
  type VirtualListProps
} from "@effect/ui-kit"
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
const tracked = (scene: Rendered): Track =>
  (scene.get(listLoc) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Track
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never
const moved = (start: number, height = 100, fields: object = {}) =>
  sent("MovedViewport", {
    start,
    height,
    length: 0,
    anchor: null,
    atStart: start <= 0,
    atEnd: false,
    scrolled: null,
    ...fields
  })
const scrolled = (
  first: number,
  last: number,
  fields: Partial<VirtualListEvents> = {}
) =>
  VirtualListEvents.Scrolled({
    first,
    last,
    atStart: first === 0,
    atEnd: false,
    offset: 0,
    height: 100,
    length: 0,
    scrolling: false,
    ...fields
  })

type Scene = {
  readonly all: (locator: Locator.Locator) => ReadonlyArray<Locator.Node>
}
const indices = (scene: Scene) =>
  scene.all(itemLoc).map((node) => Number(node.attrs?.["data-index"]))
const span = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i)

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
      const scene = yield* Scene.make(
        VirtualList,
        base,
        makeStandIn((p) => (latest = p))
      )
      scene.expectMount(tracked(scene))

      assert.deepStrictEqual(indices(scene), span(0, 3))
      assert.strictEqual(latest.count, 1000)
      assert.strictEqual(latest.atEnd, false)
      assert.strictEqual(scene.get(listLoc).attrs?.role, "list")
      assert.strictEqual(
        scene.get(listLoc).attrs?.style,
        "color:red;padding-block-start:0px;padding-block-end:19920px;overflow-anchor:none"
      )
      const viewportId = scene.get(Locator.attr("class", "viewport")).attrs
        ?.["data-virtual-list-viewport"]
      assert.isString(viewportId)
      assert.notStrictEqual(viewportId, "wrong")
      const first = scene.all(itemLoc)[0]!
      assert.strictEqual(first.attrs?.role, "listitem")
      assert.strictEqual(first.attrs?.["aria-posinset"], "1")
      assert.strictEqual(first.attrs?.["aria-setsize"], "1000")
      assert.strictEqual(first.attrs?.["data-index"], "0")
      assert.strictEqual(first.attrs?.["data-key"], undefined)
      assert.strictEqual(first.attrs?.["data-virtual-list-item"], viewportId)
      scene.props({ ...base, keys: ["row-0"] })
      assert.strictEqual(scene.all(itemLoc)[0]!.attrs?.["data-key"], "row-0")
    }))

  it.effect("keeps a role the consumer sets", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        VirtualList,
        { ...base, initialCount: 1 },
        {
          elements: Html,
          view: (virtualList: Parts, h: H) =>
            virtualList.list(h.div.class("list").attr("role", "feed")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.div.class("item").attr("role", "article"),
                  index
                })
              )
            )
        }
      )
      scene.expectMount(tracked(scene))
      assert.strictEqual(scene.get(listLoc).attrs?.role, "feed")
      assert.strictEqual(scene.get(itemLoc).attrs?.role, "article")
    }))

  it.effect("renders the rows around the viewport and reports the visible items", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(VirtualList, base, makeStandIn())

      scene.mounted(tracked(scene), moved(0)).emitted(scrolled(0, 4))
      assert.deepStrictEqual(indices(scene), span(0, 7))

      scene.mounted(tracked(scene), moved(1000)).emitted(
        scrolled(50, 54, { offset: 1000 })
      )
      assert.deepStrictEqual(indices(scene), span(47, 57))
      assert.strictEqual(
        scene.get(listLoc).attrs?.style,
        "color:red;padding-block-start:940px;padding-block-end:18840px;overflow-anchor:none"
      )

      scene.mounted(tracked(scene), moved(1010, 90))
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("renders ahead as far as the last scroll moved, and not after a jump", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        VirtualList,
        { ...base, overscan: 0 },
        makeStandIn()
      )
      scene.mounted(tracked(scene), moved(1000)).emitted(
        scrolled(50, 54, { offset: 1000 })
      )
      assert.deepStrictEqual(indices(scene), span(50, 54))

      scene.mounted(tracked(scene), moved(960)).emitted(
        scrolled(48, 52, { offset: 960 })
      )
      assert.deepStrictEqual(indices(scene), span(46, 52))

      scene.mounted(tracked(scene), moved(1060)).emitted(
        scrolled(53, 57, { offset: 1060 })
      )
      assert.deepStrictEqual(indices(scene), span(53, 62))

      scene.mounted(tracked(scene), moved(5000)).emitted(
        scrolled(250, 254, { offset: 5000 })
      )
      assert.deepStrictEqual(indices(scene), span(250, 254))
    }))

  it.effect("keeps measured sizes and estimates the rest from their average", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        VirtualList,
        { ...base, overscan: 0 },
        makeStandIn()
      )
      scene.mounted(tracked(scene), moved(0)).emitted(scrolled(0, 4))
      scene.mounted(
        tracked(scene),
        sent("MeasuredItems", {
          epoch: 0,
          width: 300,
          items: span(0, 4).map((index) => ({
            index,
            key: null,
            top: index * 40,
            left: 0,
            size: 40
          }))
        })
      ).emitted(scrolled(0, 2))
      assert.deepStrictEqual(indices(scene), span(0, 2))
      assert.include(
        scene.get(listLoc).attrs?.style ?? "",
        "padding-block-end:39880px"
      )
    }))

  it.effect("reads the lanes and the gap of a grid from the rendered items", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(VirtualList, {
        ...base,
        overscan: 0,
        measure: false
      }, makeStandIn())
      scene.mounted(tracked(scene), moved(0)).emitted(scrolled(0, 4))
      const cell = (index: number) => ({
        index,
        key: null,
        top: Math.floor(index / 3) * 30,
        left: (index % 3) * 100,
        size: 20
      })
      scene.mounted(
        tracked(scene),
        sent("MeasuredItems", {
          epoch: 0,
          width: 300,
          items: span(0, 4).map(cell)
        })
      )
        .emitted(scrolled(0, 14))
      assert.deepStrictEqual(indices(scene), span(0, 14))

      scene.mounted(
        tracked(scene),
        sent("MeasuredItems", {
          epoch: 1,
          width: 300,
          items: span(0, 14).map(cell)
        })
      )
        .emitted(scrolled(0, 11))
      assert.deepStrictEqual(indices(scene), span(0, 11))
      assert.include(
        scene.get(listLoc).attrs?.style ?? "",
        "padding-block-end:9900px"
      )
      assert.strictEqual(
        scene.get(Locator.attr("data-index", "0")).attrs?.style,
        "box-sizing:border-box;block-size:20px"
      )
      assert.strictEqual(
        scene.get(Locator.attr("data-index", "1")).attrs?.style,
        "box-sizing:border-box;block-size:20px"
      )
    }))

  it.effect("reports reaching and leaving either edge while the rows stay", () =>
    Effect.gen(function*() {
      let latest!: Parts
      const scene = yield* Scene.make(
        VirtualList,
        { ...base, overscan: 0 },
        makeStandIn((p) => (latest = p))
      )
      scene.mounted(tracked(scene), moved(19908, 90)).emitted(
        scrolled(995, 999, { offset: 19908, height: 90 })
      )
      scene.mounted(tracked(scene), moved(19910, 90, { atEnd: true })).emitted(
        scrolled(995, 999, { atEnd: true, offset: 19910, height: 90 })
      )
      assert.strictEqual(latest.atEnd, true)
      assert.deepStrictEqual(indices(scene), span(995, 999))
      scene.mounted(tracked(scene), moved(19909.5, 90, { atEnd: true }))
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.mounted(tracked(scene), moved(19900, 90)).emitted(
        scrolled(995, 999, { offset: 19900, height: 90 })
      )
      assert.strictEqual(latest.atEnd, false)

      scene.mounted(tracked(scene), moved(0, 90)).emitted(
        scrolled(0, 4, { height: 90 })
      )
      assert.strictEqual(latest.atStart, true)
      scene.mounted(tracked(scene), moved(2, 90, { atStart: false })).emitted(
        scrolled(0, 4, { atStart: false, offset: 2, height: 90 })
      )
      assert.strictEqual(latest.atStart, false)
      assert.deepStrictEqual(indices(scene), span(0, 4))
    }))

  it.effect("places a short list at the end of its viewport", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(VirtualList, {
        ...base,
        count: 2,
        contentAlignment: "end"
      }, makeStandIn())
      scene.mounted(tracked(scene), moved(0, 100)).emitted(scrolled(0, 1))
      assert.include(
        scene.get(listLoc).attrs?.style ?? "",
        "padding-block-start:60px"
      )
    }))

  it.effect("uses the given sizes as they are without measuring", () =>
    Effect.gen(function*() {
      const sizes = [50, 50, 10, 10, 10, 10, 10, 10]
      const scene = yield* Scene.make(
        VirtualList,
        { count: 8, itemSize: 0, sizes, measure: false, overscan: 0 },
        makeStandIn()
      )
      scene.mounted(tracked(scene), moved(60, 60)).emitted(
        scrolled(1, 3, { offset: 60, height: 60 })
      )
      assert.include(
        scene.get(listLoc).attrs?.style ?? "",
        "padding-block-start:50px;padding-block-end:40px"
      )
    }))

  it.effect("says where the items sit in a longer set", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(VirtualList, {
        ...base,
        setSize: 10000,
        firstPosition: 201
      }, makeStandIn())
      scene.expectMount(tracked(scene))
      assert.strictEqual(scene.all(itemLoc)[0]!.attrs?.["aria-posinset"], "201")
      assert.strictEqual(
        scene.all(itemLoc)[0]!.attrs?.["aria-setsize"],
        "10000"
      )
      scene.props({ ...base, setSize: -1 })
      assert.strictEqual(scene.all(itemLoc)[0]!.attrs?.["aria-setsize"], "-1")
    }))

  it.effect("writes the size of each item it doesn't measure", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(VirtualList, {
        count: 3,
        itemSize: 32,
        sizes: [40],
        measure: false
      }, makeStandIn())
      scene.expectMount(tracked(scene))
      assert.deepStrictEqual(
        scene.all(itemLoc).map((node) => node.attrs?.style),
        [
          "box-sizing:border-box;block-size:40px",
          "box-sizing:border-box;block-size:32px",
          "box-sizing:border-box;block-size:32px"
        ]
      )
    }))

  it.effect("holds space above the first item for items still to load", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        VirtualList,
        { ...base, reserveStart: 400 },
        makeStandIn()
      )
      scene.mounted(tracked(scene), moved(0)).emitted(scrolled(0, 4))
      assert.include(
        scene.get(listLoc).attrs?.style ?? "",
        "padding-block-start:400px"
      )
      scene.props(base)
      assert.include(
        scene.get(listLoc).attrs?.style ?? "",
        "padding-block-start:0px"
      )
    }))

  it.effect("stands in for the rows left out of a table body with empty rows", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(VirtualList, {
        ...base,
        firstPosition: 2,
        overscan: 0
      }, {
        elements: Html,
        view: (virtualList: Parts, h: H) =>
          virtualList.table(h.table.class("table")).children(
            virtualList.list(h.tbody.class("list")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.tr.class("item").key(String(index)),
                  index
                }).children(
                  h.td.children(String(index))
                )
              )
            )
          )
      })
      const rows = () =>
        (scene.get(listLoc).children ?? []).map((
          node
        ) => [node.attrs?.style ?? "", node.attrs?.["aria-rowindex"]])
      assert.deepStrictEqual(rows(), [["", "2"], ["height:19980px", undefined]])
      scene.mounted(tracked(scene), moved(1000)).emitted(
        scrolled(50, 54, { offset: 1000 })
      )
      assert.deepStrictEqual(rows(), [
        ["height:1000px", undefined],
        ...span(50, 54).map((index) => ["", String(index + 2)]),
        ["height:18900px", undefined]
      ])
      assert.strictEqual(scene.get(listLoc).attrs?.role, undefined)
      assert.strictEqual(
        scene.get(Locator.attr("class", "table")).attrs?.["aria-rowcount"],
        "1001"
      )
    }))

  it.effect("places each item with a transform in the absolute layout", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(
        VirtualList,
        { ...base, layout: "absolute", overscan: 0, initialCount: 2 },
        makeStandIn()
      )
      assert.strictEqual(
        scene.all(itemLoc)[1]!.attrs?.style,
        "position:absolute;inset-inline:0;top:0;transform:translateY(20px)"
      )
      scene.mounted(tracked(scene), moved(1000)).emitted(
        scrolled(50, 54, { offset: 1000 })
      )
      assert.strictEqual(
        scene.get(listLoc).attrs?.style,
        "color:red;position:relative;padding-block-start:0px;padding-block-end:20000px;overflow-anchor:none"
      )
      assert.strictEqual(
        scene.all(itemLoc)[0]!.attrs?.style,
        "position:absolute;inset-inline:0;top:0;transform:translateY(1000px)"
      )
    }))

  it.effect("reports a scroll's start and end, and each offset only with trackScroll", () =>
    Effect.gen(function*() {
      const at = (offset: number, scrolling: boolean) =>
        sent("ScrolledViewport", {
          offset,
          height: 100,
          length: 20000,
          scrolling
        })
      let latest!: Parts
      const quiet = yield* Scene.make(
        VirtualList,
        { ...base, overscan: 0 },
        makeStandIn((p) => (latest = p))
      )
      quiet.mounted(tracked(quiet), moved(1000)).emitted(
        scrolled(50, 54, { offset: 1000 })
      )
      quiet.mounted(tracked(quiet), at(1005, true))
        .emitted(
          scrolled(50, 54, { offset: 1005, length: 20000, scrolling: true })
        )
      assert.strictEqual(latest.scrolling, true)
      quiet.mounted(tracked(quiet), at(1010, true))
      assert.deepStrictEqual(quiet.current.emitted, [])
      quiet.mounted(tracked(quiet), at(1015, false)).emitted(
        scrolled(50, 54, { offset: 1015, length: 20000 })
      )
      assert.strictEqual(latest.scrolling, false)

      const scene = yield* Scene.make(VirtualList, {
        ...base,
        overscan: 0,
        trackScroll: true
      }, makeStandIn())
      scene.mounted(tracked(scene), moved(1000)).emitted(
        scrolled(50, 54, { offset: 1000 })
      )
      scene.mounted(tracked(scene), at(1005, true)).emitted(
        scrolled(50, 54, { offset: 1005, length: 20000, scrolling: true })
      )
      scene.mounted(tracked(scene), at(1010, true)).emitted(
        scrolled(50, 54, { offset: 1010, length: 20000, scrolling: true })
      )
      scene.mounted(tracked(scene), at(1010, true))
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("has one item per key, whatever the count", () =>
    Effect.gen(function*() {
      let latest!: Parts
      const keys = ["a", "b", "c"]
      const scene = yield* Scene.make(
        VirtualList,
        { keys, itemSize: 20 },
        makeStandIn((p) => (latest = p))
      )
      scene.mounted(tracked(scene), moved(0)).emitted(scrolled(0, 2))
      assert.deepStrictEqual(indices(scene), [0, 1, 2])
      scene.props({ keys, itemSize: 20, count: 1000 })
      assert.deepStrictEqual(indices(scene), [0, 1, 2])
      assert.strictEqual(latest.count, 3)
    }))

  it.effect("drops what it measured when the dataset changes", () =>
    Effect.gen(function*() {
      const props = { ...base, overscan: 0, dataset: "a" }
      const scene = yield* Scene.make(VirtualList, props, makeStandIn())
      scene.mounted(tracked(scene), moved(0)).emitted(scrolled(0, 4))
      scene.mounted(
        tracked(scene),
        sent("MeasuredItems", {
          epoch: 0,
          width: 300,
          items: span(0, 4).map((index) => ({
            index,
            key: null,
            top: index * 40,
            left: 0,
            size: 40
          }))
        })
      ).emitted(scrolled(0, 2))
      scene.props({ ...props, dataset: "b" })
      assert.deepStrictEqual(indices(scene), span(0, 4))
      scene.mounted(
        tracked(scene),
        sent("MeasuredItems", {
          epoch: 1,
          width: 300,
          items: span(0, 4).map((index) => ({
            index,
            key: null,
            top: index * 40,
            left: 0,
            size: 40
          }))
        })
      )
      assert.deepStrictEqual(indices(scene), span(0, 2))
      scene.props({ ...base, overscan: 0 })
      assert.deepStrictEqual(indices(scene), span(0, 4))
    }))

  it.effect("rejects tags the parts don't take", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<
        (virtualList: Parts, h: H) => View.Content<never>
      > = [
        (virtualList, h) => virtualList.viewport(h.span as never),
        (virtualList, h) => virtualList.list(h.span as never),
        (virtualList, h) =>
          virtualList.list(h.div).children(
            virtualList.item({ element: h.span as never, index: 0 })
          )
      ]
      for (const render of cases) {
        const exit = yield* Effect.exit(
          Scene.make(VirtualList, base, { elements: Html, view: render })
        )
        assert.strictEqual(exit._tag, "Failure")
      }
    }))
})
