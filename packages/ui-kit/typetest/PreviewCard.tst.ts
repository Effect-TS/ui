import { Component, UiSchema } from "@effect/ui"
import {
  PreviewCard,
  type PreviewCardDismissReason,
  type PreviewCardInstant,
  type PreviewCardOpenReason,
  PreviewCardTrigger,
  type PreviewCardTriggerElement
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Link = Html.Element<Msg, never, Html.EventsOf<"a">, HTMLAnchorElement, "a">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">

describe("PreviewCard", () => {
  it("each part returns the builder it was given, and the portal may be absent", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        PreviewCard(h, {
          key: "p",
          props: { open: false },
          view: (previewCard) => {
            const trigger = previewCard.trigger({
              element: h.a.onClick(Msg.Clicked()),
              delay: 100,
              closeDelay: 50
            })
            expect(trigger).type.toBe<Link>()
            expect(previewCard.portal(h.div)).type.toBe<Div | undefined>()
            expect(previewCard.backdrop(h.div)).type.toBe<Div>()
            expect(previewCard.positioner(h.div)).type.toBe<Div>()
            expect(previewCard.popup(h.div)).type.toBe<Div>()
            expect(previewCard.viewport(h.div)).type.toBe<Div>()
            expect(previewCard.arrow(h.div)).type.toBe<Div>()
            expect(previewCard.triggerId).type.toBe<string | null>()
            expect(previewCard.openReason).type.toBe<
              PreviewCardOpenReason | null
            >()
            expect(previewCard.instant).type.toBe<
              PreviewCardInstant | undefined
            >()
            return h.p([
              trigger.children(["Typography"]),
              previewCard.portal(h.div)?.children([
                previewCard.positioner(h.div).children([
                  previewCard.popup(h.div).children(["Preview"])
                ])
              ])
            ])
          }
        })
    })
  })

  it("the trigger takes only a link, and the events report why the card opened and closed", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        PreviewCard(h, {
          key: "p",
          props: { open: false },
          onEmit: {
            RequestedOpen: ({ reason, triggerId }) => {
              expect(reason).type.toBe<PreviewCardOpenReason>()
              expect(triggerId).type.toBe<string | null>()
              return Msg.Clicked()
            },
            RequestedClose: ({ reason }) => {
              expect(reason).type.toBe<PreviewCardDismissReason>()
              return Msg.Clicked()
            },
            Settled: () => Msg.Clicked()
          },
          view: (previewCard) => {
            expect(previewCard.trigger).type.not.toBeCallableWith({
              element: h.button
            })
            expect(previewCard.trigger).type.not.toBeCallableWith(h.a)
            expect(previewCard.positioner).type.not.toBeCallableWith(h.span)
            return previewCard.trigger({ element: h.a })
          }
        })
    })
  })

  it("a trigger drawn elsewhere returns the link it was given", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        const link = PreviewCardTrigger(h, {
          element: h.a.attr("href", "/a"),
          props: { open: false, popupId: "card" }
        })
        expect(link).type.toBe<PreviewCardTriggerElement<Msg>>()
        expect(PreviewCardTrigger).type.not.toBeCallableWith(h, {
          element: h.button,
          props: { open: false, popupId: "card" }
        })
        return link
      }
    })
  })
})
