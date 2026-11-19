import { Command, Component, Head, UiSchema } from "@effect/ui"
import { Duration, Effect, Schema } from "effect"

// MODEL

export const UploadStatus = Schema.Literals(["Uploading", "Done", "Cancelled"])
export type UploadStatus = typeof UploadStatus.Type

export const Upload = Schema.Struct({
  id: Schema.Number,
  fileName: Schema.String,
  sizeMegabytes: Schema.Number,
  status: UploadStatus
})
export type Upload = typeof Upload.Type

export const UploadsModel = Schema.Struct({
  uploadId: Schema.Number,
  uploads: Schema.Array(Upload)
})
export type UploadsModel = typeof UploadsModel.Type

const isUploading = (upload: Upload): boolean => upload.status === "Uploading"

const withStatus = (model: UploadsModel, uploadId: number, status: UploadStatus): UploadsModel => ({
  ...model,
  uploads: model.uploads.map((upload) => upload.id === uploadId ? { ...upload, status } : upload)
})

// MESSAGE

// An interrupt sends no message, so there is nothing like Foldkit's
// `CompletedCancelUploadFile`: a cancel is marked in the Model by the click.
export const UploadsMessage = UiSchema.TaggedEnum({
  ClickedStartUpload: {},
  ClickedCancelUpload: { uploadId: Schema.Number },
  ClickedCancelAllUploads: {},
  ClickedRestartUpload: { uploadId: Schema.Number },
  CompletedUploadFile: { uploadId: Schema.Number }
})

// FAKE FILES

export interface FakeFile {
  readonly name: string
  readonly sizeMegabytes: number
}

export const FAKE_FILES: ReadonlyArray<FakeFile> = [
  { name: "vacation-photos.zip", sizeMegabytes: 48 },
  { name: "demo-recording.mp4", sizeMegabytes: 87 },
  { name: "quarterly-report.pdf", sizeMegabytes: 12 },
  { name: "design-assets.sketch", sizeMegabytes: 34 },
  { name: "database-backup.sql", sizeMegabytes: 61 }
]

// COMMAND

const MILLISECONDS_PER_MEGABYTE = 100

// Uploading is I/O, so it is a `Command.Service`: a real app swaps the fake
// body for one that captures an HTTP client, and a test can provide a fake.
// Each upload is its own group, so cancelling one leaves the others running.
// With `switch`, a restarted upload starts once its cancelled run has exited,
// and Story and Scene steps can send messages while an upload is pending.
export class UploadFile extends Command.Service<UploadFile>()(
  "uploads/UploadFile",
  {
    args: { uploadId: Schema.Number, sizeMegabytes: Schema.Number },
    group: ["uploadId"],
    mode: "switch"
  },
  Effect.succeed(({ uploadId, sizeMegabytes }) =>
    Effect.gen(function*() {
      yield* Effect.sleep(Duration.millis(sizeMegabytes * MILLISECONDS_PER_MEGABYTE))
      return UploadsMessage.CompletedUploadFile({ uploadId })
    })
  )
) {}

const uploadFile = (upload: Upload) => UploadFile.make({ uploadId: upload.id, sizeMegabytes: upload.sizeMegabytes })

// VIEW

const BADGE_CLASS: Record<UploadStatus, string> = {
  Uploading: "bg-blue-100 text-blue-700",
  Done: "bg-green-100 text-green-700",
  Cancelled: "bg-gray-200 text-gray-600"
}

const ACTION_BUTTON_CLASS = "px-3 py-1 text-sm font-medium rounded-md border transition"

const UploadsDef = Component.define({
  name: "Uploads",
  model: UploadsModel,
  message: UploadsMessage
})

const UploadAction = UploadsDef.fragment((h, upload: Upload) => {
  switch (upload.status) {
    case "Uploading":
      return h.button.key("Uploading")
        .onClick(UploadsMessage.ClickedCancelUpload({ uploadId: upload.id }))
        .attr("aria-label", `Cancel upload ${upload.id}`)
        .class(ACTION_BUTTON_CLASS, "border-red-300 text-red-600 hover:bg-red-50")
        .children("Cancel")
    case "Cancelled":
      return h.button.key("Cancelled")
        .onClick(UploadsMessage.ClickedRestartUpload({ uploadId: upload.id }))
        .attr("aria-label", `Restart upload ${upload.id}`)
        .class(ACTION_BUTTON_CLASS, "border-blue-300 text-blue-600 hover:bg-blue-50")
        .children("Restart")
    case "Done":
      return null
  }
})

