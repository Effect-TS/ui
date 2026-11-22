import { Component, UiSchema } from "@effect/ui"
import { VirtualList, VirtualListEvents } from "@effect/ui-kit"
import { Schema } from "effect"
import { Html, textOf } from "./shared.ts"

// Phase 2, item 6: a reading-progress bar from the exact scroll offset, and a
// count of finished scrolls. `trackScroll` turns both events on; with it off
// the list sends only `Scrolled`, as before.
const ProgressMessage = UiSchema.TaggedEnum({
  ToggledTracking: {},
  Scrolled: {},
  ScrolledTo: { offset: Schema.Number, height: Schema.Number, length: Schema.Number },
  StoppedScrolling: {}
})

const ProgressModel = Schema.Struct({
  track: Schema.Boolean,
  offset: Schema.Number,
  height: Schema.Number,
  length: Schema.Number,
  scrolled: Schema.Number,
  ticks: Schema.Number,
  stops: Schema.Number
})

export const ProgressDemo = Component.define({
  name: "ProgressDemo",
  scoped: false,
  model: ProgressModel,
  message: ProgressMessage,
  elements: Html
}).make({
  init: () => ({ track: true, offset: 0, height: 0, length: 0, scrolled: 0, ticks: 0, stops: 0 }),
  update: {
    ToggledTracking: (model) => ({ ...model, track: !model.track, scrolled: 0, ticks: 0, stops: 0 }),
    Scrolled: (model) => ({ ...model, scrolled: model.scrolled + 1 }),
    ScrolledTo: (model, { height, length, offset }) => ({ ...model, offset, height, length, ticks: model.ticks + 1 }),
    StoppedScrolling: (model) => ({ ...model, stops: model.stops + 1 })
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
          "data-ticks": String(model.ticks),
          "data-stops": String(model.stops)
        }).children(`${Math.round(progress * 100)}% read, ${model.stops} scrolls finished`),
        h.div.class("progress").children(
          h.div.class("progress-bar").attr("style", `width:${(progress * 100).toFixed(2)}%`)
        )
      ),
      VirtualList(h, {
        props: { count: 2000, itemSize: 72, trackScroll: model.track },
        // One callback for all of the list's events.
        onEmit: (event) =>
          VirtualListEvents.match(event, {
            Scrolled: () => ProgressMessage.Scrolled(),
            ScrolledTo: ({ height, length, offset }) => ProgressMessage.ScrolledTo({ offset, height, length }),
            StoppedScrolling: () => ProgressMessage.StoppedScrolling()
          }),
        view: (virtualList) =>
          virtualList.list(h.div.class("article")).children(
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
