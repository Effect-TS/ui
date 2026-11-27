import { Html } from "@effect/ui/html"
import { Schema } from "effect"

/**
 * Buttons in a form, each inside a div whose `pointerdown` captures: one that sends, one that declines, and
 * one that sends and takes its button away. A click's release, click and defaults follow the capture.
 */
export const Panes = Html.component({
  name: "Panes",
  model: Schema.Array(Schema.String),
  message: Schema.String
}).make({
  init: (): ReadonlyArray<string> => [],
  update: ($, message) => [...$.model, message],
  view: (h, model) =>
    h.div(
      h.form.on("submit", "submit").children(
        h.div.on("pointerdown", "grab", { capturePointer: true })
          .on("pointerup", "up")
          .on("click", "ck")
          .children(
            h.button.on("pointerup", "button up").on("click", "button ck")
              .children("Grab")
          ),
        h.div.on("pointerdown", () => undefined, { capturePointer: true })
          .children(h.button.on("click", "pass").children("Pass")),
        h.div.on("pointerdown", "drop", { capturePointer: true })
          .on("pointerup", "drop up")
          .children(
            model.includes("drop") ? undefined : h.button.children("Drop")
          )
      ),
      h.output(model.join("|"))
    )
})
