import { Command, Component, UiSchema, UiStruct } from "@effect/ui"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Array as Arr, Effect, Schema } from "effect"

const Line = Schema.Struct({ id: Schema.String, quantity: Schema.Number })
const Coupon = Schema.Struct({
  code: Schema.String,
  status: Schema.Literals(["Idle", "Applied"])
})
const Message = UiSchema.TaggedEnum({
  ClickedIncrement: { id: Schema.String },
  ClickedRemove: { id: Schema.String },
  SubmittedOrder: {},
  FailedPlaceOrder: {}
})
const Events = UiSchema.TaggedEnum({ Emptied: {} })

const PlaceOrder = Command.make(
  "PlaceOrder",
  { args: { lines: Schema.Number } },
  () => Effect.succeed(Message.FailedPlaceOrder())
)

const Checkout = Component.define({
  name: "Checkout",
  model: Schema.Struct({
    lines: Schema.Array(Line),
    coupon: Coupon,
    submitting: Schema.Boolean,
    attempts: Schema.Number,
    notice: Schema.NullOr(Schema.String)
  }),
  message: Message,
  events: Events
}).make({
  init: ($) =>
    $.set({
      lines: [{ id: "a", quantity: 1 }, { id: "b", quantity: 2 }],
      coupon: { code: "TEN", status: "Applied" },
      submitting: false,
      attempts: 0,
      notice: "Welcome"
    }),
  update: {
    ClickedIncrement: ($, { id }) =>
      $.evolve({
        lines: Arr.map((line) =>
          line.id === id
            ? UiStruct.evolve(line, { quantity: (n) => n + 1 })
            : line
        ),
        coupon: UiStruct.evolve({ status: "Idle" }),
        notice: null
      }),
    ClickedRemove: ($, { id }) => {
      const lines = $.model.lines.filter((line) => line.id !== id)
      const step = $.evolve({ lines })
      return lines.length === 0
        ? step.evolve({ notice: "Your basket is empty" }).emit(Events.Emptied())
        : step
    },
    SubmittedOrder: ($) =>
      $.evolve({ submitting: true, attempts: (n) => n + 1 }).run(
        PlaceOrder.make({ lines: $.model.lines.length })
      ),
    // Keeps every field, so the Model stays the same object.
    FailedPlaceOrder: ($) => UiStruct.evolve($.model, { submitting: false })
  },
  view: (h) => h.text("checkout")
})

describe("evolve", () => {
  it("changes the given fields of the Model and of the structs in it, and chains with the step", () => {
    const story = Story.start(Checkout, {})
    story.send(Message.ClickedIncrement({ id: "a" }))
    assert.deepStrictEqual(story.model, {
      lines: [{ id: "a", quantity: 2 }, { id: "b", quantity: 2 }],
      coupon: { code: "TEN", status: "Idle" },
      submitting: false,
      attempts: 0,
      notice: null
    })

    story.send(Message.SubmittedOrder())
    assert.strictEqual(story.model.submitting, true)
    assert.strictEqual(story.model.attempts, 1)
    assert.deepStrictEqual(
      story.pending.map((entry) => [entry.command.name, entry.command.args]),
      [
        ["PlaceOrder", { lines: 2 }]
      ]
    )

    story.resolve(PlaceOrder, Message.FailedPlaceOrder())
    assert.strictEqual(story.model.submitting, false)
    const after = story.model
    story.send(Message.FailedPlaceOrder())
    assert.strictEqual(story.model, after)

    story.send(Message.ClickedRemove({ id: "a" })).send(
      Message.ClickedRemove({ id: "b" })
    ).emitted(Events.Emptied())
    assert.deepStrictEqual(story.model.lines, [])
    assert.strictEqual(story.model.notice, "Your basket is empty")
  })

  it("changes a field under a symbol key", () => {
    const key = Symbol("key")
    assert.deepStrictEqual(
      UiStruct.evolve({ [key]: 1, label: "a" }, { [key]: (n) => n + 1 }),
      {
        [key]: 2,
        label: "a"
      }
    )
  })
})
