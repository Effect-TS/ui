import { Component, type View } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = Schema.TaggedUnion({ PressedSave: {} })
const Other = Schema.TaggedUnion({ PressedOther: {} })

declare const needsClock: View.Child<never, Clock>

describe("Button", () => {
  it("returns a finished element of the caller's message type, with the children's requirements", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => {
        const save = Msg.make({ _tag: "PressedSave" })
        expect(Button(h, { onPress: save, children: ["Save"] })).type.toBe<View.Element<typeof Msg.Type, never>>()
        expect(Button(h, { element: h.button.class("save"), children: [needsClock] })).type.toBe<
          View.Element<typeof Msg.Type, Clock>
        >()
        expect(Button).type.not.toBeCallableWith(h, { element: h.span })
        expect(Button).type.not.toBeCallableWith(h, { onPress: Other.make({ _tag: "PressedOther" }) })
        return Button(h, { onPress: save, children: ["Save"] })
      }
    })
  })
})
