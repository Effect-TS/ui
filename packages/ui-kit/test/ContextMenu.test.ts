import type { Component, Mount, View } from "@effect/ui"
import { Menu, type MenuEvents, type MenuProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

type Parts = Component.Headless.Parts<typeof Menu>
type H = View.Helper<never, MenuProps> & View.Tags<Html.Elements, never>

const items = [
  { value: "copy", label: "Copy" },
  { value: "paste", label: "Paste" }
]

const standIn = {
  elements: Html,
  view: (menu: Parts, h: H) =>
    h.div(
      menu.trigger({ element: h.button.class("button").attr("id", "more") })
        .children("More"),
      menu.contextTrigger(h.div.class("area").attr("id", "row")).children(
        "Row"
      ),
      menu.positioner(h.div.class("positioner")).children(
        menu.popup(h.div.class("popup")).children(
          menu.item({
            element: h.div.attr("data-testid", "copy"),
            value: "copy"
          }).children("Copy"),
          menu.item({
            element: h.div.attr("data-testid", "paste"),
            value: "paste"
          }).children("Paste")
        )
      )
    )
}

const area = Locator.attr("class", "area")
const button = Locator.attr("class", "button")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")

type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (
  scene: Rendered,
  locator: Locator.Locator
): Mount.Issued<unknown, never, never, unknown> =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Mount.Issued<unknown, never, never, unknown>
const tracked = (scene: Rendered) => mountOf(scene, positioner)
const longPress = (scene: Rendered) => mountOf(scene, area)
const trackedArgs = (scene: Rendered) => tracked(scene).args as any
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never
const touch = (tag: "Started" | "Cancelled", fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const opened = (triggerId: string) =>
  ({ _tag: "RequestedOpen", reason: "trigger-press", triggerId }) as MenuEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as MenuEvents
const rightClick = (x: number, y: number, pointerType = "mouse") => ({
  button: 2,
  x,
  y,
  pointerType
})

const keyPress = (key: string, extra: object = {}) => ({
  key,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  composing: false,
  ...extra
})

type Pending = {
  readonly current: {
    readonly pending: ReadonlyArray<{ readonly command: any }>
  }
}

const elapse = Effect.fnUntraced(
  function*<
    S extends Pending & { readonly resolve: (command: any, result: any) => S }
  >(
    scene: S,
    name: string,
    millis: number
  ) {
    const command =
      scene.current.pending.find((run) => run.command.name === name)!.command
    const fiber = yield* Effect.forkChild(
      command.effect as Effect.Effect<unknown>
    )
    yield* TestClock.adjust(`${millis - 1} millis`)
    assert.isUndefined(fiber.pollUnsafe())
    yield* TestClock.adjust("1 millis")
    return scene.resolve(command, yield* Fiber.join(fiber))
  }
)

describe("Menu contextTrigger", () => {
  it.effect("a right click opens a modal menu at the pointer, and the menu's own trigger still opens it as a menu button", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      scene.expectMount(longPress(scene))
      assert.include(scene.get(area).attrs?.style, "-webkit-touch-callout:none")
      assert.isUndefined(scene.get(area).attrs?.["aria-haspopup"])
      scene.fire(area, "contextmenu", rightClick(100, 50))
        .expectDefaultPrevented()
        .emitted(opened("row"))
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepInclude(scene.get(area).attrs, {
        "data-popup-open": "",
        "data-pressed": ""
      })
      assert.deepInclude(scene.get(button).attrs, { "aria-expanded": "false" })
      assert.isUndefined(scene.get(popup).attrs?.["aria-labelledby"])
      const args = trackedArgs(scene)
      assert.deepInclude(args, { lock: true, context: true, release: true })
      assert.deepInclude(args.position, {
        anchorRect: { x: 100, y: 50, width: 0, height: 0 },
        positionMethod: "fixed"
      })
      assert.deepInclude(args.position.options, {
        side: "bottom",
        align: "start",
        sideOffset: -5,
        alignOffset: 2,
        arrowPadding: 0,
        shiftCrossAxis: true
      })

      scene.props({ open: false, items })
      scene.fire(button, "mousedown", {
        button: 0,
        x: 0,
        y: 0,
        pointerType: "mouse"
      }).emitted(opened("more"))
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.isUndefined(scene.get(area).attrs?.["data-popup-open"])
      assert.deepInclude(trackedArgs(scene), { context: false, release: false })
      assert.deepInclude(trackedArgs(scene).position, {
        anchorRect: null,
        positionMethod: "absolute"
      })
      assert.deepInclude(trackedArgs(scene).position.options, {
        align: "center",
        shiftCrossAxis: false
      })

      yield* elapse(scene, "WaitBeforeContextGrace", 500)
    }))

  it.effect("the Menu key and Shift+F10 open it against the focusable trigger on the first item, once, and another right click moves it", () =>
    Effect.gen(function*() {
      const menuKey = yield* HtmlScene.make(
        Menu,
        { open: false, items },
        standIn
      )
      menuKey.expectMount(longPress(menuKey))
        .fire(area, "keydown", keyPress("ContextMenu"))
        .expectDefaultPrevented()
        .emitted(
          { _tag: "Highlighted", value: "copy", reason: "none" },
          opened("row")
        )
      // A second press is the user's, however soon it comes.
      menuKey.fire(area, "keydown", keyPress("F10", { shift: true }))
        .emitted(opened("row"))
      yield* elapse(menuKey, "WaitBeforeContextGrace", 500)
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      scene.expectMount(longPress(scene))
      assert.strictEqual(scene.get(area).attrs?.tabindex, "0")
      scene.fire(area, "keydown", keyPress("F10", { shift: true }))
        .expectDefaultPrevented()
        .emitted(
          { _tag: "Highlighted", value: "copy", reason: "none" },
          opened("row")
        )
      // The browser's own `contextmenu` for the same key opens nothing more.
      scene.fire(area, "contextmenu", rightClick(0, 0, "")).expectHandled()
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.isNull(trackedArgs(scene).position.anchorRect)
      assert.deepInclude(trackedArgs(scene).position.options, {
        sideOffset: 0,
        alignOffset: 0
      })
      scene.fire(area, "contextmenu", rightClick(200, 80)).emitted(
        { _tag: "Highlighted", value: null, reason: "none" },
        opened("row")
      )
      assert.deepStrictEqual(trackedArgs(scene).position.anchorRect, {
        x: 200,
        y: 80,
        width: 0,
        height: 0
      })
      yield* elapse(scene, "WaitBeforeContextGrace", 500)
    }))

  it.effect("a long press opens it under the finger after 500ms unless cancelled, and a press outside waits 500ms", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      scene.mounted(longPress(scene), touch("Started", { x: 30, y: 40 }))
      scene.mounted(longPress(scene), touch("Cancelled"))
      if (
        scene.current.pending.some((run) =>
          run.command.name === "WaitBeforeLongPress"
        )
      ) {
        yield* elapse(scene, "WaitBeforeLongPress", 500)
      }
      assert.isEmpty(scene.current.emitted)
      scene.mounted(longPress(scene), touch("Started", { x: 30, y: 40 }))
      yield* elapse(scene, "WaitBeforeLongPress", 500)
      scene.emitted(opened("row"))
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepInclude(trackedArgs(scene), { touch: true, release: false })
      assert.deepStrictEqual(trackedArgs(scene).position.anchorRect, {
        x: 30,
        y: 40,
        width: 10,
        height: 10
      })
      scene.mounted(
        tracked(scene),
        sent("PressedOutside", { pointerType: "touch" })
      )
      yield* elapse(scene, "WaitBeforeContextGrace", 500)
      scene.mounted(
        tracked(scene),
        sent("PressedOutside", { pointerType: "touch" })
      )
        .emitted(dismissed("outside-press"))
    }))

  it.effect("the first release after a right click closes it with cancel-open only away from the popup and after 500ms", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      scene.expectMount(longPress(scene))
      scene.fire(area, "contextmenu", rightClick(100, 50)).emitted(
        opened("row")
      )
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.mounted(
        tracked(scene),
        sent("ReleasedContextPointer", { outside: true })
      )
      assert.isFalse(trackedArgs(scene).release)
      scene.fire(area, "contextmenu", rightClick(100, 50)).emitted(
        opened("row")
      )
      yield* elapse(scene, "WaitBeforeContextGrace", 500)
      scene.mounted(
        tracked(scene),
        sent("ReleasedContextPointer", { outside: false })
      )
      scene.fire(area, "contextmenu", rightClick(100, 50)).emitted(
        opened("row")
      )
      yield* elapse(scene, "WaitBeforeContextGrace", 500)
      scene.mounted(
        tracked(scene),
        sent("ReleasedContextPointer", { outside: true })
      )
        .emitted(dismissed("cancel-open"))
    }))
})
