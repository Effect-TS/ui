import {
  Autocomplete,
  Combobox,
  ContextMenu,
  Dialog,
  Drawer,
  Menu,
  Popover,
  PreviewCard,
  Select,
  ToastProvider,
  Tooltip
} from "@effect/ui-kit"
import { Html, HtmlServer } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

// Each popup drawn on the server, in the top layer and in place. A closed
// popup's portal or positioner is drawn: a kept-mounted portal, or a
// positioner the component always draws.

const items = [{ value: "a", label: "A" }, { value: "b", label: "B" }]
const ignore = () => undefined

const viewOf = (
  h: Parameters<Parameters<typeof Page.make>[0]["view"]>[0],
  which: string,
  topLayer: boolean
) => {
  const cases = {
    Dialog: () =>
      Dialog(h, {
        props: { open: false, keepMounted: true, modal: false, topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Settled: ignore
        },
        view: (dialog) =>
          h.div(
            dialog.trigger(h.button).children("Open"),
            dialog.portal(h.dialog)?.children(
              dialog.popup(h.div).children("Hi")
            )
          )
      }),
    Drawer: () =>
      Drawer(h, {
        props: { open: false, keepMounted: true, modal: false, topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Settled: ignore,
          Snapped: ignore
        },
        view: (drawer) =>
          h.div(
            drawer.trigger(h.button).children("Open"),
            drawer.portal(h.dialog)?.children(
              drawer.viewport(h.div).children(
                drawer.popup(h.div).children("Hi")
              )
            )
          )
      }),
    Popover: () =>
      Popover(h, {
        props: { open: false, keepMounted: true, topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Settled: ignore
        },
        view: (popover) =>
          h.div(
            popover.trigger({ element: h.button }).children("Open"),
            popover.portal(h.dialog)?.children(
              popover.positioner(h.div).children(
                popover.popup(h.div).children("Hi")
              )
            )
          )
      }),
    Tooltip: () =>
      Tooltip(h, {
        props: { open: false, topLayer },
        onEmit: { RequestedOpen: ignore, RequestedClose: ignore },
        view: (tooltip) =>
          h.div(
            tooltip.trigger(h.button.attr("aria-label", "Bold")).children("B"),
            tooltip.positioner(h.div).children(
              tooltip.popup(h.div).children("Bold")
            )
          )
      }),
    PreviewCard: () =>
      PreviewCard(h, {
        props: { open: false, keepMounted: true, topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Settled: ignore
        },
        view: (previewCard) =>
          h.div(
            previewCard.trigger({ element: h.a.attr("href", "/x") }).children(
              "x"
            ),
            previewCard.portal(h.div)?.children(
              previewCard.positioner(h.div).children(
                previewCard.popup(h.div).children("Preview")
              )
            )
          )
      }),
    Menu: () =>
      Menu(h, {
        props: { open: false, items, topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Picked: ignore,
          Highlighted: ignore,
          RequestedQuery: ignore,
          Settled: ignore
        },
        view: (menu) =>
          h.div(
            menu.trigger({ element: h.button }).children("Edit"),
            menu.backdrop(h.div),
            menu.positioner(h.div).children(
              menu.popup(h.div).children(
                items.map(({ label, value }) =>
                  menu.item({ element: h.div, value }).children(label)
                )
              )
            )
          )
      }),
    ContextMenu: () =>
      ContextMenu(h, {
        props: { open: false, items, topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Picked: ignore,
          Highlighted: ignore,
          Settled: ignore
        },
        view: (contextMenu) =>
          h.div(
            contextMenu.trigger(h.div).children("Area"),
            contextMenu.positioner(h.div).children(
              contextMenu.popup(h.div).children(
                items.map(({ label, value }) =>
                  contextMenu.item({ element: h.div, value }).children(label)
                )
              )
            )
          )
      }),
    Select: () =>
      Select(h, {
        props: { open: false, items, value: "a", topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Picked: ignore,
          Settled: ignore
        },
        view: (select) =>
          h.div(
            select.trigger(h.button).children(select.value(h.span)),
            select.backdrop(h.div),
            select.positioner(h.div).children(
              select.popup(h.div).children(
                items.map(({ label, value }) =>
                  select.item({ element: h.div, value }).children(
                    select.itemText(h.div).children(label)
                  )
                )
              )
            )
          )
      }),
    Combobox: () =>
      Combobox(h, {
        props: { open: false, items, value: null, inputValue: "", topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Picked: ignore,
          RequestedInputValue: ignore,
          Highlighted: ignore,
          Settled: ignore
        },
        view: (combobox) =>
          h.div(
            combobox.input(h.input.attr("aria-label", "Fruit")),
            combobox.backdrop(h.div),
            combobox.positioner(h.div).children(
              combobox.popup(h.div).children(
                combobox.list(h.div).children(
                  combobox.items.map(({ label, value }) =>
                    combobox.item({ element: h.div, value }).children(label)
                  )
                )
              )
            )
          )
      }),
    Autocomplete: () =>
      Autocomplete(h, {
        props: { open: false, items, value: "", topLayer },
        onEmit: {
          RequestedOpen: ignore,
          RequestedClose: ignore,
          Updated: ignore,
          Highlighted: ignore,
          Settled: ignore
        },
        view: (autocomplete) =>
          h.div(
            autocomplete.input(h.input.attr("aria-label", "Search")),
            autocomplete.positioner(h.div).children(
              autocomplete.popup(h.div).children(
                autocomplete.list(h.div).children(
                  autocomplete.items.map(({ label, value }) =>
                    autocomplete.item({ element: h.div, value }).children(label)
                  )
                )
              )
            )
          )
      }),
    Toast: () =>
      ToastProvider(h, {
        props: { topLayer },
        view: (toastProvider) =>
          h.div(toastProvider.viewport(h.div.class("toasts")))
      })
  }
  return cases[which as keyof typeof cases]()
}

const names = [
  "Dialog",
  "Drawer",
  "Popover",
  "Tooltip",
  "PreviewCard",
  "Menu",
  "ContextMenu",
  "Select",
  "Combobox",
  "Autocomplete",
  "Toast"
]

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ which: Schema.String, topLayer: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never
})

const PageComponent = Page.make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => viewOf(h, h.props.which, h.props.topLayer)
})

const render = (which: string, topLayer: boolean) =>
  HtmlServer.renderToHtml(PageComponent, { which, topLayer }).pipe(
    Effect.map(({ html }) => html)
  )

describe("topLayer", () => {
  it.effect("each popup is a popover by default, and an ordinary element with topLayer: false", () =>
    Effect.gen(function*() {
      for (const which of names) {
        assert.match(yield* render(which, true), /popover="manual"/, which)
        assert.notMatch(yield* render(which, false), /popover=/, which)
      }
    }))

  it.effect("a closed popup drawn in place is hidden, while the toast viewport shows", () =>
    Effect.gen(function*() {
      for (
        const which of ["Tooltip", "Menu", "Select", "Combobox", "PreviewCard"]
      ) {
        assert.match(yield* render(which, false), / hidden(=""|\s|>)/, which)
      }
      // A closed `<dialog>` is hidden by the browser without its `open`.
      assert.notMatch(yield* render("Dialog", false), /<dialog[^>]* open/)
      assert.notMatch(
        yield* render("Toast", false),
        /class="toasts"[^>]* hidden/
      )
    }))
})
