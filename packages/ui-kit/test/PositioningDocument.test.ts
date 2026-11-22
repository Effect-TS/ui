// @vitest-environment happy-dom
import { Positioning } from "@effect/ui-kit"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { tick } from "./utils/document.ts"

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const rects = new Map<string, Rect>()

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const root = document.documentElement as any
    const saved = { rect: element.getBoundingClientRect, ResizeObserver: (window as any).ResizeObserver }
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    element.getBoundingClientRect = function(this: Element) {
      const { height, width, x, y } = rects.get(this.id) ?? { x: 0, y: 0, width: 0, height: 0 }
      return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }
    }
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 1000 })
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 })
    return () => {
      element.getBoundingClientRect = saved.rect
      ;(window as any).ResizeObserver = saved.ResizeObserver
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const track = Effect.fnUntraced(function*(leaveCoordinates: boolean, props: Positioning.PositionerOptions = {}) {
  yield* geometry
  document.body.innerHTML = `<button id="anchor"></button><div id="positioner"><div id="list"></div></div>`
  rects.set("anchor", { x: 100, y: 100, width: 80, height: 20 })
  rects.set("positioner", { x: 0, y: 0, width: 120, height: 60 })
  const node = document.getElementById("positioner")!
  node.style.left = "7px"
  node.style.top = "9px"
  const args = Positioning.trackArgs(props, { side: "bottom", anchorSelector: "#anchor", leaveCoordinates })
  const placements: Array<Positioning.Placement> = []
  yield* Positioning.trackPosition(node, args, Stream.never).pipe(
    Stream.runForEach((placement) => Effect.sync(() => placements.push(placement))),
    Effect.forkScoped
  )
  yield* tick
  return { node, placements }
})

describe("trackPosition in a document", () => {
  it.effect("with leaveCoordinates, it leaves left and top to the caller and still writes the variables", () =>
    Effect.gen(function*() {
      const { node, placements } = yield* track(true)
      assert.strictEqual(node.style.left, "7px")
      assert.strictEqual(node.style.top, "9px")
      assert.strictEqual(node.style.getPropertyValue("--anchor-width"), "80px")
      assert.notStrictEqual(node.style.getPropertyValue("--available-height"), "")
      assert.strictEqual(placements[0]?.side, "bottom")
    }).pipe(Effect.scoped))

  it.effect("without it, it writes left and top", () =>
    Effect.gen(function*() {
      const { node } = yield* track(false)
      assert.strictEqual(node.style.left, "140px")
      assert.strictEqual(node.style.top, "120px")
    }).pipe(Effect.scoped))

  it.effect("a rectangle given as the anchor takes the element's place", () =>
    Effect.gen(function*() {
      const { node, placements } = yield* track(false, { anchor: { x: 300, y: 200, width: 0, height: 0 } })
      assert.strictEqual(node.style.left, "300px")
      assert.strictEqual(node.style.top, "200px")
      assert.strictEqual(node.style.getPropertyValue("--anchor-width"), "0px")
      assert.isFalse(placements[0]?.anchorHidden)
    }).pipe(Effect.scoped))

  it.effect("a scroll inside the positioner doesn't place it again, and one outside does", () =>
    Effect.gen(function*() {
      const { node } = yield* track(false)
      rects.set("anchor", { x: 300, y: 100, width: 80, height: 20 })
      node.firstElementChild!.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.strictEqual(node.style.left, "140px")
      document.dispatchEvent(new Event("scroll"))
      yield* tick
      assert.notStrictEqual(node.style.left, "140px")
    }).pipe(Effect.scoped))
})
