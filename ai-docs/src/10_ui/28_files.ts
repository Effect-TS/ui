/**
 * @title Files
 *
 * Let the user choose a file and read it: a file input reports the `File`s
 * the user chose, `HtmlFiles.pick` opens a picker from a keyboard shortcut,
 * and a Command reads the file with `HtmlFiles.readAsText`. Cancelling the
 * Command stops the browser reading the file. A story resolves the picker
 * and the read, and a scene chooses a file in the input.
 */
import { Command, Component, UiSchema } from "@effect/ui"
import { Html, HtmlFiles, HtmlSubscription } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { Effect, Schema } from "effect"

// ---------------------------------------------------------------------------
// Reading a file in a Command
// ---------------------------------------------------------------------------

// A `File` isn't plain data, so it never goes in the Model, which must
// encode into the page state and history. A message carries it from the
// input to `update`, and `update` hands it to a Command. The Model keeps
// the plain facts: the file's name and what was read from it.
export const ImportModel = UiSchema.TaggedEnum({
  Idle: {},
  Reading: { name: Schema.String },
  Imported: { name: Schema.String, rows: Schema.Number },
  Cancelled: { name: Schema.String },
  Failed: { name: Schema.String }
})
export type ImportModel = typeof ImportModel.Type

export const ImportMessage = UiSchema.TaggedEnum({
  ChoseFiles: { files: Schema.Array(Schema.instanceOf(File)) },
  PressedOpen: {},
  ClickedCancel: {},
  CompletedReadCsv: { name: Schema.String, rows: Schema.Number },
  FailedReadCsv: { name: Schema.String }
})

// The args type the file with `Schema.instanceOf(File)`. `Schema.File`
// would encode its bytes wherever the args are logged.
//
// `HtmlFiles.readAsText` reads the file's stream, so interrupting the
// Command cancels the read: the browser stops reading a large file instead
// of reading all of it and dropping the result, as `file.text()` would.
// `mode: "switch"` interrupts a read still running when the user chooses
// another file.
export const ReadCsv = Command.make(
  "import/ReadCsv",
  { args: { file: Schema.instanceOf(File) }, mode: "switch" },
  ({ file }) =>
    HtmlFiles.readAsText(file).pipe(
      Effect.match({
        onSuccess: (text) =>
          ImportMessage.CompletedReadCsv({
            name: file.name,
            rows: text.split("\n").filter(Boolean).length
          }),
        onFailure: () => ImportMessage.FailedReadCsv({ name: file.name })
      })
    )
)

// ---------------------------------------------------------------------------
// Choosing a file
// ---------------------------------------------------------------------------

// A `label` around a visually hidden file input is the "Choose file"
// button: the browser opens the picker itself, and the label names the input
// for assistive technology and for tests.
//
// `.value("")` makes the input report each choice once. The browser host
// sends the files in `change`, then empties the input, so choosing the same
// file again sends `change` again. A browser lets a file input's value only
// be emptied, so `""` is the one value to give it.
//
// Ctrl+O or Cmd+O, heard on the document, opens a picker with
// `HtmlFiles.pick`, which needs no input in the view. The browser opens a
// picker only during a user's action, and a Command issued from a key press
// runs within it. `opened` is `false` when it refused.
export const CsvImport = Component.define({
  name: "CsvImport",
  model: ImportModel,
  message: ImportMessage,
  elements: Html
}).make({
  init: () => ImportModel.Idle(),
  update: {
    ChoseFiles: ($, { files: [file] }) =>
      file === undefined
        ? $.model
        : $.set(ImportModel.Reading({ name: file.name })).run([
          ReadCsv.make({ file })
        ]),
    PressedOpen: ($) =>
      $.run([
        HtmlFiles.pick(({ files }) => ImportMessage.ChoseFiles({ files }), {
          accept: [".csv", "text/csv"]
        })
      ]),
    ClickedCancel: ($) =>
      $.model._tag === "Reading"
        ? $.set(ImportModel.Cancelled({ name: $.model.name })).run([
          Command.interrupt(ReadCsv)
        ])
        : $.model,
    CompletedReadCsv: (_, { name, rows }) =>
      ImportModel.Imported({ name, rows }),
    FailedReadCsv: (_, { name }) => ImportModel.Failed({ name })
  },
  view: (h, model) =>
    h.section([
      h.label.children([
        "Import a CSV file",
        h.input.attrs({ type: "file", accept: ".csv,text/csv" }).class([
          "visually-hidden"
        ]).value("")
          .onChange(({ files }) => ImportMessage.ChoseFiles({ files }))
      ]),
      ImportModel.match(model, {
        Idle: () => null,
        Reading: ({ name }) =>
          h.p([
            `Reading ${name}…`,
            h.button.onClick(ImportMessage.ClickedCancel()).children(["Cancel"])
          ]),
        Imported: ({ name, rows }) =>
          h.p([`Imported ${rows} rows from ${name}.`]),
        Cancelled: ({ name }) => h.p([`Cancelled importing ${name}.`]),
        Failed: ({ name }) =>
          h.p.attr("role", "alert").children([`Couldn't read ${name}.`])
      })
    ]),
  subscriptions: () => [
    HtmlSubscription.shortcuts([
      {
        key: "o",
        mod: true,
        message: ImportMessage.PressedOpen(),
        whileTyping: true
      }
    ])
  ]
})

// ---------------------------------------------------------------------------
// A story resolves the picker and the read
// ---------------------------------------------------------------------------

// `HtmlFiles.Pick` is the picker's Command, so a story resolves it with what
// the user chose, as it resolves `ReadCsv` with what the read sent.
export const pickedAndCancelled = Effect.gen(function*() {
  const file = new File(["id,name\n1,Ada\n"], "people.csv", {
    type: "text/csv"
  })
  const s = yield* Story.make(CsvImport, {})
  s.send(ImportMessage.PressedOpen())
    .resolve(HtmlFiles.Pick, { opened: true, files: [file] })
    .expectExact([ReadCsv.make({ file })])
    .send(ImportMessage.ClickedCancel())
  return [s.model._tag, s.interrupted.map((command) => command.name)] // ["Cancelled", ["import/ReadCsv"]]
})

// ---------------------------------------------------------------------------
// A scene chooses a file in the input
// ---------------------------------------------------------------------------

// `change` with `files` is the user choosing them in the file input.
export const choseInInput = Effect.gen(function*() {
  const file = new File(["id,name\n1,Ada\n2,Grace\n"], "people.csv", {
    type: "text/csv"
  })
  const s = yield* HtmlScene.make(CsvImport, {})
  s.change(HtmlLocator.label("Import a CSV file"), { files: [file] })
    .expect(Locator.text("Reading people.csv…")).toExist()
    .resolve(
      ReadCsv,
      ImportMessage.CompletedReadCsv({ name: "people.csv", rows: 3 })
    )
    .expect(Locator.text("Imported 3 rows from people.csv.")).toExist()
})
