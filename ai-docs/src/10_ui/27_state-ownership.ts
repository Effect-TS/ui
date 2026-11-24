/**
 * @title Who owns the state
 *
 * Compare a controlled modal, a workflow started by mounting it, and a provider
 * that owns visibility. Contrast an initial prop with a live prop and see
 * how competing routes for the same value or request can still compile.
 */
// "Guaranteed" in a comment means the types or the runtime hold it whatever
// you write. "Convention" means this file's choice, which the API doesn't
// enforce.
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

// ---------------------------------------------------------------------------
// A controlled dialog: the caller decides `open`, and closing is a request
// ---------------------------------------------------------------------------
const ConfirmDialogMessage = UiSchema.TaggedEnum({
  CancelledDialog: {},
  ClosedDialog: {},
  ClickedConfirm: {}
})
export const ConfirmDialogEvents = UiSchema.TaggedEnum({
  RequestedClose: {},
  Confirmed: {}
})

export const ConfirmDialog = Html.component({
  name: "ConfirmDialog",
  props: Schema.Struct({ open: Schema.Boolean }),

  // Convention: no copy of `open` in the Model, so the prop is the one source.
  model: Schema.Null,

  message: ConfirmDialogMessage,
  events: ConfirmDialogEvents
}).make({
  init: () => null,
  update: ($, message) =>
    ConfirmDialogMessage.match(message, {
      CancelledDialog: () => $.emit(ConfirmDialogEvents.RequestedClose()),
      // A close while `open` is still true is the browser's. One after the
      // caller set `open` to false only confirms the caller's decision.
      ClosedDialog: () =>
        $.props.open ? $.emit(ConfirmDialogEvents.RequestedClose()) : $.model,
      ClickedConfirm: () => $.emit(ConfirmDialogEvents.Confirmed())
    }),
  view: (h) =>
    h.dialog.attr("aria-label", "Confirm").modal(h.props.open)
      .onCancel(ConfirmDialogMessage.CancelledDialog())
      .onClose(ConfirmDialogMessage.ClosedDialog())
      .children(
        h.button.onClick(ConfirmDialogMessage.ClickedConfirm()).children(
          "Confirm"
        )
      )
})

// ---------------------------------------------------------------------------
// A parent opening a child modal: the parent decides `open`
// ---------------------------------------------------------------------------
const PageMessage = UiSchema.TaggedEnum({
  ClickedDelete: {},
  RequestedCloseConfirm: {},
  ConfirmedDelete: {}
})

export const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ confirming: Schema.Boolean, deleted: Schema.Boolean }),
  message: PageMessage
}).make({
  init: () => ({ confirming: false, deleted: false }),
  update: ($, message) =>
    PageMessage.match(message, {
      ClickedDelete: () => $.evolve({ confirming: true }),
      // The page decides: returning `model` here refuses the dismissal.
      RequestedCloseConfirm: () => $.evolve({ confirming: false }),
      ConfirmedDelete: () => ({ confirming: false, deleted: true })
    }),
  view: (h, model) =>
    h.div(
      h.button.onClick(PageMessage.ClickedDelete()).children("Delete"),
      model.deleted && h.p.children("Deleted"),
      ConfirmDialog(h, {
        props: { open: model.confirming },
        // Guaranteed: the record needs a handler for every event, so a third
        // event on ConfirmDialog is a type error here until it has one.
        onEmit: {
          RequestedClose: () => PageMessage.RequestedCloseConfirm(),
          Confirmed: () => PageMessage.ConfirmedDelete()
        }
      })
    )
})

// ---------------------------------------------------------------------------
// A child owning an encapsulated workflow, which the parent only starts
// ---------------------------------------------------------------------------
const WizardMessage = UiSchema.TaggedEnum({
  ClickedNext: {},
  ClickedCancel: {},
  ClosedDialog: {}
})
export const WizardEvents = UiSchema.TaggedEnum({ Finished: {}, Cancelled: {} })

