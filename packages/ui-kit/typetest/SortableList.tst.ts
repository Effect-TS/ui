import { type Component, UiSchema, type View } from "@effect/ui"
import {
  SortableList,
  type SortableListAnnouncement,
  type SortableListEvents,
  type SortableListMove,
  type SortableListProps
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({
  ReorderedTodos: { from: Schema.Number, to: Schema.Number }
})
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Element<K extends keyof HTMLElementTagNameMap, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<K>,
  HTMLElementTagNameMap[K],
  K
>

describe("SortableList", () => {
  it("parts return the given builders, and handle accepts only button", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        SortableList(h, {
          props: { items: ["a"] },
          onEmit: (event) => {
            expect(event).type.toBe<SortableListEvents>()
            return Msg.ReorderedTodos(event)
          },
          view: (sortableList) => {
            expect(sortableList.moving).type.toBe<
              SortableListMove | undefined
            >()
            expect(sortableList.announcement).type.toBe<
              SortableListAnnouncement | undefined
            >()
            expect(sortableList.handle).type.not.toBeCallableWith({
              element: h.div,
              id: "a"
            })
            expect(sortableList.item).type.not.toBeCallableWith(h.li)

            const list = sortableList.list(h.ol)
            expect(list).type.toBe<Element<"ol">>()
            const handle = sortableList.handle({ element: h.button, id: "a" })
            expect(handle).type.toBe<Element<"button">>()
            const status = sortableList.status(h.div)
            expect(status).type.toBe<Element<"div">>()

            const item = sortableList.item({ element: h.li, id: "a" }).children(
              handle,
              needsClock
            )
            expect(item).type.toBe<Element<"li", Clock>>()
            return h.div(list.children(item), status)
          }
        })
    })
  })

  it("needs no services and exports props, events and part values", () => {
    expect<Component.Headless.Requirements<typeof SortableList>>().type.toBe<
      never
    >()
    expect<SortableListProps>().type.toBe<{
      readonly items: ReadonlyArray<string>
      readonly disabled?: boolean | undefined
      readonly orientation?: "horizontal" | "vertical" | undefined
    }>()
    expect<SortableListEvents>().type.toBe<{
      readonly _tag: "Reordered"
      readonly from: number
      readonly to: number
    }>()
    expect<SortableListAnnouncement["_tag"]>().type.toBe<
      "PickedUp" | "Moved" | "Dropped" | "Cancelled"
    >()
  })
})
