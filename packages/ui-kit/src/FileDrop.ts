/**
 * A headless file drop zone and picker trigger with shared `accept` and
 * `multiple` filtering, drag-over state, and `Picked` / `Rejected` events.
 * Values stay controlled by the consumer: keep plain facts (names, sizes) in
 * your Model and pass `File` values to Commands.
 *
 * **Anatomy**
 *
 * | Part      | Element                                       |
 * | :-------- | :-------------------------------------------- |
 * | `root`    | any element, usually a `<div>` or `<section>` |
 * | `trigger` | `<button>` that opens the browser file picker |
 *
 * No part adds markup. Because `root` accepts any element, it can wrap
 * `trigger` or stack with it on a single `<button>`:
 * `fileDrop.root(fileDrop.trigger(field.control(h.button)))`.
 *
 * Always draw `trigger` for keyboard and screen-reader users: drag-and-drop
 * alone has no pointer-free equivalent.
 *
 * **Data attributes**
 *
 * Present with an empty value or absent:
 *
 * - `root`: `data-drag-over`, `data-disabled`
 * - `trigger`: `data-disabled`
 *
 * **Keyboard**
 *
 * `trigger` is a native `<button type="button">`, so Enter and Space open the
 * picker and Tab moves focus.
 *
 * **Batch rules**
 *
 * Drops and `HtmlFiles.pick` results share one classifier:
 *
 * 1. Empty batches (dismissed or blocked pickers, empty drops) emit nothing.
 * 2. When `multiple` is not `true` and more than one file arrives, the whole
 *    raw batch emits `Rejected` with `reason: "too-many-files"` before type
 *    filtering, and no `Picked`.
 * 3. Otherwise files are split by `accept`: matching files emit `Picked`, and
 *    non-matching files emit `Rejected` with `reason: "invalid-type"`. On a
 *    mixed batch, `Picked` emits first so clearing an error on `Picked` and
 *    setting it on `Rejected` shows the rejection.
 *
 * **With `Field`, `Fieldset` and `Form`**
 *
 * Compose `fileDrop.trigger(field.control(h.button))` with
 * `disabled: field.disabled` (or `fieldset.disabled`). The field's label,
 * `aria-describedby` and `aria-invalid` land on the button so `Form` focuses
 * it after an invalid submit; pass `disabled` through because `<fieldset disabled>`
 * does not block drops on a `<div>`. No hidden input is rendered because `Form`
 * submits strings only.
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
 *   matched without case: `.ext` suffix, `type/*` prefix, wildcard for any
 *   file, or exact `type/subtype` (ignoring `;...` parameters). Omitted or
 *   empty allows every file.
 * - `multiple`: allows more than one file per drop or pick (`false` by
 *   default).
 * - `disabled`: disables `trigger`, sets `data-disabled`, hides
 *   `data-drag-over` and ignores drags, drops and picks. `root` keeps its drop
 *   target so the browser does not open a dropped file in the tab.
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
  CompletedPick: { files: FileArray }
})

const dropTarget: Html.DropTargetOptions = {
  accepts: ["Files"],
  dropEffect: "copy",
  preventDefault: "always"
}

const mimeOf = (file: File): string =>
  file.type.split(";", 1)[0]!.trim().toLowerCase()

const matches = (name: string, mime: string, token: string): boolean => {
  if (token === "*/*") return true
  if (token.startsWith(".")) return name.endsWith(token)
  if (mime === "") return false
  if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1))
  return mime === token
}

const classify = (
  files: ReadonlyArray<File>,
  props: FileDropProps
): ReadonlyArray<FileDropEvents> => {
  if (files.length === 0 || props.disabled === true) return []
  if (props.multiple !== true && files.length > 1) {
    return [FileDropEvents.Rejected({ files, reason: "too-many-files" })]
  }
  const tokens = (props.accept ?? [])
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "")
  const allowed = (file: File): boolean => {
    const name = file.name.toLowerCase()
    const mime = mimeOf(file)
    return tokens.length === 0 ||
      tokens.some((token) => matches(name, mime, token))
  }
  const accepted = files.filter(allowed)
  const rejected = files.filter((file) => !allowed(file))
  return [
    ...(accepted.length > 0
      ? [FileDropEvents.Picked({ files: accepted })]
      : []),
    ...(rejected.length > 0
      ? [FileDropEvents.Rejected({ files: rejected, reason: "invalid-type" })]
      : [])
  ]
}

/**
 * A headless file drop zone and picker trigger.
 *
 * **Details**
 *
 * `parts` also exposes `dragOver` and `disabled` booleans. Own attributes win
 * over attributes set before the part: `data-drag-over` and `data-disabled` on
 * `root`; `type="button"`, `disabled`, `aria-disabled` (removed) and
 * `data-disabled` on `trigger`. History restore is off (`restore: false`).
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
    Left: ($) => $.evolve({ dragOver: false }),
    Dropped: ($, { files }) =>
      $.evolve({ dragOver: false }).emit(...classify(files, $.props)),
    ClickedTrigger: ($) =>
      $.props.disabled === true
        ? $.model
        : $.run(
          HtmlFiles.pick(
            ({ opened, files }) =>
              FileDropMessage.CompletedPick({ files: opened ? files : [] }),
            {
              accept: $.props.accept,
              multiple: $.props.multiple
            }
          )
        ),
    CompletedPick: ($, { files }) => $.emit(...classify(files, $.props))
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
            dropTarget
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
          .on("click", FileDropMessage.ClickedTrigger()))
    }
  }
})