const UploadRow = UploadsDef.fragment((h, upload: Upload) =>
  h.li.key(String(upload.id)).class("p-4 bg-white rounded-lg shadow flex flex-col gap-2").children(
    h.div.class("flex items-center justify-between gap-3").children(
      h.div.class("flex items-baseline gap-2 min-w-0").children(
        h.span.class("font-medium text-gray-800 truncate").children(upload.fileName),
        h.span.class("text-sm text-gray-500 shrink-0").children(`${upload.sizeMegabytes} MB`)
      ),
      h.div.class("flex items-center gap-3 shrink-0").children(
        h.span.class("px-2 py-0.5 text-xs font-semibold rounded-full", BADGE_CLASS[upload.status])
          .children(upload.status),
        UploadAction(h, upload)
      )
    ),
    isUploading(upload) && h.div.class("h-1.5 rounded-full bg-blue-400 animate-pulse")
  )
)

// COMPONENT

// The component as defined, which requires `UploadFile`, for a test that
// provides its own Layers.
export const UploadsNoDeps = UploadsDef.make({
  init: () => ({ uploadId: 0, uploads: [] }),
  update: {
    ClickedStartUpload: (model, _message, $) => {
      const file = FAKE_FILES[model.uploadId % FAKE_FILES.length]
      const upload: Upload = {
        id: model.uploadId,
        fileName: file.name,
        sizeMegabytes: file.sizeMegabytes,
        status: "Uploading"
      }
      return $.set({ uploadId: model.uploadId + 1, uploads: [...model.uploads, upload] }).run(uploadFile(upload))
    },

    // Once `update` interrupts a run, the run delivers nothing, so marking the
    // upload cancelled here can't be undone by a late `CompletedUploadFile`.
    // A finished or cancelled upload has no run to interrupt.
    ClickedCancelUpload: (model, { uploadId }, $) =>
      model.uploads.some((upload) => upload.id === uploadId && isUploading(upload))
        ? $.set(withStatus(model, uploadId, "Cancelled")).run(Command.interrupt(UploadFile, { uploadId }))
        : model,

    // With no group, the interrupt stops every run of `UploadFile`.
    ClickedCancelAllUploads: (model, _message, $) =>
      $.set({
        ...model,
        uploads: model.uploads.map((upload) => isUploading(upload) ? { ...upload, status: "Cancelled" } : upload)
      }).run(Command.interrupt(UploadFile)),

    ClickedRestartUpload: (model, { uploadId }, $) => {
      const upload = model.uploads.find((upload) => upload.id === uploadId && upload.status === "Cancelled")
      return upload === undefined
        ? model
        : $.set(withStatus(model, uploadId, "Uploading")).run(uploadFile(upload))
    },

    CompletedUploadFile: (model, { uploadId }) => withStatus(model, uploadId, "Done")
  },
  head: () => [Head.title("Effect UI Interrupting Commands Example")],
  view: (model, h) =>
    h.div.class("min-h-screen bg-gray-100 py-8").children(
      h.div.class("max-w-lg mx-auto flex flex-col gap-6 px-4").children(
        h.h1.class("text-3xl font-bold text-gray-800 text-center").children("File Uploads"),
        h.div.class("flex justify-center gap-3").children(
          h.button.onClick(UploadsMessage.ClickedStartUpload())
            .class("px-4 py-2 rounded-md bg-blue-500 text-white font-medium hover:bg-blue-600 transition")
            .children("Upload a file"),
          model.uploads.some(isUploading) &&
            h.button.onClick(UploadsMessage.ClickedCancelAllUploads())
              .class("px-4 py-2 rounded-md border border-red-300 text-red-600 font-medium hover:bg-red-50 transition")
              .children("Cancel all")
        ),
        model.uploads.length === 0
          ? h.p.class("text-center text-gray-500").children("Nothing here yet. Start an upload.")
          : h.ul.class("flex flex-col gap-3").children(
            model.uploads.map((upload) => UploadRow(h, upload))
          )
      )
    )
})

// The component the app and its tests use, with `UploadFile`'s Layer provided.
export const Uploads = UploadsNoDeps.pipe(Component.provide(UploadFile.layer))
