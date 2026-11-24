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
    h.div([
      menu.trigger({ element: h.button.class(["button"]).attr("id", "more") })
        .children(["More"]),
      menu.contextTrigger(h.div.class(["area"]).attr("id", "row")).children([
        "Row"
      ]),
      menu.positioner(h.div.class(["positioner"])).children([
        menu.popup(h.div.class(["popup"])).children([
          menu.item({
            element: h.div.attr("data-testid", "copy"),
            value: "copy"
          }).children(["Copy"]),
          menu.item({
            element: h.div.attr("data-testid", "paste"),
            value: "paste"
          }).children(["Paste"])
        ])
      ])
    ])
}

const area = Locator.attr("class", "area")
const button = Locator.attr("class", "button")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")

type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (
  s: Rendered,
  locator: Locator.Locator
): Mount.Issued<unknown, never, never, unknown> =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) =>
    layer.mount !== undefined
  )
    ?.mount as unknown as Mount.Issued<unknown, never, never, unknown>
const tracked = (s: Rendered) => mountOf(s, positioner)
const longPress = (s: Rendered) => mountOf(s, area)
const trackedArgs = (s: Rendered) => tracked(s).args as any
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

type Pending = {
  readonly current: {
    readonly pending: ReadonlyArray<{ readonly command: any }>
  }
}

const elapse = Effect.fnUntraced(
  function*<
    S extends Pending & { readonly resolve: (command: any, result: any) => S }
  >(
    s: S,
    name: string,
    millis: number
  ) {
    const command =
      s.current.pending.find((run) => run.command.name === name)!.command
    const fiber = yield* Effect.forkChild(
      command.effect as Effect.Effect<unknown>
    )
    yield* TestClock.adjust(`${millis - 1} millis`)
    assert.isUndefined(fiber.pollUnsafe())
    yield* TestClock.adjust("1 millis")
    return s.resolve(command, yield* Fiber.join(fiber))
  }
)

describe("Menu contextTrigger", () => {
  it.effect("a right click opens a modal menu at the pointer, and the menu's own trigger still opens it as a menu button", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      s.expectMount(longPress(s))
      assert.include(s.get(area).attrs?.style, "-webkit-touch-callout:none")
      assert.isUndefined(s.get(area).attrs?.["aria-haspopup"])
      s.fire(area, "contextmenu", rightClick(100, 50)).expectDefaultPrevented()
        .emitted([opened("row")])
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepInclude(s.get(area).attrs, {
        "data-popup-open": "",
        "data-pressed": ""
      })
      assert.deepInclude(s.get(button).attrs, { "aria-expanded": "false" })
      assert.isUndefined(s.get(popup).attrs?.["aria-labelledby"])
      const args = trackedArgs(s)
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

      s.props({ open: false, items })
      s.fire(button, "mousedown", {
        button: 0,
        x: 0,
        y: 0,
        pointerType: "mouse"
      }).emitted([opened("more")])
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      assert.isUndefined(s.get(area).attrs?.["data-popup-open"])
      assert.deepInclude(trackedArgs(s), { context: false, release: false })
      assert.deepInclude(trackedArgs(s).position, {
        anchorRect: null,
        positionMethod: "absolute"
      })
      assert.deepInclude(trackedArgs(s).position.options, {
        align: "center",
        shiftCrossAxis: false
      })

      yield* elapse(s, "WaitBeforeContextGrace", 500)
    }))

  it.effect("the context menu key opens it against the trigger on the first item, and another right click moves it", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      s.expectMount(longPress(s))
      s.fire(area, "contextmenu", rightClick(0, 0, "")).emitted([
        { _tag: "Highlighted", value: "copy", reason: "none" },
        opened("row")
      ])
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      assert.isNull(trackedArgs(s).position.anchorRect)
      assert.deepInclude(trackedArgs(s).position.options, {
        sideOffset: 0,
        alignOffset: 0
      })
      s.fire(area, "contextmenu", rightClick(200, 80)).emitted([
        { _tag: "Highlighted", value: null, reason: "none" },
        opened("row")
      ])
      assert.deepStrictEqual(trackedArgs(s).position.anchorRect, {
        x: 200,
        y: 80,
        width: 0,
        height: 0
      })
      yield* elapse(s, "WaitBeforeContextGrace", 500)
    }))

  it.effect("a long press opens it under the finger after 500ms unless cancelled, and a press outside waits 500ms", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      s.mounted(longPress(s), touch("Started", { x: 30, y: 40 }))
      s.mounted(longPress(s), touch("Cancelled"))
      if (
        s.current.pending.some((run) =>
          run.command.name === "WaitBeforeLongPress"
        )
      ) {
        yield* elapse(s, "WaitBeforeLongPress", 500)
      }
      assert.isEmpty(s.current.emitted)
      s.mounted(longPress(s), touch("Started", { x: 30, y: 40 }))
      yield* elapse(s, "WaitBeforeLongPress", 500)
      s.emitted([opened("row")])
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepInclude(trackedArgs(s), { touch: true, release: false })
      assert.deepStrictEqual(trackedArgs(s).position.anchorRect, {
        x: 30,
        y: 40,
        width: 10,
        height: 10
      })
      s.mounted(tracked(s), sent("PressedOutside", { pointerType: "touch" }))
      yield* elapse(s, "WaitBeforeContextGrace", 500)
      s.mounted(tracked(s), sent("PressedOutside", { pointerType: "touch" }))
        .emitted([dismissed("outside-press")])
    }))

  it.effect("the first release after a right click closes it with cancel-open only away from the popup and after 500ms", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      s.expectMount(longPress(s))
      s.fire(area, "contextmenu", rightClick(100, 50)).emitted([opened("row")])
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      s.mounted(tracked(s), sent("ReleasedContextPointer", { outside: true }))
      assert.isFalse(trackedArgs(s).release)
      s.fire(area, "contextmenu", rightClick(100, 50)).emitted([opened("row")])
      yield* elapse(s, "WaitBeforeContextGrace", 500)
      s.mounted(tracked(s), sent("ReleasedContextPointer", { outside: false }))
      s.fire(area, "contextmenu", rightClick(100, 50)).emitted([opened("row")])
      yield* elapse(s, "WaitBeforeContextGrace", 500)
      s.mounted(tracked(s), sent("ReleasedContextPointer", { outside: true }))
        .emitted([dismissed("cancel-open")])
    }))
})