export const Wizard = Html.component({
  name: "Wizard",

  // `steps` is the caller's to decide, so it is a prop.
  props: Schema.Struct({ steps: Schema.Number }),

  // Convention: no `step` prop, because nobody outside decides it. The
  // parent hears the outcome through `events`.
  model: Schema.Struct({ step: Schema.Number }),

  message: WizardMessage,
  events: WizardEvents
}).make({
  // Guaranteed: a child that unmounts loses its Model, so each mount starts
  // the workflow over.
  init: () => ({ step: 0 }),
  update: ($, message) =>
    WizardMessage.match(message, {
      // Guaranteed: `$.props` is the props as of this message, not as of
      // mount. A prop change by itself dispatches nothing.
      ClickedNext: () =>
        $.model.step + 1 < $.props.steps
          ? { step: $.model.step + 1 }
          : $.emit(WizardEvents.Finished()),
      ClickedCancel: () => $.emit(WizardEvents.Cancelled()),
      // The wizard is always open while mounted, so a forced close cancels it.
      ClosedDialog: () => $.emit(WizardEvents.Cancelled())
    }),
  view: (h, model) =>
    h.dialog.attr("aria-label", "Import").modal(true)
      .onCancel(WizardMessage.ClickedCancel())
      .onClose(WizardMessage.ClosedDialog())
      .children(
        h.p.children(`Step ${model.step + 1} of ${h.props.steps}`),
        h.button.onClick(WizardMessage.ClickedNext()).children("Next")
      )
})

const HostMessage = UiSchema.TaggedEnum({
  ClickedImport: {},
  FinishedImport: {},
  CancelledImport: {}
})

export const Host = Html.component({
  name: "Host",
  model: Schema.Struct({ importing: Schema.Boolean, imported: Schema.Number }),
  message: HostMessage
}).make({
  init: () => ({ importing: false, imported: 0 }),
  update: ($, message) =>
    HostMessage.match(message, {
      // The host decides whether the wizard is mounted, not which step it's on.
      ClickedImport: () => $.evolve({ importing: true }),
      FinishedImport: () => ({
        importing: false,
        imported: $.model.imported + 1
      }),
      CancelledImport: () => $.evolve({ importing: false })
    }),
  view: (h, model) =>
    h.div(
      h.button.onClick(HostMessage.ClickedImport()).children("Import"),
      h.p.children(`Imported ${model.imported}`),
      model.importing && Wizard(h, {
        props: { steps: 3 },
        onEmit: {
          Finished: () => HostMessage.FinishedImport(),
          Cancelled: () => HostMessage.CancelledImport()
        }
      })
    )
})

// ---------------------------------------------------------------------------
// A provider owning visibility. Descendants send it occurrences, and a reader
// passes `open` on to the controlled dialog as a prop.
// ---------------------------------------------------------------------------
const ModalProviderMessage = UiSchema.TaggedEnum({
  RequestedOpen: {},
  RequestedClose: {}
})

// The provider is the one writer of `open`. Descendants read it without
// owning it. `restore: false` starts it from `init` after Back or a reload,
// so the modal starts closed.
export const ModalProvider = Html.component({
  name: "ModalProvider",
  model: Schema.Struct({ open: Schema.Boolean }),
  message: ModalProviderMessage,

  shares: {
    value: (model) => ({ open: model.open }),
    receives: ["RequestedOpen", "RequestedClose"]
  },

  restore: false
}).make({
  init: () => ({ open: false }),
  update: (_, message) =>
    ModalProviderMessage.match(message, {
      RequestedOpen: () => ({ open: true }),
      RequestedClose: () => ({ open: false })
    }),
  // Only `Around`, at the end of this file, reads these parts. Without it,
  // `parts` can be left out.
  parts: (_, model) => ({ open: model.open })
})

const OpenButtonMessage = UiSchema.TaggedEnum({ ClickedOpen: {} })

// Guaranteed: a sender needs no `reads` entry. The send puts the owner in
// this component's requirements, which only the owner's `view` closure
// removes.
export const OpenButton = Html.component({
  name: "OpenButton",
  model: Schema.Null,
  message: OpenButtonMessage
}).make({
  init: () => null,
  update: ($, message) =>
    OpenButtonMessage.match(message, {
      ClickedOpen: () =>
        $.send(ModalProvider, ModalProviderMessage.RequestedOpen())
    }),
  view: (h) =>
    h.button.onClick(OpenButtonMessage.ClickedOpen()).children("Open")
})

