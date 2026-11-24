import { Component, type View } from "@effect/ui"
import { Html, Markdown } from "@effect/ui/html"
import { Context, type Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock
  extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()(
    "Clock"
  )
{}
class Tracker
  extends Context.Service<Tracker, { readonly seen: Effect.Effect<void> }>()(
    "Tracker"
  )
{}

declare const clockChild: View.Child<never, Clock>
declare const trackerChild: View.Child<never, Tracker>
declare const document: Markdown.Document

const definitions = {
  Clock: Schema.Struct({ zone: Schema.String }),
  Note: Schema.Struct({})
}

type IslandsRequirements<I> = I extends Markdown.Islands<any, infer R> ? R
  : never

describe("Markdown.islandsFor", () => {
  it("decodes each view's attributes through its schema", () => {
    Markdown.islandsFor(definitions, {
      Clock: (_h, attributes) => {
        expect(attributes).type.toBe<{ readonly zone: string }>()
        return clockChild
      },
      Note: (h) => h.hr
    })
  })

  it("collects the services the island views need", () => {
    const islands = Markdown.islandsFor(definitions, {
      Clock: (_h, { zone }) => zone === "UTC" ? clockChild : trackerChild,
      Note: (h, _attributes, content) => h.aside.children(content)
    })

    expect<IslandsRequirements<typeof islands>>().type.toBe<Clock | Tracker>()
  })

  it("needs no services when no view does", () => {
    const islands = Markdown.islandsFor(definitions, {
      Clock: (h, { zone }) => h.span.children(zone),
      Note: (h) => h.hr
    })

    expect<IslandsRequirements<typeof islands>>().type.toBe<never>()
  })

  it("requires a view for every definition", () => {
    expect(Markdown.islandsFor).type.not.toBeCallableWith(definitions, {
      Note: (h: Html.H<never>) => h.hr
    })
  })

  it("passes the services on to the component that renders the document", () => {
    const Post = Component.define({
      name: "Post",
      model: Schema.Struct({}),
      message: Schema.Never,
      elements: Html
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: (h) =>
        Markdown.view(h, document, {
          islands: Markdown.islandsFor(definitions, {
            Clock: () => clockChild,
            Note: (h) => h.hr
          })
        })
    })

    expect<Component.Requirements<typeof Post>>().type.toBe<Clock>()
  })
})
