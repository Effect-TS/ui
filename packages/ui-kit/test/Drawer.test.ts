import { type Component, type Mount, UiSchema, type View } from "@effect/ui"
import {
  Dialog,
  Drawer,
  type DrawerEvents,
  type DrawerProps,
  DrawerProvider
} from "@effect/ui-kit"
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
      drawer.swipeArea({
        element: h.div.class("area").attr("style", "z-index:1")
      }),
      drawer.backdrop(h.div.class("backdrop").attr("data-swiping", "x")),
      drawer.viewport(h.div.class("viewport")).children(
        drawer.popup(
          h.div.class("popup")
            .attrs({
              "data-swiping": "x",
              "data-swipe-direction": "sideways",
              "data-nested-drawer-open": "x",
              style: "color:red"
            })
        ).children(drawer.content(h.div.class("content")))
      )
    )
}

const popup = Locator.attr("class", "popup")
const area = Locator.attr("class", "area")

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const trackedOn = (locator: Locator.Locator) => (scene: Rendered): Track =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Track
const tracked = trackedOn(popup)
const trackedArea = trackedOn(area)
const argsOf = (mount: Track) => mount.args as Record<string, unknown>
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

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

const swiped = { _tag: "RequestedClose", reason: "swipe" } as DrawerEvents

const opened = {
  _tag: "RequestedOpen",
  triggerId: null,
  reason: "swipe"
} as DrawerEvents
const snapped = (snapPoint: number | string) =>
  ({ _tag: "Snapped", snapPoint }) as DrawerEvents
const measured = sent("Measured", { height: 800, viewport: 800, fontSize: 16 })

const openedByArea = Effect.gen(function*() {
  const scene = yield* Scene.make(Drawer, { open: false }, standIn)
  scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
    .mounted(
      trackedArea(scene),
      sent("StartedAreaSwipe", { key: argsOf(trackedArea(scene)).key })
    )
    .emitted(opened)
    .props({ open: true })
  return scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
})

