import {
  type CollisionAvoidance,
  place,
  type PlaceInput,
  type PositionerOptions,
  resolveOptions,
  trackArgs
} from "@effect/ui-kit/Positioning"
import { assert, describe, it } from "@effect/vitest"
import * as fc from "fast-check"

const viewport = { x: 0, y: 0, width: 1000, height: 800 }

const input = (
  options: PositionerOptions,
  overrides: Partial<Omit<PlaceInput, "options">> = {},
  collisionAvoidance: CollisionAvoidance = { fallbackAxisSide: "end" }
): PlaceInput => ({
  anchor: { x: 400, y: 400, width: 100, height: 40 },
  popup: { width: 200, height: 100 },
  arrow: null,
  boundary: viewport,
  anchorClip: viewport,
  rtl: false,
  options: resolveOptions(options, { side: "bottom", collisionAvoidance }),
  ...overrides
})

const at = (options: PositionerOptions, overrides?: Partial<Omit<PlaceInput, "options">>) => {
  const { side, align, x, y } = place(input(options, overrides))
  return { side, align, x, y }
}

describe("place", () => {
  it("puts the popup on the requested side, lined up as asked, with logical sides following the direction", () => {
    const placed = place(input({}))
    assert.deepStrictEqual(
      { side: placed.side, align: placed.align, x: placed.x, y: placed.y },
      { side: "bottom", align: "center", x: 350, y: 440 }
    )
    assert.strictEqual(placed.availableHeight, 355)
    assert.strictEqual(placed.availableWidth, 990)
    assert.deepStrictEqual(at({ side: "top", align: "start" }), { side: "top", align: "start", x: 400, y: 300 })
    assert.deepStrictEqual(at({ side: "right", align: "end" }), { side: "right", align: "end", x: 500, y: 340 })
    assert.deepStrictEqual(at({ side: "inline-end" }, { rtl: true }), {
      side: "inline-end",
      align: "center",
      x: 200,
      y: 370
    })
    assert.deepStrictEqual(at({ side: "top", align: "end" }, { rtl: true }), {
      side: "top",
      align: "end",
      x: 400,
      y: 300
    })
  })

  it("moves the popup away by the side offset and along by the align offset, which an end alignment reverses", () => {
    assert.deepStrictEqual(at({ sideOffset: 8, alignOffset: 10 }), { side: "bottom", align: "center", x: 360, y: 448 })
    assert.deepStrictEqual(at({ align: "end", alignOffset: 10 }), { side: "bottom", align: "end", x: 290, y: 440 })
    assert.strictEqual(place(input({ sideOffset: 8 })).transformOrigin, "100px -8px")
    assert.strictEqual(place(input({ side: "top", sideOffset: 8 })).transformOrigin, "100px calc(100% + 8px)")
  })

  it("flips, shifts or keeps the side when the popup doesn't fit below the anchor", () => {
    const low = { anchor: { x: 400, y: 700, width: 100, height: 40 } }
    assert.deepStrictEqual(at({}, low), { side: "top", align: "center", x: 350, y: 600 })
    assert.deepStrictEqual(at({ collisionAvoidance: { side: "shift" } }, low), {
      side: "bottom",
      align: "center",
      x: 350,
      y: 695
    })
    assert.deepStrictEqual(at({ collisionAvoidance: { side: "none" } }, low), {
      side: "bottom",
      align: "center",
      x: 350,
      y: 740
    })
  })

  it("shifts, flips or keeps the alignment when the popup passes the edge along the anchor", () => {
    const right = { anchor: { x: 900, y: 400, width: 100, height: 40 } }
    assert.deepStrictEqual(at({}, right), { side: "bottom", align: "center", x: 795, y: 440 })
    assert.deepStrictEqual(at({ collisionPadding: { right: 20 } }, right), {
      side: "bottom",
      align: "center",
      x: 780,
      y: 440
    })
    assert.deepStrictEqual(at({ collisionAvoidance: { align: "none" } }, right), {
      side: "bottom",
      align: "center",
      x: 850,
      y: 440
    })
    assert.deepStrictEqual(at({ align: "start" }, { anchor: { x: 850, y: 400, width: 100, height: 40 } }), {
      side: "bottom",
      align: "end",
      x: 750,
      y: 440
    })
  })

  it("falls back to the other axis only when allowed, and keeps to the boundary it's given", () => {
    const tall = { popup: { width: 200, height: 500 }, anchor: { x: 400, y: 380, width: 100, height: 40 } }
    assert.strictEqual(at({}, tall).side, "right")
    assert.strictEqual(at({ collisionAvoidance: { fallbackAxisSide: "start" } }, tall).side, "left")
    assert.strictEqual(at({ collisionAvoidance: { fallbackAxisSide: "none" } }, tall).side, "bottom")
    assert.strictEqual(at({}, { boundary: { x: 0, y: 0, width: 1000, height: 500 } }).side, "top")
  })

  it("follows an anchor scrolled out of view only when sticky, and reports it hidden", () => {
    const above = { anchor: { x: 400, y: -100, width: 100, height: 40 } }
    assert.deepStrictEqual(at({}, above), { side: "bottom", align: "center", x: 350, y: -60 })
    assert.deepStrictEqual(at({ sticky: true }, above), { side: "bottom", align: "center", x: 350, y: 5 })
    assert.isTrue(place(input({}, above)).anchorHidden)
    assert.isFalse(place(input({})).anchorHidden)
    assert.isTrue(place(input({}, { anchorClip: { x: 0, y: 0, width: 1000, height: 300 } })).anchorHidden)
  })

  it("calls a point anchor hidden only past the clip's edge, and with shiftCrossAxis slides over it instead of flipping", () => {
    const point = (x: number, y: number) => ({ anchor: { x, y, width: 0, height: 0 } })
    assert.isFalse(place(input({}, point(0, 400))).anchorHidden)
    assert.isTrue(place(input({}, point(-1, 400))).anchorHidden)
    const low = point(400, 750)
    assert.deepStrictEqual(at({ align: "start" }, low), { side: "top", align: "start", x: 400, y: 650 })
    const sliding = resolveOptions({ align: "start" }, {
      side: "bottom",
      collisionAvoidance: { fallbackAxisSide: "none" },
      shiftCrossAxis: true
    })
    const { align, side, x, y } = place({ ...input({}, low), options: sliding })
    assert.deepStrictEqual({ side, align, x, y }, { side: "bottom", align: "start", x: 400, y: 695 })
  })

  it("points the arrow at the anchor, keeping it the arrow padding from the popup's corners", () => {
    const arrow = { width: 10, height: 10 }
    assert.deepStrictEqual(place(input({}, { arrow })).arrow, { x: 95, y: null, uncentered: false })
    const corner = { arrow, anchor: { x: 985, y: 400, width: 10, height: 40 } }
    assert.deepStrictEqual(place(input({}, corner)).arrow, { x: 185, y: null, uncentered: true })
    assert.deepStrictEqual(place(input({ arrowPadding: 0 }, corner)).arrow, { x: 190, y: null, uncentered: false })
  })

  const side = fc.constantFrom("top", "bottom", "left", "right", "inline-start", "inline-end" as const)
  const align = fc.constantFrom("start", "center", "end" as const)
  const length = fc.integer({ min: 0, max: 300 })

  it("never changes the side when side collisions are ignored", () => {
    fc.assert(fc.property(
      side,
      align,
      fc.integer({ min: -400, max: 1400 }),
      fc.integer({ min: -400, max: 1200 }),
      fc.boolean(),
      (side, align, x, y, rtl) =>
        place(input({ side, align, collisionAvoidance: { side: "none" } }, {
          anchor: { x, y, width: 50, height: 50 },
          rtl
        })).side === side
    ))
  })

  it("keeps a popup that fits inside the padded boundary along an anchor inside it", () => {
    fc.assert(fc.property(
      side,
      align,
      length,
      length,
      fc.integer({ min: 5, max: 995 }),
      fc.integer({ min: 5, max: 795 }),
      (side, align, width, height, x, y) => {
        const placed = place(input({ side, align, collisionAvoidance: { side: "none", align: "shift" } }, {
          anchor: { x, y, width: 0, height: 0 },
          popup: { width, height }
        }))
        return placed.side === "top" || placed.side === "bottom"
          ? placed.x >= 5 && placed.x + width <= 995
          : placed.y >= 5 && placed.y + height <= 795
      }
    ))
  })
})

