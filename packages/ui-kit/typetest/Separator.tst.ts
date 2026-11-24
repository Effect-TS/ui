import { UiSchema, type View } from "@effect/ui"
import { Separator, type SeparatorElement } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })

declare const needsClock: View.Child<never, Clock>

describe("Separator", () => {
  it("returns a div of the caller's message type, whose chained children keep their requirements", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        expect(Separator(h)).type.toBe<SeparatorElement<typeof Msg.Type>>()
        expect(Separator(h).children(needsClock)).type.toBe<
          SeparatorElement<typeof Msg.Type, Clock>
        >()
        expect(Separator).type.not.toBeCallableWith(h, { element: h.span })
        expect(Separator).type.not.toBeCallableWith(h, {
          props: { orientation: "diagonal" }
        })
        return Separator(h)
      }
    })
  })
})
