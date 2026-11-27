import type { Component, Mount, View } from "@effect/ui"
import {
  DirectionProvider,
  SortableList,
  type SortableListProps
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof SortableList>
type H =
  & View.Helper<never, SortableListProps>
  & View.Tags<Html.Elements, never>

const formatAnnouncement = (announcement: Parts["announcement"]): string =>
  announcement === undefined
    ? ""
    : `${announcement._tag}:${announcement.id}:${announcement.position}/${announcement.count}`

const standIn = {
  elements: Html,
  view: (sortableList: Parts, h: H) =>
    h.div(
      sortableList.list(h.ul.attr("data-testid", "list")).children(
        h.props.items.map((id) =>
          sortableList.item({
            element: h.li.attr("data-testid", `item-${id}`),
            id
          }).children(
            sortableList.handle({
              element: h.button.attr("data-testid", `handle-${id}`),
              id
            }).children(`Reorder ${id}`)
          )
        )
      ),
      sortableList.status(h.div.attr("data-testid", "status")).children(
        formatAnnouncement(sortableList.announcement)
      )
    )
}

const list = Locator.attr("data-testid", "list")
const item = (id: string) => Locator.attr("data-testid", `item-${id}`)
const handle = (id: string) => Locator.attr("data-testid", `handle-${id}`)
const status = Locator.attr("data-testid", "status")

const mouse = {
  button: 0,
  x: 0,
  y: 0,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  pointerType: "mouse"
} as const

const topHalf = { x: 10, y: 5, width: 100, height: 40 }
const bottomHalf = { x: 10, y: 30, width: 100, height: 40 }

interface Scene {
  readonly current: {
    readonly pending: ReadonlyArray<{ readonly command: unknown }>
  }
  readonly resolve: (command: never, result: never) => unknown
  readonly get: (locator: Locator.Locator) => Locator.Node
}

const drain = <S extends Scene>(scene: S): S => {
  for (const { command } of scene.current.pending) {
    scene.resolve(command as never, { found: true } as never)
  }
  return scene
}

const dragDataOf = (
  scene: Scene,
  locator: Locator.Locator
): Readonly<Record<string, string>> => {
  const node = scene.get(locator) as unknown as View.Element<unknown>
  for (const layer of [node, ...(node.owned ?? [])]) {
    const options = layer.eventOptions.dragstart as
      | Html.DragSourceOptions
      | undefined
    if (options?.data !== undefined) return options.data
  }
  throw new Error(`No draggable data found on ${locator.description}`)
}

describe("SortableList", () => {
  it.effect("keyboard pickup, stepping, and drop emit one Reordered with indicator attrs and announcements", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"] },
        standIn
      )

      assert.strictEqual(
        scene.get(list).attrs?.["data-orientation"],
        "vertical"
      )
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      assert.deepInclude(scene.get(status).attrs, {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      })
      scene.expect(status).toHaveText("")

      scene.click(handle("a"))
      drain(scene)
      assert.strictEqual(scene.get(list).attrs?.["data-moving"], "")
      assert.strictEqual(scene.get(item("a")).attrs?.["data-moving"], "")
      assert.strictEqual(scene.get(handle("a")).attrs?.["aria-pressed"], "true")
      assert.isUndefined(scene.get(item("a")).attrs?.["data-drop-position"])
      assert.isUndefined(scene.get(item("b")).attrs?.["data-drop-position"])
      scene.expect(status).toHaveText("PickedUp:a:1/3")

      scene.keydown(handle("a"), "ArrowDown").expectDefaultPrevented()
      drain(scene)
      assert.strictEqual(
        scene.get(item("b")).attrs?.["data-drop-position"],
        "after"
      )
      scene.expect(status).toHaveText("Moved:a:2/3")

      scene.keydown(handle("a"), "End").expectDefaultPrevented()
      drain(scene)
      assert.strictEqual(
        scene.get(item("c")).attrs?.["data-drop-position"],
        "after"
      )
      scene.expect(status).toHaveText("Moved:a:3/3")

      scene.keydown(handle("a"), "ArrowDown")
      drain(scene)
      scene.expect(status).toHaveText("Moved:a:3/3")

      scene.keydown(handle("a"), "Home").expectDefaultPrevented()
      drain(scene)
      assert.isUndefined(scene.get(item("a")).attrs?.["data-drop-position"])
      assert.isUndefined(scene.get(item("c")).attrs?.["data-drop-position"])
      scene.expect(status).toHaveText("Moved:a:1/3")

      scene.keydown(handle("a"), "ArrowDown").expectDefaultPrevented()
      drain(scene)

      scene.click(handle("a")).emitted({ _tag: "Reordered", from: 0, to: 1 })
      drain(scene)
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      assert.isUndefined(scene.get(item("a")).attrs?.["data-moving"])
      assert.isUndefined(scene.get(item("b")).attrs?.["data-drop-position"])
      assert.notStrictEqual(
        scene.get(handle("a")).attrs?.["aria-pressed"],
        "true"
      )

      // Dropped follows the consumer’s order until the outcome becomes stale.
      scene.props({ items: ["b", "a", "c"] })
      scene.expect(status).toHaveText("Dropped:a:2/3")
      scene.props({ items: ["b", "a", "c", "d"] })
      scene.expect(status).toHaveText("")
      scene.subscription("changedProps", { _tag: "ChangedProps" })
      scene.props({ items: ["b", "a", "c"] })
      scene.expect(status).toHaveText("")

      scene.click(handle("c"))
      drain(scene)
      scene.keydown(handle("c"), "ArrowUp").expectDefaultPrevented()
      drain(scene)
      assert.strictEqual(
        scene.get(item("a")).attrs?.["data-drop-position"],
        "before"
      )
      scene.keydown(handle("c"), "Escape").expectDefaultPrevented()
      drain(scene)
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      scene.expect(status).toHaveText("Cancelled:c:3/3")

      scene.click(handle("b"))
      drain(scene)
      scene.click(handle("b"))
      drain(scene)
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("focusout cancels a move unless focus stays in the list or a handle press is in progress", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"] },
        standIn
      )

      scene.click(handle("a"))
      drain(scene)
      scene.fire(list, "focusout", { within: true, disabled: false })
        .expectIgnored()

      // Safari and iOS blur on mousedown before the click lands.
      scene.fire(handle("c"), "mousedown", mouse)
      scene.fire(list, "focusout", { within: false, disabled: false })
      assert.strictEqual(scene.get(list).attrs?.["data-moving"], "")

      // A press released off the handle sends no click; leaving then cancels.
      scene.fireDocument("mouseup", mouse)
      scene.fire(list, "focusout", { within: false, disabled: false })
      drain(scene)
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      scene.expect(status).toHaveText("Cancelled:a:1/3")
    }))

  it.effect("prop changes mid-move clamp a shortened list and end invalidated moves", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"] },
        standIn
      )

      // Removing a trailing row clamps both the indicator and the emitted drop.
      scene.click(handle("a"))
      drain(scene)
      scene.keydown(handle("a"), "End")
      drain(scene)
      scene.props({ items: ["a", "b"] })
      assert.strictEqual(
        scene.get(item("b")).attrs?.["data-drop-position"],
        "after"
      )
      scene.click(handle("a")).emitted({ _tag: "Reordered", from: 0, to: 1 })
      drain(scene)

      // Removing the moving row ends the move; restoring it does not revive it.
      scene.props({ items: ["a", "b", "c"] })
      scene.click(handle("a"))
      drain(scene)
      scene.keydown(handle("a"), "End")
      drain(scene)
      scene.props({ items: ["b", "c"] })
      scene.subscription("changedProps", { _tag: "ChangedProps" })
      scene.props({ items: ["a", "b", "c"] })
      scene.click(handle("b"))
      drain(scene)
      scene.expect(status).toHaveText("PickedUp:b:2/3")

      // Disabling the list ends the move; re-enabling does not revive it.
      scene.props({ items: ["a", "b", "c"], disabled: true })
      scene.subscription("changedProps", { _tag: "ChangedProps" })
      scene.props({ items: ["a", "b", "c"] })
      scene.click(handle("c"))
      drain(scene)
      scene.expect(status).toHaveText("PickedUp:c:3/3")
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("horizontal orientation uses Left/Right arrows and respects DirectionProvider RTL", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"], orientation: "horizontal" },
        standIn
      )
      // Without a DirectionProvider, a horizontal list tracks CSS `direction`.
      const trackDirection =
        (scene.get(list) as unknown as View.Element<unknown>)
          .owned?.find((layer) => layer.mount !== undefined)
          ?.mount as unknown as Mount.Issued<unknown, never, never, unknown>
      scene.expectMount(trackDirection)

      assert.strictEqual(
        scene.get(list).attrs?.["data-orientation"],
        "horizontal"
      )
      scene.click(handle("a"))
      drain(scene)
      scene.keydown(handle("a"), "ArrowDown").expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(handle("a"), "ArrowRight").expectDefaultPrevented()
      drain(scene)
      scene.expect(status).toHaveText("Moved:a:2/3")
      scene.keydown(handle("a"), "ArrowLeft").expectDefaultPrevented()
      drain(scene)
      scene.expect(status).toHaveText("Moved:a:1/3")

      scene.shared(DirectionProvider, { direction: "rtl" })
      scene.keydown(handle("a"), "ArrowLeft").expectDefaultPrevented()
      drain(scene)
      scene.expect(status).toHaveText("Moved:a:2/3")
      scene.keydown(handle("a"), "ArrowRight").expectDefaultPrevented()
      drain(scene)
      scene.expect(status).toHaveText("Moved:a:1/3")
    }))

  it.effect("pointer drag reorders by halves, keeps pending position across list gaps, and ignores no-op halves", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"] },
        standIn
      )

      // Upper half of "b" when dragging "a" is a no-op (to === from).
      const dataA = dragDataOf(scene, item("a"))
      scene.fire(item("a"), "dragstart")
      // A drag moves the row but doesn't toggle the handle.
      assert.strictEqual(scene.get(item("a")).attrs?.["data-moving"], "")
      assert.strictEqual(
        scene.get(handle("a")).attrs?.["aria-pressed"],
        "false"
      )
      scene.fire(item("b"), "dragover", topHalf)
      assert.isUndefined(scene.get(item("b")).attrs?.["data-drop-position"])
      scene.drop(item("b"), { data: dataA, ...topHalf })
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.fire(item("a"), "dragstart")
      scene.fire(item("b"), "dragover", bottomHalf)
      assert.strictEqual(
        scene.get(item("b")).attrs?.["data-drop-position"],
        "after"
      )
      scene.drop(item("b"), { data: dataA, ...bottomHalf })
        .emitted({ _tag: "Reordered", from: 0, to: 1 })
      drain(scene)

      // Moving from an item into a gap on `list` preserves the pending drop position.
      const dataC = dragDataOf(scene, item("c"))
      scene.fire(item("c"), "dragstart")
      scene.fire(item("a"), "dragover", topHalf)
      assert.strictEqual(
        scene.get(item("a")).attrs?.["data-drop-position"],
        "before"
      )
      scene.fire(item("a"), "dragleave")
      scene.fire(list, "dragenter")
      scene.drop(list, { data: dataC, x: 10, y: 20, width: 100, height: 120 })
        .emitted({ _tag: "Reordered", from: 2, to: 0 })
      drain(scene)
    }))

  it.effect("disabled suppresses reordering and handle rejects non-button elements", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b"], disabled: true },
        standIn
      )

      assert.strictEqual(scene.get(list).attrs?.["data-disabled"], "")
      scene.expect(handle("a")).toBeDisabled()
      assert.throws(() => scene.click(handle("a")))

      const bad = HtmlScene.make(
        SortableList,
        { items: ["a"] },
        {
          elements: Html,
          view: (sortableList, h) =>
            sortableList.list(h.ul).children(
              sortableList.item({ element: h.li, id: "a" }).children(
                sortableList.handle({ element: h.div as any, id: "a" })
              )
            )
        }
      )
      const exit = yield* Effect.exit(bad)
      if (exit._tag !== "Failure") assert.fail("expected failure")
      assert.match(String(exit.cause), /a part for <button> was given <div>/)
    }))
})
