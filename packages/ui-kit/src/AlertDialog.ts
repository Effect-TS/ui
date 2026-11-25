/**
 * A modal dialog that interrupts the user with something they must answer
 * before going on, such as confirming that a draft is discarded.
 *
 * `AlertDialog` is a function that declares a headless `Dialog` with three
 * things fixed: the dialog has `role="alertdialog"`, it always opens as a
 * modal, and a press outside the popup doesn't ask it to close. Everything
 * else is the `Dialog`'s: the parts, the events, focus, transitions and
 * nesting. The consumer owns whether it is open, passes it as `open`, and
 * stores what the `RequestedOpen` and `RequestedClose` events ask for.
 *
 * **Anatomy**
 *
 * | Part           | Element                                              |
 * | :------------- | :--------------------------------------------------- |
 * | `trigger`      | `<button>` that opens the alert dialog               |
 * | `portal`       | `<dialog>` in the top layer, around the parts below  |
 * | `backdrop`     | `<div>` that covers the page                         |
 * | `viewport`     | `<div>` that positions the popup                     |
 * | `popup`        | `<div>` with the alert dialog's content              |
 * | `title`        | a heading, `<h1>` to `<h6>`, that labels it          |
 * | `description`  | `<p>` that describes it                              |
 * | `close`        | `<button>` that closes it                            |
 * | `initialFocus` | any element, focused when it opens                   |
 * | `finalFocus`   | any element, focused when it closes                  |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children, as for a `Dialog`. The portal
 * returns `undefined` while the alert dialog is closed, unless
 * `keepMounted`. Give it a `title` and a `description`: the portal is
 * labelled by the one and described by the other, which a screen reader
 * announces as the alert dialog opens.
 *
 * **Data attributes**
 *
 * The same as a `Dialog`'s, each present with an empty value or absent:
 *
 * - `trigger`: `data-popup-open`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `viewport` and `popup`: the backdrop's, and `data-nested` and
 *   `data-nested-dialog-open`
 *
 * **Keyboard**
 *
 * The trigger and the close button are native buttons, so Enter and Space
 * press them. Escape asks the alert dialog to close, with `escape-key`.
 * Focus moves into the popup when it opens, stays inside while it shows, and
 * goes back to the trigger as soon as it starts closing, as in a modal
 * `Dialog`. Put `initialFocus` on the least destructive answer, such as
 * Cancel.
 *
 * **Dismissal**
 *
 * The alert dialog asks to close only from its trigger, its close part,
 * Escape and, on Android, the back gesture, with `close-watcher` as in a
 * `Dialog`. A press outside the popup, on the backdrop included, asks
 * nothing. Answers other than closing, such as Discard, are the consumer's
 * buttons, which send the consumer's messages.
 *
 * An alert dialog drawn inside a `Dialog`'s popup is nested in it, as a
 * `Dialog` would be: the outer popup gets `data-nested-dialog-open`, and only
 * the alert dialog hears Escape. A `DialogTrigger` opens one drawn
 * elsewhere, paired with it by its `id`. It renders a `Dialog` instance, so
 * an alert dialog and a dialog under one parent each take a `key`, and a
 * `Scene` of the consumer names it `Dialog`.
 *
 * **Example** (Confirming that a draft is discarded)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { AlertDialog } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = UiSchema.TaggedEnum({ RequestedOpenConfirm: {}, RequestedCloseConfirm: {}, ClickedDiscard: {} })
 *
 * const Editor = Html.component({
 *   name: "Editor",
 *   model: Schema.Struct({ confirming: Schema.Boolean }),
 *   message: EditorMessage
 * }).make({
 *   init: () => ({ confirming: true }),
 *   update: {
 *     RequestedOpenConfirm: ($) => $.evolve({ confirming: true }),
 *     RequestedCloseConfirm: ($) => $.evolve({ confirming: false }),
 *     ClickedDiscard: ($) => $.evolve({ confirming: false })
 *   },
 *   view: (h, model) =>
 *     AlertDialog(h, {
 *       props: { open: model.confirming },
 *       onEmit: {
 *         RequestedOpen: () => EditorMessage.RequestedOpenConfirm(),
 *         RequestedClose: () => EditorMessage.RequestedCloseConfirm(),
 *         Settled: () => undefined
 *       },
 *       view: (alertDialog) =>
 *         h.div(
 *           alertDialog.trigger(h.button).children("Discard draft"),
 *           alertDialog.portal(h.dialog)?.children(
 *             alertDialog.popup(h.div.class("popup")).children(
 *               alertDialog.title(h.h2).children("Discard draft?"),
 *               alertDialog.description(h.p).children("You can't undo this."),
 *               alertDialog.initialFocus(alertDialog.close(h.button)).children("Cancel"),
 *               h.button.on("click", EditorMessage.ClickedDiscard()).children("Discard")
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The portal is an alert dialog, labelled by its title.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * const title = /<h2 id="([^"]+)"/.exec(html)?.[1]
 * if (title === undefined || !/<dialog[^>]* role="alertdialog"/.test(html) || !html.includes(`aria-labelledby="${title}"`)) {
 *   throw new Error("the portal isn't an alert dialog labelled by its title")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import type * as View from "@effect/ui/View"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Struct from "effect/Struct"
import { Dialog, type DialogEvents, DialogProps } from "./Dialog.ts"

/**
 * Controls whether the alert dialog is open and where focus goes: a
 * `Dialog`'s props without `modal` and `disablePointerDismissal`, which an
 * alert dialog fixes, and without `topLayer`.
 *
 * **Details**
 *
 * - `open`: whether the alert dialog shows. Required: the consumer owns it.
 * - `triggerId`, `keepMounted`, `forceRenderBackdrop`, `initialFocus`,
 *   `finalFocus`, `id`, `openMethod` and `holdExit`: as for a `Dialog`.
 *
 * An alert dialog is always modal: it blocks the whole page until the user
 * answers, so it stays in the top layer, above everything it blocks. A
 * `Dialog` drawn in place with `topLayer: false` is for `modal: false`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AlertDialogProps = DialogProps.mapFields(
  Struct.omit(["modal", "disablePointerDismissal", "topLayer"])
)

/**
 * The props of an `AlertDialog`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AlertDialogProps = typeof AlertDialogProps.Type

/**
 * What an `AlertDialog`'s `view` gets: a `Dialog`'s parts and plain values.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AlertDialogParts = Component.Headless.Parts<typeof Dialog>

const alert = (node: View.ElementBuilder<any, any, any, any>) =>
  node.attr("role", "alertdialog")

/**
 * A headless alert dialog. Call it as a `Dialog`, with the consumer's `h`, a
 * `key` when it needs one, `props`, `onEmit` and a `view` closure that draws
 * the trigger with `alertDialog.trigger` and the alert dialog with `alertDialog.portal` and the
 * parts inside it.
 *
 * **Details**
 *
 * It declares a `Dialog` with `modal: true` and `disablePointerDismissal:
 * true`, so it emits the `Dialog`'s events. `RequestedClose` carries
 * `trigger-press`, `escape-key`, `close-press` or `close-watcher`, never
 * `outside-press` or `focus-out`.
 *
 * On top of the `Dialog`'s attributes, the portal's `role="alertdialog"` wins
 * over the consumer's, whether the consumer set it on the builder it passes
 * in or chained it after the part.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const AlertDialog = <Msg, RV = never, RF = never>(
  h: View.Helper<Msg, unknown>,
  options:
    & View.Child.Options<AlertDialogProps, DialogEvents, NoInfer<Msg>>
    & {
      /** Shown if the alert dialog fails, until its key changes. Without it, it is blank. */
      readonly fallback?:
        | ((
          result: AsyncResult.Failure<never, unknown>
        ) => View.Content<NoInfer<Msg>, RF>)
        | undefined
      /** The alert dialog's whole view, from its parts. */
      readonly view: (parts: AlertDialogParts) => View.Content<NoInfer<Msg>, RV>
    }
): ReturnType<typeof Dialog<Msg, RV, RF>> =>
  Dialog<Msg, RV, RF>(h, {
    ...options,
    props: {
      ...options.props,
      modal: true,
      disablePointerDismissal: true,
      topLayer: true
    },
    view: (dialog) =>
      options.view({
        ...dialog,
        portal: (element) => dialog.portal(element)?.forward(alert)
      })
  })
