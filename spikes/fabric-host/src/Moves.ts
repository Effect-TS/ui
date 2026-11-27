/**
 * A device check, not a benchmark: one kept child that moves between a text,
 * a scroll view and a view, or is hidden, so its native node is reparented
 * across kinds and parked in a container.
 */
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import * as Spike from "./Spike.ts"

const BadgeMessage = UiSchema.TaggedEnum({ Pressed: {} })

const Badge = Spike.component({
  name: "Badge",
  model: Schema.Number,
  message: BadgeMessage
}).make({
  init: () => 0,
  update: ({ model }) => model + 1,
  view: (h, presses) =>
    h.text.prop("style", { fontSize: 20, color: "#b91c1c" })
      .on("press", BadgeMessage.Pressed())
      .children(`badge pressed ${presses}`)
})

const Where = Schema.Literals(["text", "scroll", "view", "hidden"])
const Message = UiSchema.TaggedEnum({
  Moved: { to: Where },
  Scrolled: { y: Schema.Number }
})

const button = { backgroundColor: "#111", padding: 12, borderRadius: 8 }

export const Moves = Spike.component({
  name: "Moves",
  model: Schema.Struct({ where: Where, y: Schema.Number }),
  message: Message
}).make({
  init: () => ({ where: "text" as const, y: 0 }),
  update: ({ model }, message) =>
    Message.match(message, {
      Moved: ({ to }) => ({ ...model, where: to }),
      Scrolled: ({ y }) => ({ ...model, y })
    }),
  view: (h, model) => {
    const badge = h.keepAlive((s) => Badge(s, { key: "badge" }))
    return h.view.prop("style", {
      flex: 1,
      gap: 16,
      padding: 24,
      paddingTop: 64,
      backgroundColor: "white"
    }).children(
      h.view.prop("style", { flexDirection: "row", gap: 12 }).children(
        (["text", "scroll", "view", "hidden"] as const).map((to) =>
          h.view.key(to).prop("style", button)
            .on("press", Message.Moved({ to }))
            .children(
              h.text.prop("style", { color: "white", fontSize: 18 })
                .children(to)
            )
        )
      ),
      h.text.children(`in ${model.where}, scrolled ${Math.round(model.y)}`),
      model.where === "text"
        ? h.text.prop("style", { fontSize: 20 }).children("Inline: ", badge)
        : model.where === "scroll"
        ? h.scroll.prop("style", { height: 240, borderWidth: 1 })
          .on("scroll", ({ y }) => Message.Scrolled({ y }))
          .children(badge, h.view.prop("style", { height: 800 }))
        : model.where === "view"
        ? h.view.prop("style", { borderWidth: 1, padding: 8 }).children(badge)
        : h.view
    )
  }
})
