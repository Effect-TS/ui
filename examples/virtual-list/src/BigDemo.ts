import { Component, UiSchema } from "@effect/ui"
import { VirtualList, VirtualListScrollTarget } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { textOf } from "./shared.ts"

const BigMessage = UiSchema.TaggedEnum({
  ClickedJump: { index: Schema.Number }
})

export const BigDemo = Component.define({
  name: "BigDemo",
  scoped: false,
  model: Schema.Struct({ index: Schema.Number, jump: Schema.Number }),
  message: BigMessage,
  elements: Html
}).make({
  init: () => ({ index: 0, jump: 0 }),
  update: {
    ClickedJump: ($, { index }) => ({ index, jump: $.model.jump + 1 })
  },
  view: (h, model) =>
    h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "middle").onClick(
          BigMessage.ClickedJump({ index: 50_000 })
        ).children("Jump to 50,000"),
        h.button.attr("id", "end").onClick(
          BigMessage.ClickedJump({ index: 99_999 })
        ).children("Jump to the end")
      ),
      VirtualList(h, {
        props: {
          count: 100_000,
          itemSize: 40,
          scrollTo: model.jump === 0
            ? undefined
            : {
              target: VirtualListScrollTarget.Index({ index: model.index }),
              id: model.jump
            }
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.list(h.ul.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.li.class("row loose").key(String(index)),
                  index
                }).children(
                  h.strong.children("Row " + index),
                  index % 3 === 0 ? null : h.p.children(textOf(index))
                )
              )
            )
          )
      })
    )
})
