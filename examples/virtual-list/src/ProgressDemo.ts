import { UiSchema } from "@effect/ui"
import { VirtualList, VirtualListEvents } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema, Struct } from "effect"
import { textOf } from "./shared.ts"

const scrolledFields = Struct.omit(VirtualListEvents.cases.Scrolled.fields, [
  "_tag"
])

const ProgressMessage = UiSchema.TaggedEnum({
  ToggledTracking: {},
  Scrolled: scrolledFields
})

const ProgressModel = Schema.Struct({
  track: Schema.Boolean,
  ...scrolledFields,
  scrolled: Schema.Number,
  moves: Schema.Number,
  stops: Schema.Number
})

export const ProgressDemo = Html.component({
  name: "ProgressDemo",
  model: ProgressModel,
  message: ProgressMessage
}).make({
  init: () => ({
    track: true,
    offset: 0,
    height: 0,
    length: 0,
    scrolling: false,
    first: -1,
    last: -1,
    atStart: false,
    atEnd: false,
    scrolled: 0,
    moves: 0,
    stops: 0
  }),
  update: {
    ToggledTracking: ($) =>
      $.evolve({ track: (track) => !track, scrolled: 0, moves: 0, stops: 0 }),
    Scrolled: ($, { _tag, ...at }) => ({
      ...$.model,
      ...at,
      scrolled: $.model.scrolled + 1,
      moves: at.first !== $.model.first || at.last !== $.model.last ||
          at.atStart !== $.model.atStart ||
          at.atEnd !== $.model.atEnd
        ? $.model.moves + 1
        : $.model.moves,
      stops: $.model.scrolling && !at.scrolling
        ? $.model.stops + 1
        : $.model.stops
    })
  },
  view: (h, model) => {
    const progress = model.length > model.height
      ? model.offset / (model.length - model.height)
      : 0
    return h.div.children(
      h.div.class("toolbar fixed").children(
        h.button.attr("id", "toggle-tracking").onClick(
          ProgressMessage.ToggledTracking()
        ).children(
          model.track ? "Stop tracking" : "Track the scroll"
        ),
        h.span.attr("id", "status").attrs({
          "data-offset": String(model.offset),
          "data-scrolled": String(model.scrolled),
          "data-moves": String(model.moves),
          "data-scrolling": String(model.scrolling),
          "data-stops": String(model.stops)
        }).children(
          `${Math.round(progress * 100)}% read, ${model.stops} scrolls finished`
        ),
        h.div.class("progress").children(
          h.div.class("progress-bar").attr(
            "style",
            `width:${(progress * 100).toFixed(2)}%`
          )
        )
      ),
      VirtualList(h, {
        props: { count: 2000, itemSize: 72, trackScroll: model.track },
        onEmit: {
          Scrolled: ({ _tag, ...at }) => ProgressMessage.Scrolled(at)
        },
        view: (virtualList) =>
          virtualList.list(
            h.div.class("article").attr(
              "data-scrolling",
              String(virtualList.scrolling)
            )
          ).children(
            virtualList.items.map((index) =>
              virtualList.item({
                element: h.div.class("paragraph").key(String(index)),
                index
              }).children(
                h.p.children(
                  index + 1 + ". " + textOf(index) + " " + textOf(index + 1)
                )
              )
            )
          )
      })
    )
  }
})
