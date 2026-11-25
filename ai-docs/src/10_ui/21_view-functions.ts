/**
 * @title Reusing view functions with children
 *
 * Name view functions in CapitalCase, like components.
 * Use a plain function for a stateless wrapper. Return the builder when
 * its root is the hole, so callers add children without a children generic.
 * For a nested hole, take an options object with a generic children field,
 * or return the inner builder with `forward`.
 */
import type { View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

// Html.H types a reusable pure HTML view helper without tying it to one definition.
const Card = <M>(h: Html.H<M>) => h.section.class("card")

// Keep C inferred: View.Input<M> rejects children needing services, while
// annotating children as View.Children<M> erases their requirements.
const Field = <M, C extends View.Children<M>>(h: Html.H<M>, options: {
  readonly label: string
  readonly children: C
}) =>
  h.label.children(
    options.label,
    h.div.class("control").children(options.children)
  )

// A nested hole can stay a builder: `forward` says what goes around it when
// it is built, so the caller's chain and children land on the control.
const Framed = <M>(h: Html.H<M>) =>
  h.div.class("control").forward((control) =>
    h.div.class("frame").children(control)
  )

// Arrays are accepted directly. Do not spread options.children. The result
// retains the union of the children's requirements for the enclosing component.
export const Form = Html.component({
  name: "Form",
  model: Schema.String,
  message: Schema.String
}).make({
  init: () => "",
  update: (_, value) => value,
  view: (h, value) =>
    Card(h).children(
      Field(h, {
        label: "Name",
        children: [h.input.value(value).on("input", ({ value }) => value)]
      }),
      Framed(h).class("wide").children(value)
    )
})
