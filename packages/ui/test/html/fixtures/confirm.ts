import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const State = Schema.Literals(["closed", "open", "modal"])

export const ConfirmMessage = UiSchema.TaggedEnum({
  Ask: {},
  Escaped: { forced: Schema.Boolean },
  Chosen: { choice: Schema.String },
  Closed: {},
  Mode: { state: State },
  Remove: {}
})

/** A confirm dialog: Escape is accepted only with `acceptEscape`, and its form's choice closes it. */
export const Confirm = Component.define({
  name: "Confirm",
  scoped: false,
  props: Schema.Struct({ state: State, acceptEscape: Schema.Boolean }),
  model: Schema.Struct({
    state: State,
    acceptEscape: Schema.Boolean,
    shown: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: ConfirmMessage,
  elements: Html
}).make({
  init: ($) => ({ state: $.props.state, acceptEscape: $.props.acceptEscape, shown: true, log: [] }),
  update: ($, message) =>
    ConfirmMessage.match(message, {
      Ask: () => ({ ...$.model, state: "modal" as const }),
      Escaped: ({ forced }) =>
        $.model.acceptEscape
          ? { ...$.model, state: "closed" as const, log: [...$.model.log, "escape"] }
          : { ...$.model, log: [...$.model.log, forced ? "escape rejected, forced" : "escape rejected"] },
      Chosen: ({ choice }) => ({ ...$.model, state: "closed" as const, log: [...$.model.log, choice] }),
      Closed: () => ({ ...$.model, log: [...$.model.log, "closed"] }),
      Mode: ({ state }) => ({ ...$.model, state }),
      Remove: () => ({ ...$.model, shown: false })
    }),
  view: (h, model) => {
    const dialog = h.dialog.attr("aria-label", "Delete note?")
      .onCancel(({ cancelable }) => ConfirmMessage.Escaped({ forced: cancelable === false }))
      .onClose(ConfirmMessage.Closed())
    return h.div(
      h.button.onClick(ConfirmMessage.Ask()).children("Ask"),
      h.button.onClick(ConfirmMessage.Remove()).children("Remove"),
      model.shown &&
        (model.state === "modal" ? dialog.modal(true) : dialog.open(model.state === "open")).children(
          h.h2("Delete note?"),
          h.form.attr("method", "dialog").onSubmit(({ entries }) =>
            ConfirmMessage.Chosen({ choice: entries.find(([name]) => name === "choice")?.[1] ?? "" })
          ).children(
            h.button.attrs({ name: "choice", value: "keep" }).children("Keep"),
            h.button.attrs({ name: "choice", value: "delete" }).children("Delete")
          )
        )
    )
  }
})

/** Two modals, one nested in the other, both open from the start. */
export const Nested = Component.define({
  name: "Nested",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.dialog
      .attr("aria-label", "Outer").modal(true).children(
        h.p("Outer"),
        h.dialog.attr("aria-label", "Inner").modal(true).children(h.p("Inner"))
      )
})
