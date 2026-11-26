/**
 * A file drop zone and picker trigger that share `accept` and `multiple`
 * rules, manage drag-over state, and emit accepted and rejected file batches.
 *
 * `FileDrop` is a headless component: it keeps drag-over state and runs
 * `HtmlFiles.pick`. Values stay controlled by the consumer: keep plain facts
 * (such as names and sizes) in your Model and pass `File` values to Commands.
 *
 * **Anatomy**
 *
 * | Part      | Element                                        |
 * | :-------- | :--------------------------------------------- |
 * | `root`    | any element, usually a `<div>` or `<section>`  |
 * | `trigger` | `<button>` that opens the browser file picker  |
 *
 * Each part takes the consumer's builder and returns it, so the consumer goes
 * on chaining and adds children with `.children(...)`. No part adds markup.
 * Because `root` accepts any element, it can wrap `trigger` as a separate
 * container or stack with it on a single `<button>`:
 * `fileDrop.root(fileDrop.trigger(field.control(h.button)))`.
 *
 * Draw `trigger` for keyboard and screen-reader users: drag-and-drop alone has
 * no pointer-free equivalent.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent:
 *
 * - `root`: `data-drag-over`, `data-disabled`
 * - `trigger`: `data-disabled`
 *
 * **Keyboard**
 *
 * `trigger` is a native `<button type="button">`, so Enter and Space open the
 * file picker and Tab moves focus without a key handler.
 *
 * **Batch classification**
 *
 * Dropped files and files returned by `HtmlFiles.pick` go through the same
 * classifier:
 *
 * 1. Empty batches (dismissed or blocked pickers, empty drops) emit nothing.
 * 2. When `multiple` is not `true` and more than one file arrives, the whole
 *    raw batch is emitted as `Rejected` with `reason: "too-many-files"` before
 *    type filtering, and no `Picked` is emitted.
 * 3. Otherwise files are split by `accept`: matching files are emitted in
 *    `Picked`, and non-matching files in `Rejected` with
 *    `reason: "invalid-type"`. When both are present, `Picked` is emitted
 *    first so clearing an error on `Picked` and setting it on `Rejected` shows
 *    the rejection.
 *
 * **With `Field`, `Fieldset` and `Form`**
 *
 * Compose `trigger` with `field.control` and forward `disabled`:
 * `fileDrop.trigger(field.control(h.button))` with `disabled: field.disabled`
 * (or `disabled: fieldset.disabled` when used directly in a `Fieldset`). The
 * field's label, `aria-describedby` and `aria-invalid` land on the button, so
 * `Form` focuses it after an invalid submit. Unlike a `<button>`, the browser
 * does not natively block drops on a `<div>` inside `<fieldset disabled>`, so
 * always pass `disabled` through. No hidden input is rendered because
 * `Form`'s `Submitted` payload carries strings only.
 *
 * **Example** (A labelled image drop zone inside a `Field`)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, FileDrop } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   PickedImages: { names: Schema.Array(Schema.String) },
 *   RejectedImages: { reason: Schema.String }
 * })
 *
 * const Upload = Html.component({
 *   name: "Upload",
 *   model: Schema.Struct({ names: Schema.Array(Schema.String), error: Schema.NullOr(Schema.String) }),
 *   message: Message
 * }).make({
 *   init: () => ({ names: [], error: null }),
 *   update: {
 *     PickedImages: ($, { names }) => ({ names: [...$.model.names, ...names], error: null }),
 *     RejectedImages: ($, { reason }) => $.evolve({ error: reason })
 *   },
 *   view: (h, model) =>
 *     Field(h, {
 *       props: { invalid: model.error !== null },
 *       view: (field) =>
 *         FileDrop(h, {
 *           props: { accept: ["image/*"], multiple: true, disabled: field.disabled },
 *           onEmit: {
 *             Picked: ({ files }) => Message.PickedImages({ names: files.map((file) => file.name) }),
 *             Rejected: ({ reason }) => Message.RejectedImages({ reason })
 *           },
 *           view: (fileDrop) =>
 *             field.root(h.div).children(
 *               field.label(h.label).children("Photos"),
 *               fileDrop.root(h.div.class("dropzone")).children(
 *                 fileDrop.trigger(field.control(h.button)).children("Choose photos")
 *               ),
 *               field.error(h.div)?.children(model.error ?? "")
 *             )
 *         })
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Upload, {}))
 * if (!/<button[^>]* type="button"[^>]*>Choose photos<\/button>/.test(html)) {
 *   throw new Error("the file drop trigger wasn't rendered as a button")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Html from "@effect/ui/html/Html"
import * as HtmlFiles from "@effect/ui/html/HtmlFiles"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { flag } from "./internal/attributes.ts"

/**
 * Props for a `FileDrop`.
 *
 * **Details**
 *
 * - `accept`: file types allowed for drops and passed to `HtmlFiles.pick`,
 *   matching HTML `<input type="file" accept>` tokens: `.ext` (case-insensitive
 *   filename suffix), `type/*` (case-insensitive MIME prefix), a wildcard for
 *   any file, or `type/subtype` (case-insensitive exact MIME, ignoring
 *   parameters after `;`). Omitted or empty allows every file.
 * - `multiple`: whether more than one file may be dropped or picked at once.
 *   `false` by default.
 * - `disabled`: disables `trigger` natively, sets `data-disabled` on both
 *   parts, hides `data-drag-over` and ignores drags, drops and pick results.
 *   `root` keeps its drop target while disabled so the browser does not open a
 *   dropped file in the tab.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const FileDropProps = Schema.Struct({
  accept: Schema.optional(Schema.Array(Schema.String)),
  multiple: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `FileDrop`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FileDropProps = typeof FileDropProps.Type

/**
 * Why `FileDrop` rejected a file batch.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const FileDropRejectReason = Schema.Literals([
  "too-many-files",
  "invalid-type"
])

/**
 * Why `FileDrop` rejected a file batch.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FileDropRejectReason = typeof FileDropRejectReason.Type

const FileSchema = Schema.declare(
  (u): u is File => typeof File === "function" && u instanceof File,
  { expected: "File" }
)

const FileArray = Schema.Array(FileSchema)

/**
 * Events a `FileDrop` emits: `Picked` for accepted files and `Rejected` for
 * files rejected for count or type.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const FileDropEvents = UiSchema.TaggedEnum({
  Picked: { files: FileArray },
  Rejected: {
    files: FileArray,
    reason: FileDropRejectReason
  }
})

/**
 * What a `FileDrop` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FileDropEvents = typeof FileDropEvents.Type

const FileDropModel = Schema.Struct({
  dragOver: Schema.Boolean
})

const FileDropMessage = UiSchema.TaggedEnum({
  Entered: {},
  Left: {},
  Dropped: { files: FileArray },
  ClickedTrigger: {},
  PickedFiles: {
    opened: Schema.Boolean,
    files: FileArray
  }
})

const dropTargetOptions: Html.DropTargetOptions = {
  accepts: ["Files"],
  dropEffect: "copy",
  preventDefault: "always"
}

const normalizeMime = (mime: string): string =>
  mime.split(";", 1)[0]!.trim().toLowerCase()

const matchesToken = (file: File, token: string): boolean => {
  if (token === "*/*") return true
  if (token.startsWith(".")) return file.name.toLowerCase().endsWith(token)
  const mime = normalizeMime(file.type)
  if (mime === "") return false
  if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1))
  return mime === token
}

