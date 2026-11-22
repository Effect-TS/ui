import { Command, Component, UiSchema } from "@effect/ui"
import { VirtualList, VirtualListScrollTarget } from "@effect/ui-kit"
import { Duration, Effect, Schema } from "effect"
import { Html, textOf } from "./shared.ts"

// Phase 2, item 5: a chat that loads older messages as the user scrolls up.
// 50 of 500 messages are loaded, a page of 50 takes 500ms, and `reserveStart`
// keeps room above the oldest loaded message until the first one arrives.
const total = 500
const page = 50
const reserve = 2000

const ChatMessage = UiSchema.TaggedEnum({
  ApproachedStart: {},
  LoadedOlder: { before: Schema.Number },
  ClickedSend: {}
})

class LoadOlder extends Command.Service<LoadOlder>()(
  "virtual-list/LoadOlder",
  { args: { before: Schema.Number }, mode: "switch" },
  Effect.succeed(({ before }) =>
    Effect.sleep(Duration.millis(500)).pipe(Effect.as(ChatMessage.LoadedOlder({ before })))
  )
) {}

const ChatModel = Schema.Struct({ start: Schema.Number, sent: Schema.Number, loading: Schema.Boolean })

const ChatDemoNoDeps = Component.define({
  name: "ChatDemo",
  scoped: false,
  model: ChatModel,
  message: ChatMessage,
  elements: Html
}).make({
  init: () => ({ start: total - page, sent: 0, loading: false }),
  update: {
    ApproachedStart: (model, _message, $) =>
      model.loading || model.start === 0
        ? model
        : $.set({ ...model, loading: true }).run(LoadOlder.make({ before: model.start })),
    LoadedOlder: (model, { before }) =>
      before === model.start ? { ...model, start: Math.max(0, before - page), loading: false } : model,
    ClickedSend: (model) => ({ ...model, sent: model.sent + 1 })
  },
  view: (model, h) => {
    const ids = Array.from({ length: total - model.start + model.sent }, (_, i) => "m" + (model.start + i))
    return h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "send").onClick(ChatMessage.ClickedSend()).children("Send a message"),
        h.span.attr("id", "status").attr("data-start", String(model.start)).attr(
          "data-loading",
          String(model.loading)
        ).children(model.start === 0 ? "All messages loaded" : `Loaded from message ${model.start}`)
      ),
      VirtualList(h, {
        props: {
          count: ids.length,
          itemSize: 48,
          // Keyed items stay in place on screen when a page lands before them.
          keys: ids,
          reserveStart: model.start === 0 ? 0 : reserve,
          contentAlignment: "end",
          followEnd: true,
          scrollTo: { target: VirtualListScrollTarget.End() }
        },
        onEmit: {
          // Ask for the next page while a few screens of messages are left.
          Scrolled: ({ first }) => first < 20 ? ChatMessage.ApproachedStart() : undefined,
          ScrolledTo: () => undefined,
          StoppedScrolling: () => undefined
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller chat").attr("data-at-start", String(virtualList.atStart)))
            .children(
              virtualList.list(h.ol.class("messages")).children(
                virtualList.items.map((index) => {
                  const number = model.start + index
                  return virtualList.item({ element: h.li.class("message").key(ids[index]!), index }).children(
                    h.strong.children("Message " + number),
                    h.p.children(textOf(number))
                  )
                })
              )
            )
      })
    )
  }
})

export const ChatDemo = ChatDemoNoDeps.pipe(Component.provide(LoadOlder.layer))
