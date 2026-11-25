// @vitest-environment happy-dom
import { Positioning } from "@effect/ui-kit"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { notWebKit, tick, visualViewport } from "./utils/document.ts"

type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const rects = new Map<string, Rect>()
const lines = new Map<string, ReadonlyArray<Rect>>()
const resizers = new Map<Element, Set<() => void>>()

const triggerResize = (element: Element) => {
  for (const notify of resizers.get(element) ?? []) notify()
}

const edgesOf = ({ height, width, x, y }: Rect) => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height
})

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const root = document.documentElement as any
    const saved = {
      rect: element.getBoundingClientRect,
      rects: element.getClientRects,
      ResizeObserver: (window as any).ResizeObserver
    }
    ;(window as any).ResizeObserver = class {
      readonly #callback: ResizeObserverCallback
      readonly #observed = new Set<Element>()
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback
      }
      observe(target: Element) {
        if (this.#observed.has(target)) return
        this.#observed.add(target)
        const set = resizers.get(target) ?? new Set()
        set.add(() =>
          this.#callback(
            [{ target } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          )
        )
        resizers.set(target, set)
      }
      unobserve(target: Element) {
        this.#observed.delete(target)
      }
      disconnect() {
        for (const target of this.#observed) resizers.delete(target)
        this.#observed.clear()
      }
    }
    element.getBoundingClientRect = function(this: Element) {
      return edgesOf(rects.get(this.id) ?? { x: 0, y: 0, width: 0, height: 0 })
    }
    element.getClientRects = function(this: Element) {
      return (lines.get(this.id) ??
        [rects.get(this.id) ?? { x: 0, y: 0, width: 0, height: 0 }]).map(
          edgesOf
        )
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
      element.getClientRects = saved.rects
      ;(window as any).ResizeObserver = saved.ResizeObserver
      delete root.clientWidth
      delete root.clientHeight
      rects.clear()
      lines.clear()
      resizers.clear()
    }
  }),
  (restore) => Effect.sync(restore)
)

const track = Effect.fnUntraced(
  function*(
    leaveCoordinates: boolean,
    props: Positioning.PositionerOptions = {}
  ) {
    yield* geometry
    document.body.innerHTML =
      `<button id="anchor"></button><div id="positioner"><div id="list"></div></div>`
    rects.set("anchor", { x: 100, y: 100, width: 80, height: 20 })
    rects.set("positioner", { x: 0, y: 0, width: 120, height: 60 })
    const node = document.getElementById("positioner")!
    Object.defineProperty(node, "offsetHeight", {
      configurable: true,
      value: 60
    })
    node.style.left = "7px"
    node.style.top = "9px"
    const args = Positioning.trackArgs(props, {
      side: "bottom",
      anchorSelector: "#anchor",
      leaveCoordinates
    })
    const placements: Array<Positioning.Placement> = []
    yield* Positioning.trackPosition(node, args, Stream.never).pipe(
      Stream.runForEach((placement) =>
        Effect.sync(() => placements.push(placement))
      ),
      Effect.forkScoped
    )
    yield* tick
    return { node, placements }
  }
)

const sized = (element: Element, width: number, height: number) => {
  for (
    const [name, value] of [["offsetWidth", width], ["clientWidth", width], [
      "offsetHeight",
      height
    ], ["clientHeight", height]] as const
  ) {
    Object.defineProperty(element, name, { configurable: true, value })
  }
}

