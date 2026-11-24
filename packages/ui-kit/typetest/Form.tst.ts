import { Component, UiSchema, type View } from "@effect/ui"
import { Form, type FormEvents } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ SubmittedForm: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Element<K extends keyof HTMLElementTagNameMap, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<K>,
  HTMLElementTagNameMap[K],
  K
>

describe("Form", () => {
  it("the root returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({
      name: "App",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Form(h, {
          onEmit: (event) => {
            expect(event).type.toBe<FormEvents>()
            return Msg.SubmittedForm()
          },
          view: (form) => {
            expect(form.root).type.not.toBeCallableWith(h.div)
            expect(form.root).type.not.toBeCallableWith({ element: h.form })
            const root = form.root(h.form.class("signup")).children(
              h.input,
              needsClock
            )
            expect(root).type.toBe<Element<"form", Clock>>()
            return root
          }
        })
    })
  })

  it("a form needs no service, and Submitted carries the fields and the entries", () => {
    expect<Component.Headless.Requirements<typeof Form>>().type.toBe<never>()
    expect<FormEvents>().type.toBe<{
      readonly _tag: "Submitted"
      readonly fields: { readonly [x: string]: string }
      readonly entries: ReadonlyArray<readonly [string, string]>
    }>()
  })
})
