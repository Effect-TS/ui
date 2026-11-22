import { Component, UiSchema } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Schema } from "effect"
import { Html, textOf } from "./shared.ts"

// Phase 2, item 6: a reading-progress bar from the scroll offset, and a count
// of finished scrolls. Every `Scrolled` carries the offset and `scrolling`.
// With `trackScroll` the list sends one for each change of the offset; with it
// off, only when the visible rows, an edge or `scrolling` changes, so the bar
// moves in steps and catches up when a scroll ends.
const ProgressMessage = UiSchema.TaggedEnum({
  ToggledTracking: {},
  Scrolled: {
    first: Schema.Number,
    last: Schema.Number,
    atStart: Schema.Boolean,
    atEnd: Schema.Boolean,
    offset: Schema.Number,
    height: Schema.Number,
    length: Schema.Number,
    scrolling: Schema.Boolean
  }
})

const ProgressModel = Schema.Struct({
  track: Schema.Boolean,
  offset: Schema.Number,
  height: Schema.Number,
  length: Schema.Number,
  scrolling: Schema.Boolean,
  first: Schema.Number,
  last: Schema.Number,
  atStart: Schema.Boolean,
  atEnd: Schema.Boolean,
  scrolled: Schema.Number,
  moves: Schema.Number,
  stops: Schema.Number
})

export const ProgressDemo = Component.define({
  name: "ProgressDemo",
  scoped: false,
  model: ProgressModel,
  message: ProgressMessage,
  elements: Html
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
    ToggledTracking: (model) => ({ ...model, track: !model.track, scrolled: 0, moves: 0, stops: 0 }),
    Scrolled: (model, { atEnd, atStart, first, height, last, length, offset, scrolling }) => ({
      ...model,
      offset,
      height,
      length,
      scrolling,
      first,
      last,
      atStart,
      atEnd,
      scrolled: model.scrolled + 1,
      // Events where the visible rows or an edge changed, apart from a scroll starting or ending.
      moves: first !== model.first || last !== model.last || atStart !== model.atStart || atEnd !== model.atEnd
        ? model.moves + 1
        : model.moves,
      // A scroll has finished when `scrolling` turns false.
      stops: model.scrolling && !scrolling ? model.stops + 1 : model.stops
    })
  },
  view: (model, h) => {
    const progress = model.length > model.height ? model.offset / (model.length - model.height) : 0
    return h.div.children(
      h.div.class("toolbar fixed").children(
        h.button.attr("id", "toggle-tracking").onClick(ProgressMessage.ToggledTracking()).children(
          model.track ? "Stop tracking" : "Track the scroll"
        ),
        h.span.attr("id", "status").attrs({
          "data-offset": String(model.offset),
          "data-scrolled": String(model.scrolled),
          "data-moves": String(model.moves),
          "data-scrolling": String(model.scrolling),
          "data-stops": String(model.stops)
        }).children(`${Math.round(progress * 100)}% read, ${model.stops} scrolls finished`),
        h.div.class("progress").children(
          h.div.class("progress-bar").attr("style", `width:${(progress * 100).toFixed(2)}%`)
        )
      ),
      VirtualList(h, {
        props: { count: 2000, itemSize: 72, trackScroll: model.track },
        onEmit: {
          Scrolled: ({ atEnd, atStart, first, height, last, length, offset, scrolling }) =>
            ProgressMessage.Scrolled({ first, last, atStart, atEnd, offset, height, length, scrolling })
        },
        view: (virtualList) =>
          // The parts say whether the list is scrolling too, for rows that skip costly content meanwhile.
          virtualList.list(h.div.class("article").attr("data-scrolling", String(virtualList.scrolling))).children(
            virtualList.items.map((index) =>
              virtualList.item({ element: h.div.class("paragraph").key(String(index)), index }).children(
                h.p.children(index + 1 + ". " + textOf(index) + " " + textOf(index + 1))
              )
            )
          )
      })
    )
  }
})
