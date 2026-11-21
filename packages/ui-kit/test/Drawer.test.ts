import type { Component, Mount, View } from "@effect/ui"
import { Drawer, type DrawerEvents, type DrawerProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Drawer>
type H = View.Helper<never, DrawerProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (drawer: Parts, h: H) =>
    h.div(
      drawer.swipeArea({ element: h.div.class("area").attr("style", "z-index:1") }),
      drawer.backdrop(h.div.class("backdrop").attr("data-swiping", "x")),
      drawer.popup(
        h.div.class("popup")
          .attr("data-swiping", "x")
          .attr("data-swipe-direction", "sideways")
          .attr("data-nested-drawer-open", "x")
          .attr("style", "color:red")
      ).children(drawer.content(h.div.class("content")))
    )
}

const popup = Locator.attr("class", "popup")
const area = Locator.attr("class", "area")

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const trackedOn = (locator: Locator.Locator) => (s: Rendered): Track =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Track
const tracked = trackedOn(popup)
const trackedArea = trackedOn(area)
const argsOf = (mount: Track) => mount.args as Record<string, unknown>
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const release = (fields: object) =>
  sent("ReleasedSwipe", {
    direction: "down",
    deltaX: 0,
    deltaY: 0,
    velocityX: 0,
    velocityY: 0,
    releaseVelocityX: 0,
    releaseVelocityY: 0,
    width: 300,
    height: 200,
    reversed: false,
    ...fields
  })

const swiped = { _tag: "Dismissed", reason: "swipe" } as DrawerEvents

const opened = { _tag: "Opened", triggerId: null, reason: "swipe" } as DrawerEvents
const snapped = (snapPoint: number) => ({ _tag: "Snapped", snapPoint }) as DrawerEvents
const measured = sent("Measured", { width: 400, height: 800, viewport: 800, fontSize: 16 })

const openedByArea = Effect.gen(function*() {
  const s = yield* Scene.make(Drawer, { open: false }, standIn)
  s.expectMount(tracked(s)).expectMount(trackedArea(s))
    .mounted(trackedArea(s), sent("StartedAreaSwipe", { key: argsOf(trackedArea(s)).key }))
    .emitted(opened)
    .props({ open: true })
  return s.expectMount(tracked(s)).expectMount(trackedArea(s))
})

