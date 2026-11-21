import { Component, Head, type View } from "@effect/ui"
import { Html, HtmlHead } from "@effect/ui/html"
import * as HtmlHeadModule from "@effect/ui/html/HtmlHead"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Neutral = Component.define({ name: "Neutral", scoped: false, model: Schema.Null, message: Schema.Never })
const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})

declare const content: View.Content<never, any>

const base = {
  init: () => null,
  update: (model: null) => model
}

describe("Head and HtmlHead", () => {
  it("a host-neutral component contributes only Head's entries", () => {
    expect(Neutral.make).type.toBeCallableWith({
      ...base,
      head: () => [Head.title("Ada"), Head.titleTemplate((title: string) => `${title} · App`)],
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
      head: () => [Head.title("Ada"), HtmlHead.meta({ name: "description", content: "Ada" }), HtmlHead.lang("en")],
      view: () => content
    })
  })

  it("reduceHead's below is typed by the vocabulary", () => {
    Neutral.make({
      ...base,
      reduceHead: (_, below) => {
        expect(below).type.toBe<Head.Head>()
        return below
      },
      view: () => content
    })
    Page.make({
      ...base,
      reduceHead: (_, below) => {
        expect(below).type.toBe<HtmlHead.HtmlHead>()
        return { ...below, meta: [...below.meta, HtmlHead.meta({ property: "og:title", content: below.title ?? "" })] }
      },
      view: () => content
    })
    expect(Neutral.make).type.not.toBeCallableWith({
      ...base,
      reduceHead: () => ({ title: 1 }),
      view: () => content
    })
  })

  it("Head exports only the neutral API", () => {
    expect(Head).type.not.toHaveProperty("meta")
    expect<Head.Entry>().type.toBe<Head.Title | Head.TitleTemplate>()
    expect<Head.Head>().type.toBe<{ readonly title: string | undefined }>()
    expect(HtmlHead).type.not.toHaveProperty("title")
    expect<HtmlHead.HtmlHead>().type.toBeAssignableTo<Head.Head>()
    expect(HtmlHeadModule).type.toBe(HtmlHead)
  })
})