describe("Drawer", () => {
  it.effect("decides from a release's distance, speed, direction and reversal whether to dismiss or settle", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, { open: true }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
        .mounted(tracked(scene), sent("StartedSwipe"))
      assert.strictEqual(scene.get(popup).attrs?.["data-swiping"], "")
      for (
        const settled of [
          release({ deltaY: 50, velocityY: 0.1, releaseVelocityY: 0.1 }),
          release({
            deltaY: 30,
            velocityY: 1,
            releaseVelocityY: 1,
            reversed: true
          }),
          release({ direction: null, deltaY: -12, velocityY: -1 })
        ]
      ) {
        scene.mounted(tracked(scene), settled)
        assert.deepStrictEqual(scene.current.emitted, [])
      }
      scene.mounted(tracked(scene), release({ deltaY: 30, velocityY: 0.5 }))
        .emitted(swiped)
      scene.mounted(tracked(scene), sent("StartedSwipe"))
      scene.mounted(tracked(scene), release({ deltaY: 150, velocityY: 0.3 }))
        .emitted(swiped)
      assert.isUndefined(scene.get(popup).attrs?.["data-swiping"])
    }))

  it.effect("dismisses to the left, the right and up", () =>
    Effect.gen(function*() {
      const cases = [
        ["left", { deltaX: -200 }, { deltaX: -100 }],
        ["right", { deltaX: 200 }, { deltaX: 100 }],
        ["up", { deltaY: -150 }, { deltaY: -50 }]
      ] as const
      for (const [direction, long, short] of cases) {
        const scene = yield* Scene.make(Drawer, {
          open: true,
          swipeDirection: direction
        }, standIn)
        assert.strictEqual(
          scene.get(popup).attrs?.["data-swipe-direction"],
          direction
        )
        scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
          .mounted(tracked(scene), release({ direction, ...short }))
        assert.deepStrictEqual(scene.current.emitted, [])
        scene.expectMount(tracked(scene)).mounted(
          tracked(scene),
          release({ direction, ...long })
        ).emitted(swiped)
      }
    }))

  it.effect("snaps between snap points, obeys snapToSequentialPoints, and dismisses on a strong flick down", () =>
    Effect.gen(function*() {
      const flickUp = release({
        direction: "up",
        deltaY: -100,
        velocityY: -1,
        releaseVelocityY: -3,
        height: 800
      })
      const scene = yield* Scene.make(Drawer, {
        open: true,
        snapPoints: [0.25, 0.5, 1]
      }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene)).mounted(
        tracked(scene),
        measured
      )
      assert.match(
        scene.get(popup).attrs?.style ?? "",
        /--drawer-height:800px;.*--drawer-snap-point-offset:600px;/
      )
      scene.expectMount(tracked(scene))
        .mounted(tracked(scene), flickUp)
        .emitted(snapped(1))
        .expectMount(tracked(scene))
        .mounted(
          tracked(scene),
          release({ direction: "up", deltaY: -250, height: 800 })
        )
        .emitted(snapped(0.5))
        .expectMount(tracked(scene))
        .mounted(
          tracked(scene),
          release({
            deltaY: 50,
            velocityY: 1,
            releaseVelocityY: 2,
            height: 800
          })
        )
        .emitted(swiped)
        .props({
          open: true,
          snapPoints: [0.25, 0.5, 1],
          snapToSequentialPoints: true
        })
        .expectMount(tracked(scene))
        .mounted(tracked(scene), flickUp)
        .emitted(snapped(0.5))
        .expectMount(tracked(scene))
        .mounted(
          tracked(scene),
          release({ direction: "up", deltaY: -590, height: 800 })
        )
        .emitted(snapped(1))
    }))

  it.effect("snapTrigger moves to the next snap point and wraps, and snapStatus is a live region", () =>
    Effect.gen(function*() {
      const snapTrigger = Locator.attr("class", "snap")
      const status = Locator.attr("class", "status")
      const snapStandIn = {
        elements: Html,
        view: (drawer: Parts, h: H) =>
          drawer.popup(h.div.class("popup")).children(
            drawer.snapTrigger(
              h.button.class("snap").attr("aria-disabled", "true")
            ),
            drawer.snapStatus(h.div.class("status"))
          )
      }
      // Before measurement the order given, without the repeat. After, by height.
      const snapPoints = [0.5, 0.5, "240px", 1]
      const scene = yield* Scene.make(
        Drawer,
        { open: true, snapPoints: [0.5, 0.5] },
        snapStandIn
      )
      scene.expectMount(tracked(scene))
      assert.deepInclude(scene.get(status).attrs, {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      })
      assert.deepInclude(scene.get(snapTrigger).attrs, {
        type: "button",
        disabled: "",
        "data-disabled": ""
      })
      scene.click(snapTrigger)
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.props({ open: true, snapPoints, snapPoint: 0.5 })
        .expectMount(tracked(scene))
      assert.isUndefined(scene.get(snapTrigger).attrs?.disabled)
      assert.isUndefined(scene.get(snapTrigger).attrs?.["aria-disabled"])
      scene.click(snapTrigger).emitted(snapped("240px"))
        .mounted(tracked(scene), measured)
        .expectMount(tracked(scene))
        .click(snapTrigger).emitted(snapped(1))
        .props({ open: true, snapPoints, snapPoint: 1 })
        .expectMount(tracked(scene))
        .click(snapTrigger).emitted(snapped("240px"))

      // Horizontal drawers and collapsed snap points disable the trigger.
      scene.props({ open: true, snapPoints, swipeDirection: "left" })
        .expectMount(tracked(scene))
      assert.strictEqual(scene.get(snapTrigger).attrs?.disabled, "")

      scene.props({ open: true, snapPoints: [0.5, 1] })
        .expectMount(tracked(scene))
        .mounted(
          tracked(scene),
          sent("Measured", { height: 400, viewport: 800, fontSize: 16 })
        )
      assert.strictEqual(scene.get(snapTrigger).attrs?.disabled, "")
      scene.expectMount(tracked(scene))
    }))

  it.effect("a refused dismiss puts the drawer back", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, { open: true }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
        .mounted(
          tracked(scene),
          release({ deltaY: 150, velocityY: 1, releaseVelocityY: 1 })
        )
        .emitted(swiped)
      assert.isTrue(argsOf(tracked(scene)).dismissed)
      assert.notInclude(
        scene.get(popup).attrs?.style,
        "--drawer-swipe-strength:1;"
      )
      scene.props({ open: false })
      assert.strictEqual(scene.get(popup).attrs?.["data-swipe-dismiss"], "")
      scene.props({ open: true })
      scene.expectMount(tracked(scene)).mounted(
        tracked(scene),
        sent("RefusedSwipe")
      )
      assert.isFalse(argsOf(tracked(scene)).dismissed)
      assert.include(
        scene.get(popup).attrs?.style,
        "--drawer-swipe-strength:1;"
      )
      scene.props({ open: false })
      assert.isUndefined(scene.get(popup).attrs?.["data-swipe-dismiss"])
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
    }))

  it.effect("emits what its dialog emits, an open with the reason trigger-press", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, { open: true }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
        .childEmit(Dialog, { _tag: "RequestedOpen", triggerId: "menu" })
        .emitted({
          _tag: "RequestedOpen",
          triggerId: "menu",
          reason: "trigger-press"
        })
        .childEmit(Dialog, { _tag: "RequestedClose", reason: "escape-key" })
        .emitted({ _tag: "RequestedClose", reason: "escape-key" })
        .childEmit(Dialog, { _tag: "Settled", open: false })
        .emitted({ _tag: "Settled", open: false })
    }))

  it.effect("a nested drawer's report marks the popup and stops its swipes", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, { open: true }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
        .mounted(
          tracked(scene),
          sent("ChangedNested", { count: 2, swiping: true, height: 300 })
        )
      assert.deepInclude(scene.get(popup).attrs, {
        "data-nested-drawer-open": "",
        "data-nested-drawer-swiping": ""
      })
      assert.include(scene.get(popup).attrs?.style, "--nested-drawers:2;")
      assert.include(
        scene.get(popup).attrs?.style,
        "--drawer-frontmost-height:300px;"
      )
      assert.isFalse(argsOf(tracked(scene)).enabled)
      scene.parts((drawer) => {
        assert.strictEqual(drawer.nestedDrawers, 2)
        assert.isTrue(drawer.nestedDrawerSwiping)
      })
      scene.expectMount(tracked(scene))
    }))

  it.effect("the drawer's attributes win, and the consumer's style is kept", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, {
        open: true,
        swipeDirection: "left",
        snapPoints: [1]
      }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
      const attrs = scene.get(popup).attrs
      assert.deepInclude(attrs, { "data-swipe-direction": "left" })
      assert.isUndefined(attrs?.["data-swiping"])
      assert.isUndefined(attrs?.["data-nested-drawer-open"])
      assert.match(attrs?.style ?? "", /^color:red;--nested-drawers:0;/)
      assert.isUndefined(
        scene.get(Locator.attr("class", "backdrop")).attrs?.["data-swiping"]
      )
      assert.strictEqual(
        scene.get(area).attrs?.style,
        "z-index:1;touch-action:pan-y;pointer-events:none"
      )
      assert.strictEqual(
        scene.get(Locator.attr("class", "content")).attrs
          ?.["data-drawer-content"],
        ""
      )
      scene.parts((drawer) => {
        assert.strictEqual(drawer.swipeDirection, "left")
        assert.isTrue(drawer.expanded)
      })
    }))

  it.effect("a swipe on the area opens the drawer, and release distance or speed decides whether it stays open", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, { open: false }, standIn)
      scene.expectMount(tracked(scene)).expectMount(trackedArea(scene))
      assert.deepInclude(scene.get(area).attrs, {
        "data-closed": "",
        "data-swipe-direction": "up"
      })
      scene.mounted(
        trackedArea(scene),
        sent("StartedAreaSwipe", { key: argsOf(trackedArea(scene)).key })
      )
        .emitted(opened)
      assert.deepInclude(scene.get(area).attrs, { "data-swiping": "" })
      assert.strictEqual(scene.get(popup).attrs?.["data-swiping"], "")
      scene.props({ open: true }).expectMount(tracked(scene)).expectMount(
        trackedArea(scene)
      )
        .mounted(
          trackedArea(scene),
          sent("ReleasedAreaSwipe", {
            displacement: 100,
            velocity: 0.05,
            size: 400
          })
        )
        .emitted(swiped)

      const long = yield* openedByArea
      long.mounted(
        trackedArea(long),
        sent("ReleasedAreaSwipe", { displacement: 200, velocity: 0, size: 400 })
      )
      assert.deepStrictEqual(long.current.emitted, [])
      long.expectMount(tracked(long)).expectMount(trackedArea(long))

      const fast = yield* openedByArea
      fast.mounted(
        trackedArea(fast),
        sent("ReleasedAreaSwipe", {
          displacement: 10,
          velocity: 0.1,
          size: null
        })
      )
      assert.deepStrictEqual(fast.current.emitted, [])
      fast.expectMount(tracked(fast)).expectMount(trackedArea(fast))
    }))

  it.effect("a disabled area takes no pointer", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Drawer, { open: false }, {
        elements: Html,
        view: (drawer: Parts, h: H) =>
          h.div(
            drawer.swipeArea({
              element: h.div.class("area"),
              swipeDirection: "left",
              disabled: true
            })
          )
      })
      scene.expectMount(trackedArea(scene))
      assert.isTrue(argsOf(trackedArea(scene)).disabled)
      assert.deepInclude(scene.get(area).attrs, {
        "data-disabled": "",
        "data-swipe-direction": "left",
        style: "touch-action:pan-y;pointer-events:none"
      })
    }))
})