// A card at (50, 20), 300 by `cardHeight`, holds the anchor near its bottom
// edge and a 120 by 60 positioner drawn in place.
const trackInCard = Effect.fnUntraced(
  function*(
    options: {
      readonly scale?: number
      readonly cardHeight?: number
    } = {}
  ) {
    yield* geometry
    const scale = options.scale ?? 1
    const cardHeight = options.cardHeight ?? 130
    document.body.innerHTML =
      `<div id="card" style="position:relative;overflow:hidden"><button id="anchor"></button><div id="positioner" style="position:absolute"></div></div>`
    rects.set("card", {
      x: 50,
      y: 20,
      width: 300 * scale,
      height: cardHeight * scale
    })
    rects.set("anchor", {
      x: 50 + 50 * scale,
      y: 20 + 90 * scale,
      width: 80 * scale,
      height: 20 * scale
    })
    rects.set("positioner", {
      x: 0,
      y: 0,
      width: 120 * scale,
      height: 60 * scale
    })
    const card = document.getElementById("card")!
    sized(card, 300, cardHeight)
    const node = document.getElementById("positioner")!
    sized(node, 120, 60)
    const args = Positioning.trackArgs({ topLayer: false }, {
      side: "bottom",
      anchorSelector: "#anchor"
    })
    const placements: Array<Positioning.Placement> = []
    yield* Positioning.trackPosition(node, args, Stream.never).pipe(
      Stream.runForEach((placement) =>
        Effect.sync(() => placements.push(placement))
      ),
      Effect.forkScoped
    )
    yield* tick
    return { card, node, placements }
  }
)

