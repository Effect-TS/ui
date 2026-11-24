import type { Component, Mount, View } from "@effect/ui"
import { ScrollArea, type ScrollAreaProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof ScrollArea>
type H = View.Helper<never, ScrollAreaProps> & View.Tags<Html.Elements, never>

const rootLoc = Locator.attr("class", "root")
const viewportLoc = Locator.attr("class", "viewport")
const contentLoc = Locator.attr("class", "content")
const barYLoc = Locator.attr("class", "bar-y")
const thumbYLoc = Locator.attr("class", "thumb-y")
const barXLoc = Locator.attr("class", "bar-x")
const thumbXLoc = Locator.attr("class", "thumb-x")
const cornerLoc = Locator.attr("class", "corner")

type Track = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (scene: Rendered): Track =>
  (scene.get(rootLoc) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Track
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const makeStandIn = (snapshot: (parts: Parts) => void) => ({
  elements: Html,
  view: (scrollArea: Parts, h: H) => {
    snapshot(scrollArea)
    return scrollArea.root(
      h.div.class("root")
        .attrs({
          role: "region",
          "data-scrolling": "x",
          "data-has-overflow-y": "x",
          "data-custom": "kept",
          style: "color:red"
        })
    ).children(
      scrollArea.viewport(
        h.div.class("viewport")
          .attrs({
            tabindex: "5",
            "data-overflow-y-end": "x",
            style: "height:100px"
          })
      ).children(
        scrollArea.content(
          h.div.class("content")
            .attrs({ role: "main", "data-scrolling": "x" })
        ).children("Body")
      ),
      scrollArea.scrollbar({
        element: h.div.class("bar-y")
          .attrs({
            "aria-hidden": "false",
            "data-orientation": "horizontal",
            "data-hovering": "x",
            "data-scrolling": "x",
            "data-scroll-area-scrollbar-x": "stale",
            style: "width:8px"
          }),
        thumb: h.div.class("thumb-y")
          .attrs({
            "data-orientation": "horizontal",
            "data-scrolling": "x",
            "data-scroll-area-thumb-x": "stale"
          })
      }),
      scrollArea.scrollbar({
        element: h.div.class("bar-x").attr(
          "data-scroll-area-scrollbar-y",
          "stale"
        ),
        thumb: h.div.class("thumb-x").attr("data-scroll-area-thumb-y", "stale"),
        orientation: "horizontal",
        keepMounted: true
      }),
      scrollArea.corner(
        h.div.class("corner")
          .attrs({ "aria-hidden": "false", style: "background:gray" })
      )
    )
  }
})

describe("ScrollArea", () => {
  it.effect("manages overflow, scrolling, hover, tabindex, visibility, and attribute precedence", () =>
    Effect.gen(function*() {
      let latest!: Parts
      const scene = yield* Scene.make(
        ScrollArea,
        {},
        makeStandIn((p) => (latest = p))
      )
      scene.expectMount(tracked(scene))

      assert.strictEqual(scene.get(rootLoc).attrs?.role, "presentation")
      assert.strictEqual(scene.get(rootLoc).attrs?.["data-custom"], "kept")
      assert.strictEqual(
        scene.get(rootLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.strictEqual(
        scene.get(rootLoc).attrs?.["data-has-overflow-y"],
        undefined
      )
      assert.strictEqual(
        scene.get(rootLoc).attrs?.style,
        "color:red;position:relative"
      )

      assert.strictEqual(scene.get(viewportLoc).attrs?.tabindex, "-1")
      assert.strictEqual(
        scene.get(viewportLoc).attrs?.["data-overflow-y-end"],
        undefined
      )
      assert.include(
        scene.get(viewportLoc).attrs?.style ?? "",
        "height:100px;overflow:scroll;scrollbar-width:none"
      )

      assert.strictEqual(scene.get(contentLoc).attrs?.role, "presentation")
      assert.strictEqual(
        scene.get(contentLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.strictEqual(
        scene.get(contentLoc).attrs?.style,
        "min-width:fit-content"
      )

      assert.strictEqual(scene.query(barYLoc), undefined)
      assert.strictEqual(scene.query(cornerLoc), undefined)
      assert.isDefined(scene.query(barXLoc))
      assert.include(
        scene.get(thumbXLoc).attrs?.style ?? "",
        "visibility:hidden"
      )
      assert.strictEqual(latest.cornerHidden, true)

      scene.mounted(
        tracked(scene),
        sent("MeasuredOverflow", {
          hasOverflowX: false,
          hasOverflowY: false,
          overflowXStart: false,
          overflowXEnd: false,
          overflowYStart: false,
          overflowYEnd: false
        })
      )

      assert.notInclude(
        scene.get(thumbXLoc).attrs?.style ?? "",
        "visibility:hidden"
      )
      assert.strictEqual(scene.get(viewportLoc).attrs?.tabindex, "-1")
      assert.strictEqual(scene.query(barYLoc), undefined)
      assert.strictEqual(scene.query(cornerLoc), undefined)

      scene.mounted(
        tracked(scene),
        sent("MeasuredOverflow", {
          hasOverflowX: true,
          hasOverflowY: true,
          overflowXStart: false,
          overflowXEnd: true,
          overflowYStart: true,
          overflowYEnd: false
        })
      )

      assert.strictEqual(scene.get(viewportLoc).attrs?.tabindex, "0")
      assert.strictEqual(scene.get(rootLoc).attrs?.["data-has-overflow-x"], "")
      assert.strictEqual(scene.get(rootLoc).attrs?.["data-has-overflow-y"], "")
      assert.strictEqual(
        scene.get(rootLoc).attrs?.["data-overflow-x-start"],
        undefined
      )
      assert.strictEqual(scene.get(rootLoc).attrs?.["data-overflow-x-end"], "")
      assert.strictEqual(
        scene.get(rootLoc).attrs?.["data-overflow-y-start"],
        ""
      )
      assert.strictEqual(
        scene.get(rootLoc).attrs?.["data-overflow-y-end"],
        undefined
      )
      assert.strictEqual(
        scene.get(contentLoc).attrs?.["data-has-overflow-y"],
        ""
      )

      assert.strictEqual(scene.get(barYLoc).attrs?.["aria-hidden"], "true")
      assert.strictEqual(
        scene.get(barYLoc).attrs?.["data-orientation"],
        "vertical"
      )
      assert.strictEqual(scene.get(barYLoc).attrs?.["data-hovering"], undefined)
      assert.strictEqual(
        scene.get(barYLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.include(
        scene.get(barYLoc).attrs?.style ?? "",
        "width:8px;position:absolute"
      )

      assert.strictEqual(
        scene.get(thumbYLoc).attrs?.["data-orientation"],
        "vertical"
      )
      assert.strictEqual(
        scene.get(thumbYLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.notInclude(
        scene.get(thumbYLoc).attrs?.style ?? "",
        "visibility:hidden"
      )
      assert.notInclude(
        scene.get(thumbXLoc).attrs?.style ?? "",
        "visibility:hidden"
      )

      assert.strictEqual(
        scene.get(barXLoc).attrs?.["data-orientation"],
        "horizontal"
      )
      assert.strictEqual(
        scene.get(thumbXLoc).attrs?.["data-orientation"],
        "horizontal"
      )
      assert.isString(
        scene.get(barYLoc).attrs?.["data-scroll-area-scrollbar-y"]
      )
      assert.isUndefined(
        scene.get(barYLoc).attrs?.["data-scroll-area-scrollbar-x"]
      )
      assert.isString(scene.get(thumbYLoc).attrs?.["data-scroll-area-thumb-y"])
      assert.isUndefined(
        scene.get(thumbYLoc).attrs?.["data-scroll-area-thumb-x"]
      )
      assert.isString(
        scene.get(barXLoc).attrs?.["data-scroll-area-scrollbar-x"]
      )
      assert.isUndefined(
        scene.get(barXLoc).attrs?.["data-scroll-area-scrollbar-y"]
      )
      assert.isString(scene.get(thumbXLoc).attrs?.["data-scroll-area-thumb-x"])
      assert.isUndefined(
        scene.get(thumbXLoc).attrs?.["data-scroll-area-thumb-y"]
      )
      assert.strictEqual(scene.get(cornerLoc).attrs?.["aria-hidden"], "true")
      assert.include(
        scene.get(cornerLoc).attrs?.style ?? "",
        "background:gray;position:absolute"
      )
      assert.strictEqual(latest.cornerHidden, false)

      scene.mounted(tracked(scene), sent("EnteredPointer"))
      assert.strictEqual(scene.get(barYLoc).attrs?.["data-hovering"], "")
      assert.strictEqual(scene.get(barXLoc).attrs?.["data-hovering"], "")
      assert.strictEqual(latest.hovering, true)

      scene.mounted(
        tracked(scene),
        sent("StartedScrolling", { orientation: "vertical" })
      )
      assert.strictEqual(scene.get(rootLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(scene.get(viewportLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(scene.get(contentLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(scene.get(barYLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(scene.get(thumbYLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(
        scene.get(barXLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.strictEqual(
        scene.get(thumbXLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.strictEqual(latest.scrolling, true)
      assert.strictEqual(latest.scrollingY, true)
      assert.strictEqual(latest.scrollingX, false)

      scene.mounted(
        tracked(scene),
        sent("StoppedScrolling", { orientation: "vertical" })
      )
      scene.mounted(tracked(scene), sent("LeftPointer"))
      assert.strictEqual(
        scene.get(rootLoc).attrs?.["data-scrolling"],
        undefined
      )
      assert.strictEqual(scene.get(barYLoc).attrs?.["data-hovering"], undefined)
      assert.strictEqual(latest.scrolling, false)
      assert.strictEqual(latest.hovering, false)
    }))

  it.effect("rejects non-div tags on every part even when hidden", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<
        (scrollArea: Parts, h: H) => View.Content<never>
      > = [
        (scrollArea, h) => scrollArea.root(h.span as never),
        (scrollArea, h) =>
          scrollArea.root(h.div).children(scrollArea.viewport(h.span as never)),
        (scrollArea, h) =>
          scrollArea.root(h.div).children(scrollArea.content(h.span as never)),
        (scrollArea, h) =>
          scrollArea.root(h.div).children(
            scrollArea.scrollbar({ element: h.span as never, thumb: h.div })
          ),
        (scrollArea, h) =>
          scrollArea.root(h.div).children(
            scrollArea.scrollbar({ element: h.div, thumb: h.span as never })
          ),
        (scrollArea, h) =>
          scrollArea.root(h.div).children(scrollArea.corner(h.span as never))
      ]
      for (const render of cases) {
        const exit = yield* Effect.exit(
          Scene.make(ScrollArea, {}, { elements: Html, view: render })
        )
        assert.strictEqual(exit._tag, "Failure")
      }
    }))
})
