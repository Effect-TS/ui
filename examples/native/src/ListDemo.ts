// A long list on `VirtualList`: 10,000 rows of mixed heights in sections,
// with jumps, rows added at either end and rows that grow.
import { Pressable, VirtualList } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Virtualizer from "@effect/ui/Virtualizer"
import * as Schema from "effect/Schema"

const Message = UiSchema.TaggedEnum({
  Jumped: { target: Virtualizer.ScrollTarget },
  Prepended: {},
  Appended: {},
  Grew: {},
  Scrolled: {
    first: Schema.Number,
    last: Schema.Number,
    atStart: Schema.Boolean,
    atEnd: Schema.Boolean,
    scrolling: Schema.Boolean
  }
})

type Message = typeof Message.Type

const section = 100

const button = {
  backgroundColor: "#111827",
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 6
} as const

const pressable = (h: Native.H<Message>, message: Message, text: string) =>
  Pressable(h, {
    onPress: message,
    props: { pressedStyle: { backgroundColor: "#374151" } }
  }).style(button).children(
    h.text.style({ color: "white", fontSize: 13 }).children(text)
  )

export const ListDemo = Native.component({
  name: "ListDemo",
  model: Schema.Struct({
    // Row numbers, so rows added before the first are negative.
    rows: Schema.Array(Schema.Number),
    tall: Schema.Boolean,
    jumps: Schema.Number,
    scrollTo: Schema.NullOr(Virtualizer.ScrollTo),
    seen: Schema.String
  }),
  message: Message
}).make({
  init: () => ({
    rows: Array.from({ length: 10_000 }, (_, i) => i),
    tall: false,
    jumps: 0,
    scrollTo: null,
    seen: ""
  }),
  update: {
    Jumped: ($, { target }) =>
      $.evolve({
        jumps: (jumps) => jumps + 1,
        scrollTo: () => ({ target, id: $.model.jumps + 1 })
      }),
    Prepended: ($) =>
      $.evolve({
        rows: (rows) => [
          ...Array.from({ length: 20 }, (_, i) => rows[0]! - 20 + i),
          ...rows
        ]
      }),
    Appended: ($) =>
      $.evolve({
        rows: (rows) => [
          ...rows,
          ...Array.from(
            { length: 20 },
            (_, i) => rows[rows.length - 1]! + 1 + i
          )
        ]
      }),
    Grew: ($) => $.evolve({ tall: (tall) => !tall }),
    Scrolled: ($, { atEnd, atStart, first, last, scrolling }) =>
      $.evolve({
        seen: () =>
          `rows ${first}-${last}${atStart ? " start" : ""}${
            atEnd ? " end" : ""
          }${scrolling ? " scrolling" : ""}`
      })
  },
  view: (h, model) => {
    const keys = model.rows.map(String)
    const sticky = model.rows.flatMap((row, i) =>
      row % section === 0 ? [i] : []
    )
    return h.view.style({ flex: 1 }).children(
      h.view.style({
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        paddingHorizontal: 12,
        paddingBottom: 8
      }).children(
        pressable(
          h,
          Message.Jumped({
            target: Virtualizer.ScrollTarget.Index({ index: 0 })
          }),
          "Top"
        ),
        pressable(
          h,
          Message.Jumped({
            target: Virtualizer.ScrollTarget.Key({ key: "5000" })
          }),
          "Row 5000"
        ),
        pressable(
          h,
          Message.Jumped({ target: Virtualizer.ScrollTarget.End() }),
          "End"
        ),
        pressable(h, Message.Prepended(), "Prepend 20"),
        pressable(h, Message.Appended(), "Append 20"),
        pressable(h, Message.Grew(), model.tall ? "Shrink" : "Grow")
      ),
      VirtualList(h, {
        props: {
          keys,
          itemSize: 48,
          sticky,
          followEnd: true,
          ...(model.scrollTo === null ? {} : { scrollTo: model.scrollTo })
        },
        onEmit: {
          Scrolled: ({ atEnd, atStart, first, last, scrolling }) =>
            Message.Scrolled({
              first: model.rows[first] ?? first,
              last: model.rows[last] ?? last,
              atStart,
              atEnd,
              scrolling
            })
        },
        view: (list) =>
          h.view.style({ flex: 1 }).children(
            h.text.style({
              fontSize: 13,
              color: "#374151",
              paddingHorizontal: 12
            })
              .children(
                `${model.seen} | ${list.items.length} rendered of ${list.count}`
              ),
            list.list(h.scroll.style({ flex: 1 })).children(
              list.items.map((index) => {
                const row = model.rows[index]!
                const header = row % section === 0
                return list.item({
                  element: h.view.key(keys[index]!).style(
                    header
                      ? {
                        backgroundColor: "#1f2937",
                        paddingVertical: 10,
                        paddingHorizontal: 16
                      }
                      : {
                        paddingVertical: model.tall ? 24 : 10,
                        paddingHorizontal: 16,
                        borderBottomWidth: 1,
                        borderColor: "#e5e7eb",
                        backgroundColor: row < 0 ? "#fef3c7" : "white"
                      }
                  ),
                  index
                }).children(
                  h.text.style({
                    fontSize: header ? 15 : 16,
                    fontWeight: header ? "bold" : "normal",
                    color: header ? "white" : "#111827"
                  }).children(
                    header
                      ? `Section ${row / section}`
                      : `Row ${row}${
                        row % 5 === 0 ? "\nwith a second line\nand a third" : ""
                      }`
                  )
                )
              })
            )
          )
      })
    )
  }
})
