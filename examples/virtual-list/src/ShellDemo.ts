import { Component, UiSchema } from "@effect/ui"
import { VirtualList, VirtualListScrollTarget } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const ShellMessage = UiSchema.TaggedEnum({ ClickedJump: {}, ClickedAppend: {} })

export const ShellDemo = Component.define({
  name: "ShellDemo",
  model: Schema.Struct({ count: Schema.Number, jump: Schema.Number }),
  message: ShellMessage,
  elements: Html
}).make({
  init: () => ({ count: 10_000, jump: 0 }),
  update: {
    ClickedJump: ($) => $.evolve({ jump: (jump) => jump + 1 }),
    ClickedAppend: ($) => $.evolve({ count: (count) => count + 1 })
  },
  view: (h, model) =>
    h.div.class("shell").children(
      h.aside.class("sidebar").children(
        h.strong.children("Inbox"),
        h.button.attr("id", "jump").onClick(ShellMessage.ClickedJump())
          .children("Jump to 5,000"),
        h.button.attr("id", "append").onClick(ShellMessage.ClickedAppend())
          .children("Append a row")
      ),
      h.main.class("main").children(
        h.h1.children("Messages"),
        h.p.children(
          "The list scrolls with this <main>, which it doesn't render."
        ),
        VirtualList(h, {
          props: {
            count: model.count,
            itemSize: 40,
            scrollContainer: "nearest",
            followEnd: true,
            scrollTo: model.jump === 0
              ? undefined
              : {
                target: VirtualListScrollTarget.Index({ index: 5000 }),
                id: model.jump
              }
          },
          view: (virtualList) =>
            virtualList.list(h.ul.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.li.class("row").key(String(index)),
                  index
                }).children(
                  h.button.class("row-button").children("Message " + index)
                )
              )
            )
        })
      )
    )
})
