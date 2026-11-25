import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const HexColorPicker = Html.customElement({
  tag: "hex-color-picker",
  properties: { color: Schema.String },
  events: { "color-changed": Schema.Struct({ value: Schema.String }) }
})

export const QrCode = Html.customElement({
  tag: "sl-qr-code",
  properties: {
    value: Schema.String,
    label: Schema.String,
    size: Schema.Number,
    fill: Schema.String,
    background: Schema.String,
    radius: Schema.Number
  }
})

export const Target = Schema.Literals(["fill", "background"])
export type Target = typeof Target.Type

export const QrDesignerModel = Schema.Struct({
  text: Schema.String,
  fill: Schema.String,
  background: Schema.String,
  radius: Schema.Number,
  editing: Target
})

export const QrDesignerMessage = UiSchema.TaggedEnum({
  ChangedText: { text: Schema.String },
  ChoseTarget: { target: Target },
  PickedColor: { color: Schema.String },
  ChangedRadius: { radius: Schema.Number }
})

const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-gray-700"

const targetButton = (
  h: Html.H<typeof QrDesignerMessage.Type>,
  editing: Target,
  target: Target,
  label: string
) =>
  h.button
    .attr("aria-pressed", String(editing === target))
    .class(
      editing === target
        ? "flex-1 bg-black text-white px-3 py-2"
        : "flex-1 border border-gray-300 text-gray-700 px-3 py-2"
    )
    .onClick(QrDesignerMessage.ChoseTarget({ target }))
    .children(label)

export const QrDesigner = Html.component({
  name: "QrDesigner",
  model: QrDesignerModel,
  message: QrDesignerMessage
}).make({
  init: () => ({
    text: "https://effect.website",
    fill: "#111827",
    background: "#ffffff",
    radius: 0,
    editing: "fill" as const
  }),
  update: {
    ChangedText: ($, { text }) => $.evolve({ text: () => text }),
    ChoseTarget: ($, { target }) => $.evolve({ editing: () => target }),
    PickedColor: ($, { color }) => $.evolve({ [$.model.editing]: () => color }),
    ChangedRadius: ($, { radius }) => $.evolve({ radius: () => radius })
  },
  view: (h, model) =>
    h.main.class(
      "min-h-screen bg-gray-50 flex flex-wrap items-start justify-center gap-10 p-10"
    ).children(
      h.section.class("flex flex-col gap-5 w-72").children(
        h.h1.class("text-2xl font-bold text-gray-800").children("QR Designer"),
        h.label.class(LABEL_CLASS).children(
          "Text",
          h.input
            .class("border border-gray-300 bg-white px-3 py-2")
            .value(model.text)
            .onInput(({ value }) =>
              QrDesignerMessage.ChangedText({ text: value })
            )
        ),
        h.div.class("flex gap-2").children(
          targetButton(h, model.editing, "fill", "Foreground"),
          targetButton(h, model.editing, "background", "Background")
        ),
        HexColorPicker(h)
          .attr("aria-label", "Color")
          .color(model[model.editing])
          .onColorChanged(({ value }) =>
            QrDesignerMessage.PickedColor({ color: value })
          ),
        h.label.class(LABEL_CLASS).children(
          "Corner radius",
          h.input
            .attr("type", "range")
            .attr("min", "0")
            .attr("max", "0.5")
            .attr("step", "0.05")
            .value(String(model.radius))
            .onInput(({ value }) =>
              QrDesignerMessage.ChangedRadius({ radius: Number(value) })
            )
        )
      ),
      h.figure.class("bg-white p-6 shadow").children(
        QrCode(h)
          .value(model.text)
          .label(`QR code for ${model.text}`)
          .size(256)
          .fill(model.fill)
          .background(model.background)
          .radius(model.radius)
      )
    )
})