const matchesAccept = (
  file: File,
  accept: ReadonlyArray<string> | undefined
): boolean => {
  if (accept === undefined || accept.length === 0) return true
  const tokens = accept
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "")
  if (tokens.length === 0) return true
  return tokens.some((token) => matchesToken(file, token))
}

const classify = (
  files: ReadonlyArray<File>,
  props: FileDropProps
): ReadonlyArray<FileDropEvents> => {
  if (files.length === 0) return []
  if (props.multiple !== true && files.length > 1) {
    return [FileDropEvents.Rejected({ files, reason: "too-many-files" })]
  }
  const accepted: Array<File> = []
  const rejected: Array<File> = []
  for (const file of files) {
    if (matchesAccept(file, props.accept)) accepted.push(file)
    else rejected.push(file)
  }
  const events: Array<FileDropEvents> = []
  if (accepted.length > 0) {
    events.push(FileDropEvents.Picked({ files: accepted }))
  }
  if (rejected.length > 0) {
    events.push(
      FileDropEvents.Rejected({ files: rejected, reason: "invalid-type" })
    )
  }
  return events
}

const pickOptionsOf = (props: FileDropProps): HtmlFiles.PickOptions => ({
  ...(props.accept !== undefined ? { accept: props.accept } : {}),
  ...(props.multiple !== undefined ? { multiple: props.multiple } : {})
})