describe("trackArgs", () => {
  it("fills in what the props and the component leave out, and places against the anchor prop when it's set", () => {
    assert.deepStrictEqual(trackArgs({}, { side: "bottom", anchorSelector: "#save" }), {
      options: {
        side: "bottom",
        align: "center",
        sideOffset: 0,
        alignOffset: 0,
        collisionAvoidance: { side: "flip", align: "flip", fallbackAxisSide: "end" },
        collisionPadding: { top: 5, right: 5, bottom: 5, left: 5 },
        sticky: false,
        arrowPadding: 5,
        shiftCrossAxis: false
      },
      positionMethod: "absolute",
      collisionBoundary: "clipping-ancestors",
      disableAnchorTracking: false,
      anchorSelector: "#save",
      anchorRect: null,
      arrowId: null,
      offsetAsPadding: false,
      leaveCoordinates: false,
      inline: false,
      inlineHit: null
    })
    assert.isTrue(
      trackArgs({}, { side: "bottom", anchorSelector: "#save", leaveCoordinates: true }).leaveCoordinates
    )
    assert.strictEqual(
      trackArgs({ anchor: "save\"as" }, { side: "bottom", anchorSelector: "#save" }).anchorSelector,
      "[id=\"save\\\"as\"]"
    )
    const point = { x: 10, y: 20, width: 0, height: 0 }
    assert.deepStrictEqual(trackArgs({ anchor: point }, { side: "bottom", anchorSelector: "#save" }).anchorRect, point)
    const own = { side: "bottom", anchorSelector: "#save", anchorRect: point } as const
    assert.deepStrictEqual(trackArgs({}, own).anchorRect, point)
    assert.isNull(trackArgs({ anchor: "save" }, own).anchorRect)
  })
})
