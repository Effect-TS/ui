/**
 * @title Reusing view functions with children
 *
 * Use a plain function for a stateless wrapper. Return the builder when
 * its root is the hole, so callers add children without a children generic.
 * For a nested hole, take an options object with a generic children field.
 */
import { Component, type View } from "@effect/ui"
import { Schema } from "effect"
// Component.H uses the app's registered vocabulary, not one definition.
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"

const card = <M>(h: Component.H<M>) => h.section.class("card")

// Keep C inferred: View.Input<M> rejects children needing services, while
// annotating children as View.Children<M> erases their requirements.
const field = <M, C extends View.Children<M>>(h: Component.H<M>, options: {
  readonly label: string
  readonly children: C
}) => h.label.children(options.label, h.div.class("control").children(options.children))

// Arrays are accepted directly. Do not spread options.children. The result
// retains the union of the children's requirements for the enclosing component.
export const Form = Component.define({
  name: "Form",
  model: Schema.String,
  message: Schema.String
}).make({
  init: () => "",
  update: (_, value) => value,
  view: (value, h) =>
    card(h).children(field(h, {
      label: "Name",
      children: [h.input.value(value).onInput(({ value }) => value)]
    }))
})