/**
 * A headless file drop zone and picker trigger. Call it with the consumer's
 * `h`, `props`, `onEmit`, and a `view` closure that draws `root` and `trigger`.
 *
 * **Details**
 *
 * The parts also return `dragOver` and `disabled` as booleans for conditional
 * markup.
 *
 * Each part's own attributes win over those set on the builder before the
 * part, including those a state leaves absent:
 *
 * - `root`: `data-drag-over`, `data-disabled`
 * - `trigger`: `type="button"`, `disabled`, `aria-disabled` (always removed,
 *   since native `disabled` reports it), `data-disabled`
 *
 * History restore is off (`restore: false`), since drag-over is transient DOM
 * state.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const FileDrop = Html.component({
  name: "FileDrop",
  props: FileDropProps,
  model: FileDropModel,
  message: FileDropMessage,
  events: FileDropEvents,
  restore: false
}).make({
  init: () => ({ dragOver: false }),
  update: {
    Entered: ($) =>
      $.props.disabled === true ? $.model : $.evolve({ dragOver: true }),
    // Always clear dragOver so a leave while disabled cannot restore stale
    // drag-over state if the component is re-enabled.
    Left: ($) => $.evolve({ dragOver: false }),
    Dropped: ($, { files }) => {
      const next = $.evolve({ dragOver: false })
      if ($.props.disabled === true) return next
      return classify(files, $.props).reduce(
        (step, event) => step.emit(event),
        next
      )
    },
    ClickedTrigger: ($) =>
      $.props.disabled === true
        ? $.model
        : $.run(
          HtmlFiles.pick(
            ({ opened, files }) =>
              FileDropMessage.PickedFiles({ opened, files }),
            pickOptionsOf($.props)
          )
        ),
    PickedFiles: ($, { opened, files }) =>
      !opened || $.props.disabled === true
        ? $.model
        : classify(files, $.props).reduce(
          (step, event) => step.emit(event),
          $.set($.model)
        )
  },
  parts: (p, model) => {
    const disabled = p.props.disabled === true
    const dragOver = model.dragOver && !disabled
    return {
      dragOver,
      disabled,
      root: p.part((b) =>
        b
          .attrs({
            "data-drag-over": flag(dragOver),
            "data-disabled": flag(disabled)
          })
          .on("dragenter", FileDropMessage.Entered())
          .on("dragleave", FileDropMessage.Left())
          .on(
            "drop",
            (payload) =>
              FileDropMessage.Dropped({
                files: (payload as Html.DropPayload).files
              }),
            dropTargetOptions
          )
      ),
      trigger: p.part("button", (b) =>
        b
          .attrs({
            type: "button",
            "aria-disabled": undefined,
            "data-disabled": flag(disabled)
          })
          .disabled(disabled)
          .on("click", FileDropMessage.ClickedTrigger())
      )
    }
  }
})