describe("Drawer", () => {
  it.effect("a long release dismisses", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), sent("StartedSwipe"))
      assert.strictEqual(s.get(popup).attrs?.["data-swiping"], "")
      s.mounted(tracked(s), release({ deltaY: 150, velocityY: 0.3 })).emitted(swiped)
      assert.isUndefined(s.get(popup).attrs?.["data-swiping"])
    }))

  it.effect("a short slow release settles", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), release({ deltaY: 50, velocityY: 0.1, releaseVelocityY: 0.1 }))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("a fast short flick dismisses", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), release({ deltaY: 30, velocityY: 0.5 }))
        .emitted(swiped)
    }))

  it.effect("a fast release that turned back settles", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), release({ deltaY: 30, velocityY: 1, releaseVelocityY: 1, reversed: true }))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("a release in the wrong direction settles", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), release({ direction: null, deltaY: -12, velocityY: -1 }))
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("dismisses to the left, the right and up", () =>
    Effect.gen(function*() {
      const cases = [
        ["left", { deltaX: -200 }, { deltaX: -100 }],
        ["right", { deltaX: 200 }, { deltaX: 100 }],
        ["up", { deltaY: -150 }, { deltaY: -50 }]
      ] as const
      for (const [direction, long, short] of cases) {
        const s = yield* Scene.make(Drawer, { open: true, swipeDirection: direction }, standIn)
        assert.strictEqual(s.get(popup).attrs?.["data-swipe-direction"], direction)
        s.expectMount(tracked(s)).expectMount(trackedArea(s))
          .mounted(tracked(s), release({ direction, ...short }))
        assert.deepStrictEqual(s.current.emitted, [])
        s.expectMount(tracked(s)).mounted(tracked(s), release({ direction, ...long })).emitted(swiped)
      }
    }))

  it.effect("a drag between snap points snaps, and a strong flick down dismisses", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true, snapPoints: [0.5, 1] }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s)).mounted(tracked(s), measured)
      assert.match(s.get(popup).attrs?.style ?? "", /--drawer-height:800px;.*--drawer-snap-point-offset:400px;/)
      s.expectMount(tracked(s))
        .mounted(tracked(s), release({ direction: "up", deltaY: -300, height: 800 }))
        .emitted(snapped(1))
        .expectMount(tracked(s))
        .mounted(tracked(s), release({ deltaY: 50, velocityY: 1, releaseVelocityY: 2, height: 800 }))
        .emitted(swiped)
    }))

  it.effect("snapToSequentialPoints moves at most one snap point", () =>
    Effect.gen(function*() {
      const flick = release({ direction: "up", deltaY: -100, velocityY: -1, releaseVelocityY: -3, height: 800 })
      const s = yield* Scene.make(Drawer, { open: true, snapPoints: [0.25, 0.5, 1] }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s)).mounted(tracked(s), measured)
        .expectMount(tracked(s))
        .mounted(tracked(s), flick)
        .emitted(snapped(1))
        .props({ open: true, snapPoints: [0.25, 0.5, 1], snapToSequentialPoints: true })
        .expectMount(tracked(s))
        .mounted(tracked(s), flick)
        .emitted(snapped(0.5))
    }))

  it.effect("a refused dismiss puts the drawer back", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), release({ deltaY: 150, velocityY: 1, releaseVelocityY: 1 }))
        .emitted(swiped)
      assert.isTrue(argsOf(tracked(s)).dismissed)
      assert.notInclude(s.get(popup).attrs?.style, "--drawer-swipe-strength:1;")
      s.props({ open: false })
      assert.strictEqual(s.get(popup).attrs?.["data-swipe-dismiss"], "")
      s.props({ open: true })
      s.expectMount(tracked(s)).mounted(tracked(s), sent("RefusedSwipe"))
      assert.isFalse(argsOf(tracked(s)).dismissed)
      assert.include(s.get(popup).attrs?.style, "--drawer-swipe-strength:1;")
      s.props({ open: false })
      assert.isUndefined(s.get(popup).attrs?.["data-swipe-dismiss"])
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
    }))

  it.effect("a nested drawer's report marks the popup and stops its swipes", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), sent("ChangedNested", { count: 2, swiping: true, height: 300 }))
      assert.deepInclude(s.get(popup).attrs, { "data-nested-drawer-open": "", "data-nested-drawer-swiping": "" })
      assert.include(s.get(popup).attrs?.style, "--nested-drawers:2;")
      assert.include(s.get(popup).attrs?.style, "--drawer-frontmost-height:300px;")
      assert.isFalse(argsOf(tracked(s)).enabled)
      s.parts((drawer) => {
        assert.strictEqual(drawer.nestedDrawers, 2)
        assert.isTrue(drawer.nestedDrawerSwiping)
      })
      s.expectMount(tracked(s))
    }))

  it.effect("the drawer's attributes win, and the consumer's style is kept", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true, swipeDirection: "left", snapPoints: [1] }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
      const attrs = s.get(popup).attrs
      assert.deepInclude(attrs, { "data-swipe-direction": "left" })
      assert.isUndefined(attrs?.["data-swiping"])
      assert.isUndefined(attrs?.["data-nested-drawer-open"])
      assert.match(attrs?.style ?? "", /^color:red;--nested-drawers:0;/)
      assert.isUndefined(s.get(Locator.attr("class", "backdrop")).attrs?.["data-swiping"])
      assert.strictEqual(s.get(area).attrs?.style, "z-index:1;touch-action:pan-y;pointer-events:none")
      assert.strictEqual(s.get(Locator.attr("class", "content")).attrs?.["data-drawer-content"], "")
      s.parts((drawer) => {
        assert.strictEqual(drawer.swipeDirection, "left")
        assert.isTrue(drawer.expanded)
      })
    }))

  it.effect("a swipe on the area opens a closed drawer", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: false }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
      assert.deepInclude(s.get(area).attrs, { "data-closed": "", "data-swipe-direction": "up" })
      s.mounted(trackedArea(s), sent("StartedAreaSwipe", { key: argsOf(trackedArea(s)).key }))
        .emitted(opened)
      assert.deepInclude(s.get(area).attrs, { "data-swiping": "" })
      assert.strictEqual(s.get(popup).attrs?.["data-swiping"], "")
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
    }))

  it.effect("a short release on the area dismisses the drawer it opened", () =>
    Effect.gen(function*() {
      const s = yield* openedByArea
      s.mounted(trackedArea(s), sent("ReleasedAreaSwipe", { displacement: 100, velocity: 0.05, size: 400 }))
        .emitted(swiped)
    }))

  it.effect("a long or fast release on the area leaves the drawer open", () =>
    Effect.gen(function*() {
      const long = yield* openedByArea
      long.mounted(trackedArea(long), sent("ReleasedAreaSwipe", { displacement: 200, velocity: 0, size: 400 }))
      assert.deepStrictEqual(long.current.emitted, [])
      const fast = yield* openedByArea
      fast.mounted(trackedArea(fast), sent("ReleasedAreaSwipe", { displacement: 10, velocity: 0.1, size: null }))
      assert.deepStrictEqual(fast.current.emitted, [])
      long.expectMount(tracked(long)).expectMount(trackedArea(long))
      fast.expectMount(tracked(fast)).expectMount(trackedArea(fast))
    }))

  it.effect("a disabled area takes no pointer", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: false }, {
        elements: Html,
        view: (drawer: Parts, h: H) =>
          h.div(drawer.swipeArea({ element: h.div.class("area"), swipeDirection: "left", disabled: true }))
      })
      s.expectMount(trackedArea(s))
      assert.isTrue(argsOf(trackedArea(s)).disabled)
      assert.deepInclude(s.get(area).attrs, {
        "data-disabled": "",
        "data-swipe-direction": "left",
        style: "touch-action:pan-y;pointer-events:none"
      })
    }))
})
