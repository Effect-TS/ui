import {
  VirtualList,
  type VirtualListEvents,
  type VirtualListProps
} from "@effect/ui-native/kit/VirtualList"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Virtualizer from "@effect/ui/Virtualizer"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "../utils/FakeFabric.ts"

const Message = UiSchema.TaggedEnum({ Set: { props: Schema.Unknown } })

const setup = async (initial: VirtualListProps) => {
  const Screen = Native.component({
    name: "Screen",
    model: Schema.Struct({ props: Schema.Unknown }),
    message: Message
  }).make({
    init: () => ({ props: initial }),
    update: { Set: ($, { props }) => $.set({ props }) },
    view: (h, model) =>
      VirtualList(h, {
        props: model.props as VirtualListProps,
        onEmit: {
          Scrolled: (event) => {
            events.push(event)
            return undefined
          }
        },
        view: (list) =>
          list.list(h.scroll.style({ flex: 1 })).children(
            h.text.children("header"),
            list.items.map((index) =>
              list.item({ element: h.view.key("row" + index), index })
                .children(h.text.children(String(index)))
            )
          )
      })
  })
  const events: Array<VirtualListEvents> = []
  const mounted = await FakeFabric.mount((root) =>
    Renderer.mount(Screen, {}, root)
  )
  const settle = async () => {
    for (let i = 0; i < 4; i++) await mounted.settle()
  }
  const scroll = () => mounted.find((n) => n.viewName.endsWith("ScrollView"))
  const content = () =>
    mounted.find((n) => n.viewName.endsWith("ScrollContentView"))
  const textOf = (n: FakeFabric.ShadowNode): string =>
    n.viewName === "RCTRawText"
      ? String(n.props.text)
      : n.children.map(textOf).join("")
  // The content's children: text, a row's index, or a spacer's size.
  const children = () =>
    content().children.map((n) =>
      n.children.length === 0
        ? "s" + String(n.props.height ?? n.props.width)
        : textOf(n)
    ).join(" ")
  const row = (index: number) =>
    content().children.find((n) =>
      n.children.length > 0 && textOf(n) === String(index)
    )!
  const emit = async (
    node: FakeFabric.ShadowNode,
    type: string,
    payload: object
  ) => {
    mounted.fabric.emit(node, type, payload)
    await settle()
  }
  // The scroll lays out 400 points tall, below a 20-point header.
  const layOut = async () => {
    await emit(scroll(), "topLayout", {
      layout: { x: 0, y: 0, width: 300, height: 400 }
    })
    await emit(content().children[1]!, "topLayout", {
      layout: { x: 0, y: 20, width: 300, height: 0 }
    })
  }
  const scrollTo = (y: number, length = 40020) =>
    emit(scroll(), "topScroll", {
      contentOffset: { x: 0, y },
      contentSize: { width: 300, height: length },
      layoutMeasurement: { width: 300, height: 400 }
    })
  const measure = (index: number, y: number, height: number) =>
    emit(row(index), "topLayout", { layout: { x: 0, y, width: 300, height } })
  const setProps = async (props: VirtualListProps) => {
    mounted.root.send(Message.Set({ props }))
    await settle()
  }
  const scrolls = () =>
    mounted.fabric.commands.filter(([, name]) =>
      name === "scrollTo" || name === "scrollToEnd"
    ).map(([, name, args]) => name === "scrollToEnd" ? "end" : args[1])
  return {
    ...mounted,
    settle,
    scroll,
    content,
    children,
    emit,
    layOut,
    scrollTo,
    measure,
    setProps,
    events,
    scrolls,
    row
  }
}

const span = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i).join(" ")

