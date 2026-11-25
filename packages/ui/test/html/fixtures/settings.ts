import { Html } from "@effect/ui/html"
import { Schema } from "effect"

/** A form whose every event is logged, as `event:detail`. */
export const Settings = Html.component({
  name: "Settings",
  model: Schema.Struct({
    log: Schema.Array(Schema.String),
    agree: Schema.Boolean,
    zip: Schema.String
  }),
  message: Schema.String
}).make({
  init: () => ({ log: [], agree: false, zip: "" }),
  update: ($, message) => ({
    log: [...$.model.log, message],
    agree: message === "agree:true"
      ? true
      : message === "agree:false"
      ? false
      : $.model.agree,
    zip: message.startsWith("zip:") ? message.slice(4) : $.model.zip
  }),
  view: (h, model) =>
    h.div(
      h.form.on("submit", ({ entries }) =>
        `submit:${
          entries.map(([name, value]) => `${name}=${value}`).join("&")
        }`)
        .children(
          h.label.attr("for", "zip").children("Zip code"),
          h.input.attrs({ id: "zip", name: "zip", placeholder: "90210" }).value(
            model.zip
          )
            .on("input", ({ value }) => `zip:${value}`)
            .on("keydown", ({ key, shift }) =>
              `key:${key}${shift ? "+shift" : ""}`),
          h.label(
            h.input.attrs({ type: "checkbox", name: "agree" }).checked(
              model.agree
            )
              .on("change", ({ checked }) =>
                `agree:${checked}`),
            "Agree"
          ),
          h.input.attrs({ type: "checkbox", name: "off", "aria-label": "Off" })
            .disabled(true),
          h.button.attrs({ name: "via", value: "go" }).children("Go"),
          h.button.attr("type", "button").disabled(true).children("Later")
        ),
      h.button.attr("popovertarget", "menu").children("Menu"),
      h.div.attrs({ id: "menu", popover: "" }).on("toggle", ({ newState }) =>
        `toggle:${newState}`).children("Items"),
      h.output(model.log.join("|"))
    )
})
