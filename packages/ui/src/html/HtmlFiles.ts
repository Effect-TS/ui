/**
 * Files the user chooses: a Command that opens the browser's file picker,
 * and reads of a `File` or `Blob` that stop when they're interrupted.
 *
 * **Details**
 *
 * A file input the view renders reports its files in `Html.InputPayload`.
 * `pick` opens a picker without one, such as from a menu item or a keyboard
 * shortcut. Either way, send a `File` on to a Command whose args type it with
 * `Schema.instanceOf(File)`, and read it there with `readAsText`,
 * `readAsBytes` or `readAsDataUrl`. Interrupting that Command, with
 * `Command.interrupt`, a `"switch"` run or the component unmounting, cancels
 * the read, so the browser stops reading the file rather than reading it all
 * and dropping the result.
 *
 * **Example** (Previewing a text file, with a cancel button)
 *
 * ```ts
 * import { Command, UiSchema } from "@effect/ui"
 * import { HtmlFiles } from "@effect/ui/html"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   ChoseFile: { file: Schema.instanceOf(File) },
 *   ClickedCancel: {},
 *   ReadPreview: { text: Schema.String },
 *   FailedPreview: {}
 * })
 *
 * const ReadPreview = Command.make(
 *   "ReadPreview",
 *   { args: { file: Schema.instanceOf(File) }, mode: "switch" },
 *   ({ file }) =>
 *     HtmlFiles.readAsText(file.slice(0, 4096)).pipe(
 *       Effect.match({
 *         onSuccess: (text) => Message.ReadPreview({ text }),
 *         onFailure: () => Message.FailedPreview()
 *       })
 *     )
 * )
 *
 * // In `update`: ChoseFile runs `ReadPreview.make({ file })`, and ClickedCancel
 * // runs `Command.interrupt(ReadPreview)`.
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Base64 from "effect/encoding/Base64"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Command from "../Command.ts"
import * as files from "./internal/files.ts"

/**
 * A read of a `Blob` failed, such as for a file deleted or changed after the
 * user chose it. `cause` is the browser's error.
 *
 * @stability experimental
 * @category errors
 * @since 0.1.0
 */
export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly cause: unknown
}> {}

/**
 * Reads all of `blob`'s bytes. Interrupting it cancels the read.
 *
 * **Details**
 *
 * It reads `blob.stream()`, so it runs wherever `Blob` does, Node and
 * workers included. Read part of a large file with `blob.slice`.
 *
 * @stability experimental
 * @category reading
 * @since 0.1.0
 */
export const readAsBytes = (
  blob: Blob
): Effect.Effect<Uint8Array, FileReadError> =>
  Stream.mkUint8Array(bytesOf(blob))

const bytesOf = (blob: Blob): Stream.Stream<Uint8Array, FileReadError> =>
  Stream.fromReadableStream({
    evaluate: () => blob.stream(),
    onError: (cause) => new FileReadError({ cause })
  })

/**
 * Reads `blob` as text in `encoding`, UTF-8 by default, as `TextDecoder`
 * decodes it. Interrupting it cancels the read.
 *
 * @stability experimental
 * @category reading
 * @since 0.1.0
 */
export const readAsText = (
  blob: Blob,
  encoding?: string
): Effect.Effect<string, FileReadError> =>
  bytesOf(blob).pipe(Stream.decodeText({ encoding }), Stream.mkString)

/**
 * Reads `blob` as a `data:` URL with its type and base64 content, as
 * `FileReader.readAsDataURL` does. Interrupting it cancels the read.
 *
 * **Details**
 *
 * The URL holds the whole content, so it costs a third more than the file
 * wherever it goes, the Model and the message log included. For a large
 * image, prefer `URL.createObjectURL`, revoked once the image isn't shown.
 *
 * @stability experimental
 * @category reading
 * @since 0.1.0
 */
export const readAsDataUrl = (
  blob: Blob
): Effect.Effect<string, FileReadError> =>
  Effect.map(
    readAsBytes(blob),
    (bytes) =>
      `data:${
        blob.type === "" ? "application/octet-stream" : blob.type
      };base64,${Base64.encode(bytes)}`
  )

/**
 * What a file picker shows and allows, as the file input attributes of the
 * same names: the file types it offers, such as `".pdf"` or `"image/*"`,
 * whether the user can choose more than one file, and the camera a phone
 * opens to capture a new one.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PickOptions {
  readonly accept?: ReadonlyArray<string> | undefined
  readonly multiple?: boolean | undefined
  readonly capture?: "user" | "environment" | undefined
}

/**
 * What `pick` reports: whether the browser opened the picker, and the files
 * the user chose, none when they dismissed it.
 *
 * **Details**
 *
 * The browser refuses to open a picker, giving `opened: false`, outside a
 * user's action. A Command issued from a click or key press runs within it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Picked {
  readonly opened: boolean
  readonly files: ReadonlyArray<File>
}

/**
 * Opens the browser's file picker.
 *
 * **Details**
 *
 * `pick` settles when the user chooses files or dismisses the picker. A
 * browser that doesn't report a dismissal leaves it pending, so let the user
 * move on without it. Interrupting it stops waiting, and the picker stays open
 * until the user closes it. `BrowserHost.layer` provides one that opens a
 * detached file input of its document. The default never settles, so on a
 * host without a document a pick stays pending. A test settles picks with
 * `TestFiles` from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface Files {
  readonly pick: (options: PickOptions) => Effect.Effect<Picked>
}

/**
 * The file picker. It defaults to one whose picks never settle.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const Files: Context.Reference<Files> = files.Files

/**
 * The Command behind `pick`, for a story's `.resolve(HtmlFiles.Pick, { opened, files })`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Pick: Command.Factory<PickOptions, Picked> = Command.make(
  "HtmlFiles.pick",
  {
    args: {
      accept: Schema.optional(Schema.Array(Schema.String)),
      multiple: Schema.optional(Schema.Boolean),
      capture: Schema.optional(Schema.Literals(["user", "environment"]))
    }
  },
  (options) => Files.use((files) => files.pick(options))
)

/**
 * Opens the browser's file picker and sends `f`'s message with the files the
 * user chose, or none when they dismissed it.
 *
 * **When to use**
 *
 * Use to open a picker from something other than a file input, such as a
 * menu item or a keyboard shortcut. A visible "Choose file" control is better
 * as a `label` for a file input, which the browser opens itself.
 *
 * **Details**
 *
 * See `Picked` for when the browser refuses to open it, and `Files` for
 * when it settles.
 *
 * **Example** (Opening a picker from a keyboard shortcut)
 *
 * ```ts
 * import { UiSchema } from "@effect/ui"
 * import { HtmlFiles } from "@effect/ui/html"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   PressedOpen: {},
 *   PickedImages: { files: Schema.Array(Schema.instanceOf(File)) }
 * })
 *
 * const command = HtmlFiles.pick(
 *   ({ files }) => Message.PickedImages({ files }),
 *   { accept: ["image/*"], multiple: true }
 * )
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const pick = <Msg>(
  f: (picked: Picked) => Msg,
  options: PickOptions = {}
): Command.Mapped<Command.Issued<Picked, never, Picked, "Effect">, Msg> =>
  Command.map(Pick.make(options), f)
