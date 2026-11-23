/**
 * @title Reusing view functions with children
 *
 * Name view functions in CapitalCase, like components.
 * Use a plain function for a stateless wrapper. Return the builder when
 * its root is the hole, so callers add children without a children generic.
 * For a nested hole, take an options object with a generic children field,
 * or return the inner builder with `forward`.
 */
import { Component, type View } from "@effect/ui"
import { Schema } from "effect"
// View.H uses the app's registered vocabulary, not one definition.
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"

const Card = <M>(h: View.H<M>) => h.section.class("card")

// Keep C inferred: View.Input<M> rejects children needing services, while
// annotating children as View.Children<M> erases their requirements.
const Field = <M, C extends View.Children<M>>(h: View.H<M>, options: {
  readonly label: string
  readonly children: C
}) => h.label.children(options.label, h.div.class("control").children(options.children))

// A nested hole can stay a builder: `forward` says what goes around it when
// it is built, so the caller's chain and children land on the control.
const Framed = <M>(h: View.H<M>) => h.div.class("control").forward((control) => h.div.class("frame").children(control))

// Arrays are accepted directly. Do not spread options.children. The result
// retains the union of the children's requirements for the enclosing component.
export const Form = Component.define({
  name: "Form",
  scoped: false,
  model: Schema.String,
  message: Schema.String
}).make({
  init: () => "",
  update: (_, value) => value,
  view: (h, value) =>
    Card(h).children(
      Field(h, {
        label: "Name",
        children: [h.input.value(value).onInput(({ value }) => value)]
      }),
      Framed(h).class("wide").children(value)
    )
})