const PageMessage = UiSchema.TaggedEnum({ Toggled: { open: Schema.Boolean } })
const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ open: Schema.Boolean }),
  message: PageMessage
}).make({
  init: () => ({ open: false }),
  update: {
    Toggled: ($, { open }) => ({ ...$.model, open })
  },
  view: (h, model) =>
    DrawerProvider(h, {
      view: (drawerProvider) =>
        h.div(
          drawerProvider.indentBackground(h.div.class("background")),
          drawerProvider.indent(h.div.class("indent")),
          Drawer(h, {
            props: { open: model.open },
            onEmit: {
              RequestedOpen: () => PageMessage.Toggled({ open: true }),
              RequestedClose: () => PageMessage.Toggled({ open: false }),
              Settled: () => undefined,
              Snapped: () => undefined
            },
            view: (drawer) =>
              h.div(
                drawer.trigger(h.button).children("Open"),
                drawer.portal(h.dialog)?.children(
                  drawer.popup(h.div).children(
                    drawer.close(h.button).children("Close")
                  )
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
      const parts = [
        Locator.attr("class", "indent"),
        Locator.attr("class", "background")
      ]
      const expectActive = (active: boolean) => {
        for (const part of parts) {
          assert.strictEqual(
            root.get(part).attrs?.["data-active"],
            active ? "" : undefined
          )
          assert.strictEqual(
            root.get(part).attrs?.["data-inactive"],
            active ? undefined : ""
          )
        }
      }
      expectActive(false)
      assert.strictEqual(
        root.get(parts[0]!).attrs?.style,
        "--drawer-swipe-progress:0"
      )
      Locator.fire(root.get(Locator.text("Open", { exact: true })), "click")
      yield* TestHost.settle
      expectActive(true)
      Locator.fire(root.get(Locator.text("Close", { exact: true })), "click")
      yield* TestHost.settle
      expectActive(false)
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})

// A drawer in a dialog's popup, and a dialog in the drawer's, all open.
const Mixed = Html.component({
  name: "Mixed",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
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
                            h.div(
                              innerDialog.portal(h.dialog)?.children(
                                innerDialog.popup(h.div.class("inner"))
                              )
                            )
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
      const attrsOf = (name: string) =>
        root.get(Locator.attr("class", name)).attrs
      assert.include(attrsOf("outer")?.style, "--nested-dialogs:2")
      assert.isUndefined(attrsOf("outer")?.["data-nested"])
      assert.deepInclude(attrsOf("middle"), {
        "data-nested": "",
        "data-nested-dialog-open": ""
      })
      assert.include(attrsOf("middle")?.style, "--nested-dialogs:1")
      assert.isUndefined(attrsOf("middle")?.["data-nested-drawer-open"])
      assert.strictEqual(attrsOf("inner")?.["data-nested"], "")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
