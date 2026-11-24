import { Component, Head, Renderer, type View } from "@effect/ui"
import { Html, HtmlHead } from "@effect/ui/html"
import * as HtmlHeadModule from "@effect/ui/html/HtmlHead"
import { type Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Neutral = Component.define({
  name: "Neutral",
  model: Schema.Null,
  message: Schema.Never
})
const Page = Component.define({
  name: "Page",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})

declare const content: View.Content<never, any>

const base = {
  init: () => null,
  update: ($: { readonly model: null }) => $.model
}

describe("Head and HtmlHead", () => {
  it("a host-neutral component contributes only Head's entries", () => {
    expect(Neutral.make).type.toBeCallableWith({
      ...base,
      head: () => [
        Head.title("Ada"),
        Head.titleTemplate((title: string) => `${title} · App`)
      ],
      view: () => content
    })
    expect(Neutral.make).type.not.toBeCallableWith({
      ...base,
      head: () => [HtmlHead.meta({ name: "description", content: "Ada" })],
      view: () => content
    })
  })

  it("an Html component takes Head's and HtmlHead's entries", () => {
    expect(Page.make).type.toBeCallableWith({
      ...base,
      head: () => [
        Head.title("Ada"),
        HtmlHead.meta({ name: "description", content: "Ada" }),
        HtmlHead.lang("en")
      ],
      view: () => content
    })
    const made = Page.make({ ...base, view: (h) => h.p(["Ada"]) })
    expect(Renderer.prerender(made, {})).type.toBe<
      Effect.Effect<Renderer.Prerendered<null, HtmlHead.HtmlHead>>
    >()
  })

  it("a reduce's below is typed by its vocabulary", () => {
    Neutral.make({
      ...base,
      head: () => [
        Head.reduce((below) => {
          expect(below).type.toBe<Head.Head>()
          return below
        })
      ],
      view: () => content
    })
    Page.make({
      ...base,
      head: () => [
        HtmlHead.reduce((below) => {
          expect(below).type.toBe<HtmlHead.HtmlHead>()
          return {
            ...below,
            meta: [
              ...below.meta,
              HtmlHead.meta({
                property: "og:title",
                content: below.title ?? ""
              })
            ]
          }
        }),
        Head.reduce((below) => {
          expect(below).type.toBe<Head.Head>()
          return below
        })
      ],
      view: () => content
    })
    expect(Neutral.make).type.not.toBeCallableWith({
      ...base,
      head: () => [HtmlHead.reduce((below) => below)],
      view: () => content
    })
    expect(Head.reduce).type.not.toBeCallableWith(() => ({ title: 1 }))
    const untitled = Head.reduce(() => ({ title: undefined }))
    expect(untitled.apply({ title: "x" as const }).title).type.toBe<
      string | undefined
    >()
    expect(untitled.apply(HtmlHead.empty).meta).type.toBe<
      ReadonlyArray<HtmlHead.Meta>
    >()
    expect<Head.Reduce>().type.not.toBeAssignableFrom({
      _tag: "Reduce" as const,
      apply: () => ({ title: "x" })
    })
  })

  it("Head exports only the neutral API and HtmlHead has no vocabulary", () => {
    expect(Head).type.not.toHaveProperty("meta")
    expect<Head.Entry>().type.toBe<
      Head.Title | Head.TitleTemplate | Head.Reduce
    >()
    expect<Head.Head>().type.toBe<{ readonly title: string | undefined }>()
    expect(HtmlHead).type.not.toHaveProperty("title")
    expect(HtmlHead).type.not.toHaveProperty("vocabulary")
    expect<HtmlHead.HtmlHead>().type.toBeAssignableTo<Head.Head>()
    expect(HtmlHeadModule).type.toBe(HtmlHead)
  })
})