// Two events, two messages; they share the handler in `update`.
const ModalHostMessage = UiSchema.TaggedEnum({
  RequestedCloseDialog: {},
  ConfirmedDialog: {}
})

// Convention: the reader is the dialog's parent, so the dialog still has one
// source for `open`, its prop, and knows nothing about the provider.
export const ModalHost = Html.component({
  name: "ModalHost",
  model: Schema.Null,
  message: ModalHostMessage,
  reads: { provider: ModalProvider }
}).make({
  init: () => null,
  update: ($, message) => {
    const close = () =>
      $.send(ModalProvider, ModalProviderMessage.RequestedClose())
    return ModalHostMessage.match(message, {
      RequestedCloseDialog: close,
      ConfirmedDialog: close
    })
  },
  view: (h) =>
    ConfirmDialog(h, {
      props: { open: h.reads.provider.open },
      onEmit: {
        RequestedClose: () => ModalHostMessage.RequestedCloseDialog(),
        Confirmed: () => ModalHostMessage.ConfirmedDialog()
      }
    })
})

export const Shell = Html.component({
  name: "Shell",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    ModalProvider(h, { view: () => h.div(OpenButton(h, {}), ModalHost(h, {})) })
})

// ---------------------------------------------------------------------------
// A seed is not a mirror
// ---------------------------------------------------------------------------

// The prop is read in `init` only and the Model owns the value from then on.
// Name the prop `initial*` to make that handoff clear.
const CounterMessage = UiSchema.TaggedEnum({ ClickedIncrement: {} })
export const Counter = Html.component({
  name: "Counter",
  props: Schema.Struct({ initialCount: Schema.Number }),
  model: Schema.Struct({ count: Schema.Number }),
  message: CounterMessage
}).make({
  init: ($) => ({ count: $.props.initialCount }),
  update: ($, message) =>
    CounterMessage.match(message, {
      ClickedIncrement: () => ({ count: $.model.count + 1 })
    }),
  view: (h, model) =>
    h.button.onClick(CounterMessage.ClickedIncrement()).children(
      String(model.count)
    )
})

// ---------------------------------------------------------------------------
// What compiles today and shouldn't be written
// ---------------------------------------------------------------------------

// Mirroring a controlled prop. A live `open` prop, and a Model copy of it
// that the dialog's own buttons set: two sources for one value, and no type
// or diagnostic objects.
const DualMessage = UiSchema.TaggedEnum({ ClickedOpen: {}, ClickedClose: {} })
export const Dual = Html.component({
  name: "Dual",
  props: Schema.Struct({ open: Schema.Boolean }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: DualMessage
}).make({
  init: ($) => ({ open: $.props.open }),
  update: (_, message) =>
    DualMessage.match(message, {
      ClickedOpen: () => ({ open: true }),
      ClickedClose: () => ({ open: false })
    }),
  // The prop is read again after `init`. That makes this a mirror, where
  // Counter above is a seed.
  view: (h, model) =>
    h.div(
      h.button.onClick(DualMessage.ClickedOpen()).children("Open"),
      h.dialog.modal(model.open || h.props.open).children(
        h.button.onClick(DualMessage.ClickedClose()).children("Close")
      )
    )
})

// Routing around the owner. The closure hands the owner's parts to a child
// as props: the value a reader gets through `h.reads`, by a second route.
// The dialog's events now land on `Around`, over the owner. Guaranteed: a
// send reaches only an owner above the sender, so `Around` can't ask the
// provider to close, and the dialog stays open.
export const Around = Html.component({
  name: "Around",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    ModalProvider(h, {
      view: (modalProvider) =>
        h.div(
          OpenButton(h, {}),
          ConfirmDialog(h, {
            props: { open: modalProvider.open },
            onEmit: {
              RequestedClose: () => undefined,
              Confirmed: () => undefined
            }
          })
        )
    })
})
