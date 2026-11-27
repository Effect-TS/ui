import type { Component, View } from "@effect/ui"
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

type Scene = Effect.Success<
  ReturnType<typeof HtmlScene.make<typeof SortableList, Html.Elements>>
>

const drain = (scene: Scene) => {
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
  const layers = [node, ...(node.owned ?? [])]
  for (const layer of layers) {
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

      assert.strictEqual(scene.get(list).attrs?.["data-orientation"], "vertical")
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      assert.deepInclude(scene.get(status).attrs, {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      })
      scene.expect(status).toHaveText("")

      // Activate handle to pick up item "a".
      scene.click(handle("a"))
      drain(scene)
      assert.strictEqual(scene.get(list).attrs?.["data-moving"], "")
      assert.strictEqual(scene.get(item("a")).attrs?.["data-moving"], "")
      assert.strictEqual(scene.get(handle("a")).attrs?.["aria-pressed"], "true")
      assert.isUndefined(scene.get(item("a")).attrs?.["data-drop-position"])
      assert.isUndefined(scene.get(item("b")).attrs?.["data-drop-position"])
      scene.expect(status).toHaveText("PickedUp:a:1/3")

      // Arrows, End, clamping (no wrap), and Home.
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

      // Activate the moved handle again to commit at index 1.
      scene.click(handle("a")).emitted({ _tag: "Reordered", from: 0, to: 1 })
      drain(scene)
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      assert.isUndefined(scene.get(item("a")).attrs?.["data-moving"])
      assert.isUndefined(scene.get(item("b")).attrs?.["data-drop-position"])
      assert.notStrictEqual(
        scene.get(handle("a")).attrs?.["aria-pressed"],
        "true"
      )

      // Consumer applies the new order; Dropped reflects the live position.
      scene.props({ items: ["b", "a", "c"] })
      scene.expect(status).toHaveText("Dropped:a:2/3")

      // Later unrelated list edits must not rewrite the Dropped announcement.
      scene.props({ items: ["b", "a", "c", "d"] })
      assert.notStrictEqual(
        Locator.textOf(scene.get(status)),
        "Dropped:a:2/4"
      )

      // Moving backward places the indicator "before" the target item.
      scene.click(handle("c"))
      drain(scene)
      scene.keydown(handle("c"), "ArrowUp").expectDefaultPrevented()
      drain(scene)
      assert.strictEqual(
        scene.get(item("a")).attrs?.["data-drop-position"],
        "before"
      )
      scene.keydown(handle("c"), "Escape")
      drain(scene)

      // Dropping back at the original index emits nothing.
      scene.click(handle("b"))
      drain(scene)
      scene.click(handle("b"))
      drain(scene)
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("pick-then-place commits at another handle, and Escape or focusout cancels without emitting", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"] },
        standIn
      )

      // Idle Escape and ArrowDown are left alone for enclosing widgets/scrolling.
      scene.keydown(handle("a"), "Escape").expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(handle("a"), "ArrowDown").expectIgnored()
        .expectDefaultPrevented(false)

      // Pick up "a" and activate "c"'s handle to place it at index 2.
      scene.click(handle("a"))
      drain(scene)
      scene.click(handle("c")).emitted({ _tag: "Reordered", from: 0, to: 2 })
      drain(scene)
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])

      // Escape cancels with no emitted event.
      scene.click(handle("b"))
      drain(scene)
      scene.keydown(handle("b"), "ArrowDown")
      drain(scene)
      scene.keydown(handle("b"), "Escape").expectDefaultPrevented()
      drain(scene)
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      scene.expect(status).toHaveText("Cancelled:b:2/3")

      // Focus moving within the list keeps the move active; leaving cancels.
      scene.click(handle("b"))
      drain(scene)
      scene.fire(list, "focusout", { within: true, disabled: false })
      assert.strictEqual(scene.get(list).attrs?.["data-moving"], "")
      scene.fire(list, "focusout", { within: false, disabled: false })
      drain(scene)
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.isUndefined(scene.get(list).attrs?.["data-moving"])
      scene.expect(status).toHaveText("Cancelled:b:2/3")
    }))

  it.effect("horizontal orientation uses Left/Right arrows and respects DirectionProvider RTL", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        SortableList,
        { items: ["a", "b", "c"], orientation: "horizontal" },
        standIn
      )

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
      scene.fire(item("b"), "dragover", { x: 10, y: 5, width: 100, height: 40 })
      assert.isUndefined(scene.get(item("b")).attrs?.["data-drop-position"])
      scene.drop(item("b"), { data: dataA, x: 10, y: 5, width: 100, height: 40 })
      assert.deepStrictEqual(scene.current.emitted, [])

      // Lower half of "b" drops "a" after "b" (index 1).
      scene.fire(item("a"), "dragstart")
      scene.fire(item("b"), "dragover", {
        x: 10,
        y: 30,
        width: 100,
        height: 40
      })
      assert.strictEqual(
        scene.get(item("b")).attrs?.["data-drop-position"],
        "after"
      )
      scene.drop(item("b"), {
        data: dataA,
        x: 10,
        y: 30,
        width: 100,
        height: 40
      }).emitted({ _tag: "Reordered", from: 0, to: 1 })
      drain(scene)

      // Moving from an item into a gap on `list` preserves the pending drop position.
      const dataC = dragDataOf(scene, item("c"))
      scene.fire(item("c"), "dragstart")
      scene.fire(item("a"), "dragover", { x: 10, y: 5, width: 100, height: 40 })
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
      assert.strictEqual(exit._tag, "Failure")
      assert.match(String(exit.cause), /a part for <button> was given <div>/)
    }))
})
