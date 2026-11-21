import { Component, type Mount, UiSchema, type View } from "@effect/ui"
import { Dialog, Drawer, type DrawerEvents, type DrawerProps, DrawerProvider } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof Drawer>
type H = View.Helper<never, DrawerProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (drawer: Parts, h: H) =>
    h.div(
      drawer.swipeArea({ element: h.div.class("area").attr("style", "z-index:1") }),
      drawer.backdrop(h.div.class("backdrop").attr("data-swiping", "x")),
      drawer.viewport(h.div.class("viewport")).children(
        drawer.popup(
          h.div.class("popup")
            .attr("data-swiping", "x")
            .attr("data-swipe-direction", "sideways")
            .attr("data-nested-drawer-open", "x")
            .attr("style", "color:red")
        ).children(drawer.content(h.div.class("content")))
      )
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
const measured = sent("Measured", { height: 800, viewport: 800, fontSize: 16 })

const openedByArea = Effect.gen(function*() {
  const s = yield* Scene.make(Drawer, { open: false }, standIn)
  s.expectMount(tracked(s)).expectMount(trackedArea(s))
    .mounted(trackedArea(s), sent("StartedAreaSwipe", { key: argsOf(trackedArea(s)).key }))
    .emitted(opened)
    .props({ open: true })
  return s.expectMount(tracked(s)).expectMount(trackedArea(s))
})

describe("Drawer", () => {
  it.effect("decides from a release's distance, speed, direction and reversal whether to dismiss or settle", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(tracked(s), sent("StartedSwipe"))
      assert.strictEqual(s.get(popup).attrs?.["data-swiping"], "")
      for (
        const settled of [
          release({ deltaY: 50, velocityY: 0.1, releaseVelocityY: 0.1 }),
          release({ deltaY: 30, velocityY: 1, releaseVelocityY: 1, reversed: true }),
          release({ direction: null, deltaY: -12, velocityY: -1 })
        ]
      ) {
        s.mounted(tracked(s), settled)
        assert.deepStrictEqual(s.current.emitted, [])
      }
      s.mounted(tracked(s), release({ deltaY: 30, velocityY: 0.5 })).emitted(swiped)
      s.mounted(tracked(s), sent("StartedSwipe"))
      s.mounted(tracked(s), release({ deltaY: 150, velocityY: 0.3 })).emitted(swiped)
      assert.isUndefined(s.get(popup).attrs?.["data-swiping"])
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

  it.effect("snaps between snap points, obeys snapToSequentialPoints, and dismisses on a strong flick down", () =>
    Effect.gen(function*() {
      const flickUp = release({ direction: "up", deltaY: -100, velocityY: -1, releaseVelocityY: -3, height: 800 })
      const s = yield* Scene.make(Drawer, { open: true, snapPoints: [0.25, 0.5, 1] }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s)).mounted(tracked(s), measured)
      assert.match(s.get(popup).attrs?.style ?? "", /--drawer-height:800px;.*--drawer-snap-point-offset:600px;/)
      s.expectMount(tracked(s))
        .mounted(tracked(s), flickUp)
        .emitted(snapped(1))
        .expectMount(tracked(s))
        .mounted(tracked(s), release({ direction: "up", deltaY: -250, height: 800 }))
        .emitted(snapped(0.5))
        .expectMount(tracked(s))
        .mounted(tracked(s), release({ deltaY: 50, velocityY: 1, releaseVelocityY: 2, height: 800 }))
        .emitted(swiped)
        .props({ open: true, snapPoints: [0.25, 0.5, 1], snapToSequentialPoints: true })
        .expectMount(tracked(s))
        .mounted(tracked(s), flickUp)
        .emitted(snapped(0.5))
        .expectMount(tracked(s))
        .mounted(tracked(s), release({ direction: "up", deltaY: -590, height: 800 }))
        .emitted(snapped(1))
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

  it.effect("emits what its dialog emits, an open with the reason trigger-press", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: true }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
        .childEmit(Dialog, { _tag: "Opened", triggerId: "menu" })
        .emitted({ _tag: "Opened", triggerId: "menu", reason: "trigger-press" })
        .childEmit(Dialog, { _tag: "Dismissed", reason: "escape-key" })
        .emitted({ _tag: "Dismissed", reason: "escape-key" })
        .childEmit(Dialog, { _tag: "Settled", open: false })
        .emitted({ _tag: "Settled", open: false })
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

  it.effect("a swipe on the area opens the drawer, and release distance or speed decides whether it stays open", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Drawer, { open: false }, standIn)
      s.expectMount(tracked(s)).expectMount(trackedArea(s))
      assert.deepInclude(s.get(area).attrs, { "data-closed": "", "data-swipe-direction": "up" })
      s.mounted(trackedArea(s), sent("StartedAreaSwipe", { key: argsOf(trackedArea(s)).key }))
        .emitted(opened)
      assert.deepInclude(s.get(area).attrs, { "data-swiping": "" })
      assert.strictEqual(s.get(popup).attrs?.["data-swiping"], "")
      s.props({ open: true }).expectMount(tracked(s)).expectMount(trackedArea(s))
        .mounted(trackedArea(s), sent("ReleasedAreaSwipe", { displacement: 100, velocity: 0.05, size: 400 }))
        .emitted(swiped)

      const long = yield* openedByArea
      long.mounted(trackedArea(long), sent("ReleasedAreaSwipe", { displacement: 200, velocity: 0, size: 400 }))
      assert.deepStrictEqual(long.current.emitted, [])
      long.expectMount(tracked(long)).expectMount(trackedArea(long))

      const fast = yield* openedByArea
      fast.mounted(trackedArea(fast), sent("ReleasedAreaSwipe", { displacement: 10, velocity: 0.1, size: null }))
      assert.deepStrictEqual(fast.current.emitted, [])
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

const PageMessage = UiSchema.TaggedEnum({ Toggled: { open: Schema.Boolean } })
const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Struct({ open: Schema.Boolean }),
  message: PageMessage,
  elements: Html
}).make({
  init: () => ({ open: false }),
  update: {
    Toggled: (model, { open }) => ({ ...model, open })
  },
  view: (model, h) =>
    DrawerProvider(h, {
      view: (provider) =>
        h.div(
          provider.indentBackground(h.div.class("background")),
          provider.indent(h.div.class("indent")),
          Drawer(h, {
            props: { open: model.open },
            onEmit: {
              Opened: () => PageMessage.Toggled({ open: true }),
              Dismissed: () => PageMessage.Toggled({ open: false }),
              Settled: () => undefined,
              Snapped: () => undefined
            },
            view: (drawer) =>
              h.div(
                drawer.trigger(h.button).children("Open"),
                drawer.portal(h.dialog)?.children(
                  drawer.popup(h.div).children(drawer.close(h.button).children("Close"))
                )
              )
          })
        )
    })
})

describe("DrawerProvider", () => {
  it.effect("is active while a drawer below it is open", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const parts = [Locator.attr("class", "indent"), Locator.attr("class", "background")]
      const expectActive = (active: boolean) => {
        for (const part of parts) {
          assert.strictEqual(root.get(part).attrs?.["data-active"], active ? "" : undefined)
          assert.strictEqual(root.get(part).attrs?.["data-inactive"], active ? undefined : "")
        }
      }
      expectActive(false)
      assert.strictEqual(root.get(parts[0]!).attrs?.style, "--drawer-swipe-progress:0")
      Locator.fire(root.get(Locator.text("Open", { exact: true })), "click")
      yield* TestHost.settle
      expectActive(true)
      Locator.fire(root.get(Locator.text("Close", { exact: true })), "click")
      yield* TestHost.settle
      expectActive(false)
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})

// A drawer in a dialog's popup, and a dialog in the drawer's, all open.
const Mixed = Component.define({
  name: "Mixed",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    Dialog(h, {
      key: "outer",
      props: { open: true },
      view: (outerDialog) =>
        h.div(
          outerDialog.portal(h.dialog)?.children(
            outerDialog.popup(h.div.class("outer")).children(
              Drawer(h, {
                props: { open: true },
                view: (drawer) =>
                  h.div(
                    drawer.portal(h.dialog)?.children(
                      drawer.popup(h.div.class("middle")).children(
                        Dialog(h, {
                          key: "inner",
                          props: { open: true },
                          view: (innerDialog) =>
                            h.div(innerDialog.portal(h.dialog)?.children(innerDialog.popup(h.div.class("inner"))))
                        })
                      )
                    )
                  )
              })
            )
          )
        )
    })
})

describe("a Drawer among Dialogs", () => {
  it.effect("is a nested dialog inside a dialog, and counts the dialog inside it", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Mixed, {})
      yield* TestHost.settle
      const attrsOf = (name: string) => root.get(Locator.attr("class", name)).attrs
      assert.include(attrsOf("outer")?.style, "--nested-dialogs:2")
      assert.isUndefined(attrsOf("outer")?.["data-nested"])
      assert.deepInclude(attrsOf("middle"), { "data-nested": "", "data-nested-dialog-open": "" })
      assert.include(attrsOf("middle")?.style, "--nested-dialogs:1")
      assert.isUndefined(attrsOf("middle")?.["data-nested-drawer-open"])
      assert.strictEqual(attrsOf("inner")?.["data-nested"], "")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