describe("trackPosition in a document", { concurrent: false }, () => {
  it.effect("in place, it measures from the containing block, keeps local alignment under scale, and re-places when the clipping card resizes", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const { node, placements } = yield* trackInCard({ scale: 2 })
        // Below the anchor it would leave the card, so it flips above it, and
        // left, top and size variables stay in the card's local coordinates.
        assert.strictEqual(placements[0]?.side, "top")
        assert.strictEqual(node.style.left, "30px")
        assert.strictEqual(node.style.top, "30px")
        assert.strictEqual(
          node.style.getPropertyValue("--anchor-width"),
          "80px"
        )
        assert.strictEqual(
          node.style.getPropertyValue("--available-height"),
          "85px"
        )
      }))
      // Shrinking the clipping card flips the popup without a scroll or window resize.
      yield* Effect.scoped(Effect.gen(function*() {
        const { card, node, placements } = yield* trackInCard({
          cardHeight: 200
        })
        assert.strictEqual(placements.at(-1)?.side, "bottom")
        rects.set("card", { x: 50, y: 20, width: 300, height: 130 })
        sized(card, 300, 130)
        triggerResize(card)
        yield* tick
        assert.strictEqual(placements.at(-1)?.side, "top")
        assert.strictEqual(node.style.top, "30px")
      }))
    }))

  it.effect("with leaveCoordinates, it leaves left and top to the caller and still writes the variables", () =>
    Effect.gen(function*() {
      const { node, placements } = yield* track(true)
      assert.strictEqual(node.style.left, "7px")
      assert.strictEqual(node.style.top, "9px")
      assert.strictEqual(node.style.getPropertyValue("--anchor-width"), "80px")
      assert.notStrictEqual(
        node.style.getPropertyValue("--available-height"),
        ""
      )
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
      const { node, placements } = yield* track(false, {
        anchor: { x: 300, y: 200, width: 0, height: 0 }
      })
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

  it.effect("keeps the popup inside the visual viewport as it resizes and scrolls", () =>
    Effect.gen(function*() {
      const { visual } = yield* visualViewport
      yield* notWebKit
      const { node } = yield* track(false)
      assert.strictEqual(node.style.top, "120px")
      visual.move({ height: 150 }, "resize")
      yield* tick
      assert.strictEqual(node.style.top, "40px")
      visual.move({ offsetTop: 90 }, "scroll")
      yield* tick
      assert.strictEqual(node.style.top, "120px")
    }).pipe(Effect.scoped))
})

const wrapped = [{ x: 300, y: 200, width: 200, height: 20 }, {
  x: 0,
  y: 220,
  width: 100,
  height: 20
}]

const trackInline = Effect.fnUntraced(function*(options: {
  readonly side: Positioning.Side
  readonly anchor: ReadonlyArray<Rect>
  readonly hit?: {
    readonly x: number
    readonly y: number
    readonly line?: number
  }
  readonly popupHeight?: number
  readonly placedAgainst?: string
}) {
  yield* geometry
  document.body.innerHTML = `<a id="link"></a><div id="positioner"></div>`
  const [first] = options.anchor
  const last = options.anchor[options.anchor.length - 1]!
  rects.set("link", {
    x: Math.min(...options.anchor.map((line) => line.x)),
    y: first!.y,
    width: Math.max(...options.anchor.map((line) => line.x + line.width)) -
      Math.min(...options.anchor.map((line) => line.x)),
    height: last.y + last.height - first!.y
  })
  lines.set("link", options.anchor)
  const node = document.getElementById("positioner")!
  Object.defineProperty(node, "offsetHeight", {
    configurable: true,
    value: options.popupHeight ?? 0
  })
  const args = Positioning.trackArgs({
    side: options.side,
    anchor: options.placedAgainst
  }, {
    side: "bottom",
    anchorSelector: "#link",
    inline: true,
    inlineHit: options.hit === undefined ? null : { line: null, ...options.hit }
  })
  const placements: Array<Positioning.Placement> = []
  yield* Positioning.trackPosition(node, args, Stream.never).pipe(
    Stream.runForEach((placement) =>
      Effect.sync(() => placements.push(placement))
    ),
    Effect.forkScoped
  )
  yield* tick
  return { node, placements }
})

describe(
  "trackPosition against an inline anchor",
  { concurrent: false },
  () => {
    it.effect("places against the hovered line, prefers its recorded index, and falls back on a miss, custom anchor, or single line", () =>
      Effect.gen(function*() {
        const cases = [
          {
            options: {
              side: "bottom" as const,
              anchor: wrapped,
              hit: { x: 350, y: 210 }
            },
            left: "400px",
            top: "220px",
            width: "200px"
          },
          {
            options: {
              side: "bottom" as const,
              anchor: wrapped,
              hit: { x: 350, y: 210, line: 1 }
            },
            left: "50px",
            top: "240px",
            width: "100px"
          },
          {
            options: {
              side: "bottom" as const,
              anchor: wrapped,
              hit: { x: 350, y: 210, line: 0 },
              placedAgainst: "link"
            },
            left: "50px",
            top: "240px"
          },
          {
            options: {
              side: "bottom" as const,
              anchor: wrapped,
              hit: { x: 200, y: 210 }
            },
            left: "250px",
            top: "240px"
          },
          {
            options: {
              side: "bottom" as const,
              anchor: [{ x: 100, y: 200, width: 60, height: 20 }],
              hit: { x: 110, y: 210 }
            },
            left: "130px",
            top: "220px"
          }
        ]
        for (const c of cases) {
          const { node } = yield* Effect.scoped(trackInline(c.options))
          assert.strictEqual(node.style.left, c.left)
          assert.strictEqual(node.style.top, c.top)
          if (c.width !== undefined) {
            assert.strictEqual(
              node.style.getPropertyValue("--anchor-width"),
              c.width
            )
          }
        }
      }))

    it.effect("without a hit, picks the line facing the side and re-picks after a flip", () =>
      Effect.gen(function*() {
        const nearTop = [{ x: 300, y: 10, width: 200, height: 20 }, {
          x: 0,
          y: 30,
          width: 100,
          height: 20
        }]
        const cases = [
          {
            options: { side: "bottom" as const, anchor: wrapped },
            side: "bottom",
            left: "50px",
            top: "240px"
          },
          {
            options: { side: "top" as const, anchor: wrapped },
            side: "top",
            left: "400px",
            top: "200px"
          },
          {
            options: { side: "right" as const, anchor: wrapped },
            side: "right",
            left: "500px",
            top: "210px"
          },
          {
            options: { side: "top" as const, anchor: nearTop, popupHeight: 60 },
            side: "bottom",
            left: "50px",
            top: "50px"
          }
        ]
        for (const c of cases) {
          const { node, placements } = yield* Effect.scoped(
            trackInline(c.options)
          )
          assert.strictEqual(placements[0]?.side, c.side)
          assert.strictEqual(node.style.left, c.left)
          assert.strictEqual(node.style.top, c.top)
        }
      }))
  }
)
