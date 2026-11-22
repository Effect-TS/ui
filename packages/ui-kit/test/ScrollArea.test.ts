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
const tracked = (s: Rendered): Track =>
  (s.get(rootLoc) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Track
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

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
            style: "width:8px"
          }),
        thumb: h.div.class("thumb-y")
          .attrs({ "data-orientation": "horizontal", "data-scrolling": "x" })
      }),
      scrollArea.scrollbar({
        element: h.div.class("bar-x"),
        thumb: h.div.class("thumb-x"),
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
      const s = yield* Scene.make(ScrollArea, {}, makeStandIn((p) => (latest = p)))
      s.expectMount(tracked(s))

      assert.strictEqual(s.get(rootLoc).attrs?.role, "presentation")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-custom"], "kept")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-scrolling"], undefined)
      assert.strictEqual(s.get(rootLoc).attrs?.["data-has-overflow-y"], undefined)
      assert.strictEqual(s.get(rootLoc).attrs?.style, "color:red;position:relative")

      assert.strictEqual(s.get(viewportLoc).attrs?.tabindex, "-1")
      assert.strictEqual(s.get(viewportLoc).attrs?.["data-overflow-y-end"], undefined)
      assert.include(s.get(viewportLoc).attrs?.style ?? "", "height:100px;overflow:scroll;scrollbar-width:none")

      assert.strictEqual(s.get(contentLoc).attrs?.role, "presentation")
      assert.strictEqual(s.get(contentLoc).attrs?.["data-scrolling"], undefined)
      assert.strictEqual(s.get(contentLoc).attrs?.style, "min-width:fit-content")

      assert.strictEqual(s.query(barYLoc), undefined)
      assert.strictEqual(s.query(cornerLoc), undefined)
      assert.isDefined(s.query(barXLoc))
      assert.include(s.get(thumbXLoc).attrs?.style ?? "", "visibility:hidden")
      assert.strictEqual(latest.cornerHidden, true)

      s.mounted(
        tracked(s),
        sent("MeasuredOverflow", {
          hasOverflowX: false,
          hasOverflowY: false,
          overflowXStart: false,
          overflowXEnd: false,
          overflowYStart: false,
          overflowYEnd: false
        })
      )

      assert.notInclude(s.get(thumbXLoc).attrs?.style ?? "", "visibility:hidden")
      assert.strictEqual(s.get(viewportLoc).attrs?.tabindex, "-1")
      assert.strictEqual(s.query(barYLoc), undefined)
      assert.strictEqual(s.query(cornerLoc), undefined)

      s.mounted(
        tracked(s),
        sent("MeasuredOverflow", {
          hasOverflowX: true,
          hasOverflowY: true,
          overflowXStart: false,
          overflowXEnd: true,
          overflowYStart: true,
          overflowYEnd: false
        })
      )

      assert.strictEqual(s.get(viewportLoc).attrs?.tabindex, "0")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-has-overflow-x"], "")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-has-overflow-y"], "")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-overflow-x-start"], undefined)
      assert.strictEqual(s.get(rootLoc).attrs?.["data-overflow-x-end"], "")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-overflow-y-start"], "")
      assert.strictEqual(s.get(rootLoc).attrs?.["data-overflow-y-end"], undefined)
      assert.strictEqual(s.get(contentLoc).attrs?.["data-has-overflow-y"], "")

      assert.strictEqual(s.get(barYLoc).attrs?.["aria-hidden"], "true")
      assert.strictEqual(s.get(barYLoc).attrs?.["data-orientation"], "vertical")
      assert.strictEqual(s.get(barYLoc).attrs?.["data-hovering"], undefined)
      assert.strictEqual(s.get(barYLoc).attrs?.["data-scrolling"], undefined)
      assert.include(s.get(barYLoc).attrs?.style ?? "", "width:8px;position:absolute")

      assert.strictEqual(s.get(thumbYLoc).attrs?.["data-orientation"], "vertical")
      assert.strictEqual(s.get(thumbYLoc).attrs?.["data-scrolling"], undefined)
      assert.notInclude(s.get(thumbYLoc).attrs?.style ?? "", "visibility:hidden")
      assert.notInclude(s.get(thumbXLoc).attrs?.style ?? "", "visibility:hidden")

      assert.strictEqual(s.get(barXLoc).attrs?.["data-orientation"], "horizontal")
      assert.strictEqual(s.get(thumbXLoc).attrs?.["data-orientation"], "horizontal")
      assert.strictEqual(s.get(cornerLoc).attrs?.["aria-hidden"], "true")
      assert.include(s.get(cornerLoc).attrs?.style ?? "", "background:gray;position:absolute")
      assert.strictEqual(latest.cornerHidden, false)

      s.mounted(tracked(s), sent("EnteredPointer"))
      assert.strictEqual(s.get(barYLoc).attrs?.["data-hovering"], "")
      assert.strictEqual(s.get(barXLoc).attrs?.["data-hovering"], "")
      assert.strictEqual(latest.hovering, true)

      s.mounted(tracked(s), sent("StartedScrolling", { orientation: "vertical" }))
      assert.strictEqual(s.get(rootLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(s.get(viewportLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(s.get(contentLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(s.get(barYLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(s.get(thumbYLoc).attrs?.["data-scrolling"], "")
      assert.strictEqual(s.get(barXLoc).attrs?.["data-scrolling"], undefined)
      assert.strictEqual(s.get(thumbXLoc).attrs?.["data-scrolling"], undefined)
      assert.strictEqual(latest.scrolling, true)
      assert.strictEqual(latest.scrollingY, true)
      assert.strictEqual(latest.scrollingX, false)

      s.mounted(tracked(s), sent("StoppedScrolling", { orientation: "vertical" }))
      s.mounted(tracked(s), sent("LeftPointer"))
      assert.strictEqual(s.get(rootLoc).attrs?.["data-scrolling"], undefined)
      assert.strictEqual(s.get(barYLoc).attrs?.["data-hovering"], undefined)
      assert.strictEqual(latest.scrolling, false)
      assert.strictEqual(latest.hovering, false)
    }))

  it.effect("rejects non-div tags on every part even when hidden", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<(scrollArea: Parts, h: H) => View.Content<never>> = [
        (sa, h) => sa.root(h.span as never),
        (sa, h) => sa.root(h.div).children(sa.viewport(h.span as never)),
        (sa, h) => sa.root(h.div).children(sa.content(h.span as never)),
        (sa, h) => sa.root(h.div).children(sa.scrollbar({ element: h.span as never, thumb: h.div })),
        (sa, h) => sa.root(h.div).children(sa.scrollbar({ element: h.div, thumb: h.span as never })),
        (sa, h) => sa.root(h.div).children(sa.corner(h.span as never))
      ]
      for (const render of cases) {
        const exit = yield* Effect.exit(Scene.make(ScrollArea, {}, { elements: Html, view: render }))
        assert.strictEqual(exit._tag, "Failure")
      }
    }))
})
