import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import * as Spike from "./Spike.ts"

const Message = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
  ChangedName: { value: Schema.String }
})

const button = {
  backgroundColor: "#111",
  paddingHorizontal: 20,
  paddingVertical: 12,
  borderRadius: 8
}
const label = { color: "white", fontSize: 18 }

export const Counter = Spike.component({
  name: "Counter",
  model: Schema.Struct({ count: Schema.Number, name: Schema.String }),
  message: Message
}).make({
  init: () => ({ count: 0, name: "" }),
  update: {
    ClickedDecrement: ($) => $.evolve({ count: (count) => count - 1 }),
    ClickedIncrement: ($) => $.evolve({ count: (count) => count + 1 }),
    ClickedReset: ($) => $.evolve({ count: 0 }),
    ChangedName: ($, { value }) => $.evolve({ name: value })
  },
  view: (h, model) =>
    h.view.prop("style", {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      backgroundColor: "white"
    }).children(
      h.text.prop("style", {
        fontSize: 64,
        fontWeight: "bold",
        color: "#1f2937"
      }).children(String(model.count)),
      h.view.prop("style", { flexDirection: "row", gap: 16 }).children(
        h.view.prop("style", button).on("press", Message.ClickedDecrement())
          .children(h.text.prop("style", label).children("-")),
        h.view.prop("style", button).on("press", Message.ClickedReset())
          .children(h.text.prop("style", label).children("Reset")),
        h.view.prop("style", button).on("press", Message.ClickedIncrement())
          .children(h.text.prop("style", label).children("+"))
      ),
      h.input.prop("placeholder", "Your name").prop("style", {
        width: 240,
        borderWidth: 1,
        borderColor: "#999",
        padding: 8,
        fontSize: 18
      })
        .on("input", ({ value }) => Message.ChangedName({ value })),
      h.text.prop("style", { fontSize: 18, color: "#374151" }).children(
        "Hello, ",
        h.text.prop("style", { fontWeight: "bold" }).children(
          model.name || "stranger"
        )
      )
    )
})