describe("VirtualList", () => {
  it("renders the first rows, then the window around the viewport, and nothing for a scroll that keeps it", async () => {
    const list = await setup({ count: 1000, itemSize: 40 })
    assert.strictEqual(list.children(), "header s0 " + span(0, 9) + " s39600")

    await list.layOut()
    await list.scrollTo(2020)
    assert.strictEqual(
      list.children(),
      "header s1880 " + span(47, 62) + " s37480"
    )
    await list.scrollTo(2030)
    const commits = list.fabric.calls.completeRoot
    // A scroll that leaves the same rows visible renders nothing.
    await list.scrollTo(2040)
    assert.strictEqual(list.fabric.calls.completeRoot, commits)
    await list.close()
  })

  it("emits Scrolled with the visible rows and the edges, also where a request scrolled", async () => {
    const list = await setup({ count: 100, itemSize: 40 })
    await list.layOut()
    await list.scrollTo(0, 4020)
    await list.scrollTo(2020, 4020)
    await list.scrollTo(3620, 4020)
    await list.scrollTo(2020, 4020)
    await list.setProps({
      count: 100,
      itemSize: 40,
      scrollTo: { target: Virtualizer.ScrollTarget.Index({ index: 30 }) }
    })
    await list.scrollTo(1220, 4020)
    assert.deepStrictEqual(
      list.events.map((
        { atEnd, atStart, first, last }
      ) => [first, last, atStart, atEnd]),
      [
        [0, 9, true, false],
        [50, 59, false, false],
        [90, 99, false, true],
        [50, 59, false, false],
        [30, 39, false, false]
      ]
    )
    await list.close()
  })

  it("scrolls to a waiting key once it arrives, re-aims as sizes move it, and stops on a drag", async () => {
    const keys = Array.from({ length: 1000 }, (_, i) => "k" + i)
    const scrollTo = {
      target: Virtualizer.ScrollTarget.Key({ key: "target" })
    }
    const list = await setup({ keys, itemSize: 40, scrollTo })
    assert.deepStrictEqual(list.scroll().props.maintainVisibleContentPosition, {
      minIndexForVisible: 0
    })
    await list.layOut()
    await list.scrollTo(0)
    assert.deepStrictEqual(list.scrolls(), [])

    const withTarget = keys.map((key, i) => i === 500 ? "target" : key)
    await list.setProps({ keys: withTarget, itemSize: 40, scrollTo })
    assert.deepStrictEqual(list.scrolls(), [20 + 500 * 40])
    assert.include(list.children(), " 500 ")

    // Every item measured so far is 80 tall, so the rest are taken to be too.
    await list.measure(500, 20 + 500 * 40, 80)
    assert.deepStrictEqual(list.scrolls(), [20 + 500 * 40, 20 + 500 * 80])

    // Once there, a drag drops the request.
    await list.scrollTo(20 + 500 * 80, 20 + 1000 * 80)
    await list.emit(list.scroll(), "topScrollBeginDrag", {})
    await list.measure(501, 20 + 501 * 80, 60)
    assert.strictEqual(list.scrolls().length, 2)
    await list.close()
  })

  it("keeps the active sticky row with spacers, holds rows when content grows, and anchors scroll on the window's first row", async () => {
    const keys = Array.from({ length: 1000 }, (_, i) => "k" + i)
    const list = await setup({ keys, itemSize: 40, sticky: [0, 100, 400] })
    await list.layOut()
    await list.scrollTo(20 + 300 * 40)
    assert.strictEqual(
      list.children(),
      "header s4000 100 s7840 " + span(297, 312) + " s27480"
    )

    // Rows 100 and 297 to 312 grow to 80 around the spacers native still has.
    const rows = [100, ...Array.from({ length: 16 }, (_, i) => 297 + i)]
    rows.map(list.row).forEach((row, i) =>
      list.fabric.emit(row, "topLayout", {
        layout: {
          x: 0,
          y: i === 0 ? 4020 : 11940 + (i - 1) * 80,
          width: 300,
          height: 80
        }
      })
    )
    await list.settle()
    const grown = 40020 + 17 * 40
    await list.emit(list.content(), "topLayout", {
      layout: { x: 0, y: 0, width: 300, height: grown }
    })
    assert.include(list.children(), " 300 ")
    assert.strictEqual(list.events[list.events.length - 1]!.first, 300)

    // Native keeps row 300 in place, then a scroll moves to row 301.
    await list.scrollTo(11940 + 3 * 80, grown)
    assert.strictEqual(list.events[list.events.length - 1]!.first, 300)
    await list.scrollTo(11940 + 4 * 80, grown)
    assert.strictEqual(list.events[list.events.length - 1]!.first, 301)
    await list.close()
  })

  it("corrects scroll filtering by where native placed the first row, and falls back when that row is gone", async () => {
    const list = await setup({ count: 1000, itemSize: 40 })
    await list.layOut()
    await list.scrollTo(2035)
    // Row 47 is 10 points lower than estimated, so 2025 starts in row 49.
    await list.measure(47, 1910, 40)
    await list.scrollTo(2025)
    assert.strictEqual(list.events[list.events.length - 1]!.first, 49)

    await list.setProps({ count: 10, itemSize: 40 })
    await list.scrollTo(20, 420)
    const last = list.events[list.events.length - 1]!
    assert.deepStrictEqual([last.first, last.offset], [0, 0])
    await list.close()
  })

  it("drops where native placed a row on switching to fixed sizes, before any native event", async () => {
    const sizes = Array.from({ length: 1000 }, (_, i) => i === 900 ? 120 : 40)
    const list = await setup({ count: 1000, itemSize: 40, sizes })
    await list.layOut()
    await list.scrollTo(2020, 40100)
    await list.measure(47, 1900, 40)
    // Swapping rows 0 and 900 moves row 47 down 80 points, but keeps the
    // content's length, so native sends nothing while the rows are fixed.
    const swapped = sizes.map((_, i) => i === 0 ? 120 : 40)
    await list.setProps({
      count: 1000,
      itemSize: 40,
      sizes: swapped,
      measure: false
    })
    await list.setProps({ count: 1000, itemSize: 40, sizes: swapped })
    await list.scrollTo(2060, 40100)
    assert.strictEqual(list.events[list.events.length - 1]!.first, 49)
    await list.close()
  })

  it("reports scrolling through the momentum after a drag, or until 100ms after a drag without one", async () => {
    const list = await setup({ count: 1000, itemSize: 40 })
    await list.layOut()
    await list.scrollTo(400)
    const scrolling = () => list.events[list.events.length - 1]!.scrolling
    const wait = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      await list.settle()
    }
    await list.emit(list.scroll(), "topScrollBeginDrag", {})
    assert.isTrue(scrolling())
    // Native sends the momentum's start as the drag ends.
    list.fabric.emit(list.scroll(), "topScrollEndDrag", {})
    list.fabric.emit(list.scroll(), "topMomentumScrollBegin", {})
    await wait()
    assert.isTrue(scrolling())
    await list.emit(list.scroll(), "topMomentumScrollEnd", {})
    assert.isFalse(scrolling())

    await list.emit(list.scroll(), "topScrollBeginDrag", {})
    list.fabric.emit(list.scroll(), "topScrollEndDrag", {})
    assert.isTrue(scrolling())
    await wait()
    assert.isFalse(scrolling())
    await list.close()
  })

  it("follows the end as the content grows", async () => {
    const list = await setup({ count: 100, itemSize: 40, followEnd: true })
    await list.layOut()
    await list.scrollTo(4020 - 400, 4020)
    await list.emit(list.content(), "topLayout", {
      layout: { x: 0, y: 0, width: 300, height: 4100 }
    })
    assert.deepStrictEqual(list.scrolls(), ["end"])
    await list.close()
  })

  it("sizes the rows with measure: false, along the axis it scrolls", async () => {
    const list = await setup({
      count: 100,
      itemSize: 40,
      measure: false,
      horizontal: true
    })
    assert.strictEqual(
      list.scroll().props.maintainVisibleContentPosition,
      undefined
    )
    assert.strictEqual(list.scroll().props.horizontal, true)
    assert.strictEqual(list.content().children[2]!.props.width, 40)
    assert.strictEqual(list.children(), "header s0 " + span(0, 9) + " s3600")
    await list.close()
  })
})
