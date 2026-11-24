import { Component } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { textOf } from "./shared.ts"

export const GridDemo = Component.define({
  name: "GridDemo",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    VirtualList(h, {
      props: { count: 10_000, itemSize: 120, initialCount: 24 },
      view: (virtualList) =>
        virtualList.list(h.ul.class("grid")).children(
          virtualList.items.map((index) =>
            virtualList.item({
              element: h.li.class("card").key(String(index)),
              index
            }).children(
              h.strong.children("Card " + index),
              h.p.children(textOf(index).slice(0, 60))
            )
          )
        )
    })
})
