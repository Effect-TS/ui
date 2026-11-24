import { Command, Component, Head, UiSchema } from "@effect/ui"
import { HtmlFiles } from "@effect/ui/html"
import { Effect, Schema } from "effect"

const HEAD_LINES = 10

export const Preview = UiSchema.TaggedEnum({
  NoFile: {},
  Reading: { name: Schema.String },
  Read: { name: Schema.String, lines: Schema.Number, head: Schema.String },
  Cancelled: { name: Schema.String },
  Failed: { name: Schema.String }
})
export type Preview = typeof Preview.Type

export const PreviewMessage = UiSchema.TaggedEnum({
  ChoseFiles: { files: Schema.Array(Schema.instanceOf(File)) },
  ClickedCancel: {},
  CompletedReadFile: {
    name: Schema.String,
    lines: Schema.Number,
    head: Schema.String
  },
  FailedReadFile: { name: Schema.String }
})

export const ReadFile = Command.make(
  "preview/ReadFile",
  { args: { file: Schema.instanceOf(File) }, mode: "switch" },
  ({ file }) =>
    HtmlFiles.readAsText(file).pipe(
      Effect.match({
        onSuccess: (text) => {
          const lines = text.split("\n")
          return PreviewMessage.CompletedReadFile({
            name: file.name,
            lines: lines.length,
            head: lines.slice(0, HEAD_LINES).join("\n")
          })
        },
        onFailure: () => PreviewMessage.FailedReadFile({ name: file.name })
      })
    )
)

const BUTTON_CLASS =
  "px-4 py-2 rounded-md font-medium transition cursor-pointer"

const FilePreviewDef = Component.define({
  name: "FilePreview",
  model: Preview,
  message: PreviewMessage
})

const Status = FilePreviewDef.fragment((h, preview: Preview) =>
  Preview.match(preview, {
    NoFile: () =>
      h.p.class(["text-center text-gray-500"]).children([
        "Choose a text file to preview it."
      ]),
    Reading: ({ name }) =>
      h.div.class([
        "flex items-center justify-between gap-3 p-4 bg-white rounded-lg shadow"
      ]).children([
        h.span.class(["text-gray-700"]).children([`Reading ${name}…`]),
        h.button.onClick(PreviewMessage.ClickedCancel())
          .class([
            BUTTON_CLASS,
            "border border-red-300 text-red-600 hover:bg-red-50"
          ])
          .children(["Cancel"])
      ]),
    Read: ({ head, lines, name }) =>
      h.section.class(["flex flex-col gap-2 p-4 bg-white rounded-lg shadow"])
        .children([
          h.h2.class(["font-medium text-gray-800"]).children([
            `${name}: ${lines} lines`
          ]),
          h.pre.class(["text-sm text-gray-600 overflow-x-auto"]).children([
            head
          ])
        ]),
    Cancelled: ({ name }) =>
      h.p.class(["text-center text-gray-500"]).children([
        `Cancelled reading ${name}.`
      ]),
    Failed: ({ name }) =>
      h.p.class(["text-center text-red-600"]).children([
        `Couldn't read ${name}.`
      ])
  })
)

export const FilePreview = FilePreviewDef.make({
  init: () => Preview.NoFile(),
  update: {
    ChoseFiles: ($, { files: [file] }) =>
      file === undefined
        ? $.model
        : $.set(Preview.Reading({ name: file.name })).run([
          ReadFile.make({ file })
        ]),
    ClickedCancel: ($) =>
      $.model._tag === "Reading"
        ? $.set(Preview.Cancelled({ name: $.model.name })).run([
          Command.interrupt(ReadFile)
        ])
        : $.model,
    CompletedReadFile: (_, { head, lines, name }) =>
      Preview.Read({ name, lines, head }),
    FailedReadFile: (_, { name }) => Preview.Failed({ name })
  },
  head: () => [Head.title("Effect UI File Preview Example")],
  view: (h, preview) =>
    h.div.class(["min-h-screen bg-gray-100 py-8"]).children([
      h.div.class(["max-w-lg mx-auto flex flex-col gap-6 px-4"]).children([
        h.h1.class(["text-3xl font-bold text-gray-800 text-center"]).children([
          "File Preview"
        ]),
        h.label.class([
          BUTTON_CLASS,
          "self-center bg-blue-500 text-white hover:bg-blue-600"
        ]).children([
          "Choose a file",
          h.input.attr("type", "file").class(["sr-only"]).value("")
            .onChange(({ files }) => PreviewMessage.ChoseFiles({ files }))
        ]),
        Status(h, preview)
      ])
    ])
})
