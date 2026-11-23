import type { View } from "@effect/ui"

type Line = readonly [text: string, step?: number]

interface Box {
  readonly name: string
  readonly kind: string
  readonly note?: string
  readonly rows: ReadonlyArray<readonly [label: string, lines: ReadonlyArray<Line>, nested?: Box]>
}

interface Column {
  readonly title: string
  readonly boxes: ReadonlyArray<Box>
  readonly link: string
  readonly steps: ReadonlyArray<string>
}

const columns: ReadonlyArray<Column> = [
  {
    title: "In Foldkit 0.x, the page routes the Counter’s Message",
    boxes: [
      {
        name: "Page",
        kind: "Model, Message, update, view",
        rows: [
          ["Model", [["isCounterShown: true"]], {
            name: "counter",
            kind: "Counter.Model",
            rows: [["", [["count: 0 → 1", 5]]]]
          }],
          ["update", [["ClickedToggleCounter"], ["GotCounterMessage → Update.foldChild", 3]]],
          ["view", [["h.submodel wraps in GotCounterMessage", 2]]]
        ]
      },
      {
        name: "Counter",
        kind: "Submodel",
        note: "Functions only. Its Model is stored in Page.",
        rows: [
          ["update", [["ClickedIncrement → count + 1", 4]]],
          ["view", [["+ sends ClickedIncrement", 1]]]
        ]
      }
    ],
    link: "Page calls Counter's update and view",
    steps: [
      "The + button in Counter's view sends ClickedIncrement.",
      "h.submodel wraps it in GotCounterMessage.",
      "Page's update receives GotCounterMessage and calls Update.foldChild.",
      "Counter.update returns the new count.",
      "Update.foldChild writes it into Page's Model."
    ]
  },
  {
    title: "In Effect UI, the Message goes directly to the Counter’s update",
    boxes: [
      {
        name: "Page",
        kind: "Component",
        note: "Not involved in the click.",
        rows: [
          ["Model", [["isCounterShown: true"]]],
          ["update", [["ClickedToggleCounter"]]],
          ["view", [["Counter(h, {})"]]]
        ]
      },
      {
        name: "Counter",
        kind: "Component",
        rows: [
          ["Model", [["count: 0 → 1", 3]]],
          ["update", [["ClickedIncrement → count + 1", 2]]],
          ["view", [["+ sends ClickedIncrement", 1]]]
        ]
      }
    ],
    link: "Page renders Counter",
    steps: [
      "The + button in Counter's view sends ClickedIncrement.",
      "Counter's update returns the new count.",
      "The runtime stores it in Counter's Model."
    ]
  }
]

const Step = <M>(h: View.H<M>, step: number) =>
  h.span.class("step").attr("aria-label", `step ${step}`).children(String(step))

const BoxView = <M>(h: View.H<M>, box: Box, nested: boolean): View.Content<M> =>
  h.div.class("box", nested && "box-nested").children(
    h.p.class("box-head").children(
      h.span.class("box-name").children(box.name),
      h.span.class("box-kind").children(box.kind)
    ),
    ...box.rows.map(([label, lines, inner]) =>
      h.div.key(label).class("box-row").children(
        label === "" ? null : h.span.class("box-label").children(label),
        h.div.class("box-lines").children(
          ...lines.map(([text, step]) =>
            h.code.key(text).class("box-line", step !== undefined && "box-line-lit").children(
              step !== undefined && Step(h, step),
              text
            )
          ),
          inner && BoxView(h, inner, true)
        )
      )
    ),
    box.note && h.p.class("box-note").children(box.note)
  )

export const Diagram = <M>(h: View.H<M>, caption: string) =>
  h.figure.class("arch wide").children(
    h.div.class("arch-columns").children(
      ...columns.map((column) =>
        h.section.key(column.title).class("arch-column").attr("aria-label", column.title).children(
          h.h3.class("arch-title").children(column.title),
          h.div.class("arch-body").children(
            BoxView(h, column.boxes[0]!, false),
            h.p.class("arch-link").children(column.link),
            BoxView(h, column.boxes[1]!, false),
            h.ol.class("steps").children(
              ...column.steps.map((step, index) => h.li.key(String(index)).children(Step(h, index + 1), h.span(step)))
            )
          )
        )
      )
    ),
    h.figcaption.class("caption").children(caption)
  )
