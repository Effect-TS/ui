import { Icon } from "#components/Icon"
import {
  Component,
  Mount,
  Subscription,
  UiSchema,
  type View
} from "@effect/ui"
import {
  Accordion,
  AccordionItem,
  Autocomplete,
  Avatar,
  Button,
  Checkbox,
  CheckboxGroup,
  Collapsible,
  Combobox,
  ContextMenu,
  Dialog,
  DirectionProvider,
  Drawer,
  Field,
  Fieldset,
  Form,
  Input,
  Menu,
  Menubar,
  Meter,
  NavigationMenu,
  NumberField,
  OTPField,
  Popover,
  PreviewCard,
  Progress,
  RadioGroup,
  ScrollArea,
  Select,
  Separator,
  Slider,
  Switch,
  Tabs,
  ToastProvider,
  Toggle,
  ToggleGroup,
  Toolbar,
  Tooltip,
  VirtualList
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Redacted, Schema, Stream } from "effect"
import type { Module } from "./components.ts"
import { floating, keyboardCover, stage } from "./geometry.ts"

// The small picture in each tile of the kit wall. `on` is true while
// the tile plays. Most pictures are the kit's own component, with `on`
// passed in its props, and its data attributes drive the CSS.
//
// The popups (Dialog, Drawer, Popover, Tooltip, PreviewCard, Menu,
// Menubar, ContextMenu, Select, Combobox, Autocomplete and the Toast
// viewport) take `topLayer: false`, so they open in place inside their
// tile, which is their containing block, and never as modals: they
// lock no scroll, hide nothing from screen readers and block no
// presses. The dialogs also leave focus where it is as they open and
// close. The picture is `inert`, so nothing in it takes focus.
//
// Positioning and VirtualKeyboard draw nothing themselves, so their
// pictures draw what the kit computes: Positioning places a box with
// the pure `place`, and VirtualKeyboard works out the keyboard's band
// with the pure `step`, from made-up viewport sizes (see geometry.ts).
//
// AlertDialog alone isn't the kit. It is always modal and always in
// the top layer, so it would block the article. Its picture is plain
// elements in the shape of its parts, and `data-playing` on the tile
// drives them.

type Picture = <M>(h: Html.H<M>, on: boolean) => View.Content<M>

const bar = <M>(h: Html.H<M>, width: number, accent = false) =>
  h.span.class(accent ? "kit-bar kit-bar-accent" : "kit-bar").style({
    width: `${width}px`
  })

const lines = <M>(h: Html.H<M>, widths: ReadonlyArray<number>) =>
  widths.map((width) => bar(h, width))

const fruits = ["apple", "pear", "plum"]

const menuItems = ["cut", "copy", "paste"].map((value) => ({
  value,
  label: value
}))

const regions = ["us-east-1", "eu-west-1"].map((value) => ({
  value,
  label: value
}))

const packages = ["effect", "effect/ui", "effect/ui-kit"].map((
  value
) => ({
  value,
  label: value
}))

// A popup drawn in place, with the side and the alignment the picture
// gives it. In place, the collision boundary is the part of the page in
// view, so a tile near the window's edge would flip its popup out of the
// tile. It never flips.
const inTile = {
  topLayer: false,
  collisionAvoidance: {
    side: "none",
    align: "none",
    fallbackAxisSide: "none"
  }
} as const

// A dialog drawn in place that leaves focus alone and ignores presses
// outside it.
const quietDialog = {
  topLayer: false,
  initialFocus: false,
  finalFocus: false,
  disablePointerDismissal: true
} as const

// The pictures ignore what the components ask for: `on` alone decides.
const none = () => undefined

const prefersReducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches ??
    false

// ScrollArea has no controlled scroll position, so this mount scrolls
// its viewport, and the kit's own mount moves the thumb to follow.
// Scrolling an element never scrolls the page.
const ScrollTo = Mount.make(
  "ScrollTo",
  { args: { top: Schema.Number } },
  (node: HTMLElement, _args, changes) =>
    Stream.runForEach(
      changes,
      ({ top }) =>
        Effect.sync(() =>
          node.scrollTo({
            top,
            behavior: prefersReducedMotion() ? "instant" : "smooth"
          })
        )
    ).pipe(Effect.as(Component.noop))
)

const ToastPosterMessage = UiSchema.TaggedEnum({
  ChangedOn: { on: Schema.Boolean }
})

// Toasts are posted to the provider from below it, so this posts one
// while the tile plays and closes it after. Nothing is dispatched when
// a prop changes, so a Subscription keyed on `on` sends the change. It
// also draws the page the toast shows over.
const ToastPoster = Html.component({
  name: "ToastPoster",
  props: Schema.Struct({ on: Schema.Boolean }),
  model: Schema.Null,
  message: ToastPosterMessage
}).make({
  init: () => null,
  update: {
    ChangedOn: ($, { on }) =>
      $.send(
        ToastProvider,
        on
          ? {
            _tag: "RequestedAdd",
            toast: {
              id: "deployed",
              title: "Deployed",
              type: "success"
            }
          }
          : { _tag: "RequestedClose", id: "deployed" }
      )
  },
  subscriptions: ({ props }) => [
    Subscription.make(
      "on",
      props.on,
      (on) => Stream.make(ToastPosterMessage.ChangedOn({ on }))
    )
  ],
  view: (h) => h.div.class("kit-stack").children(lines(h, [44, 30]))
})

// A Record over every module, so a module added to the kit fails the
// build until it has a picture.
const pictures: Record<Module, Picture> = {
  Accordion: (h, on) =>
    Accordion(h, {
      key: "Accordion",
      props: { value: on ? ["first"] : [] },
      view: (accordion) =>
        accordion.root(h.div.class("kit-accordion")).children(
          ["first", "second"].map((value, index) =>
            AccordionItem(h, {
              key: value,
              props: { value, index },
              view: (item) =>
                item.root(h.div).children(
                  item.trigger(h.button).children(
                    bar(h, 40, index === 0)
                  ),
                  item.panel(h.div.class("kit-panel"))?.children(
                    lines(h, [56, 40])
                  )
                )
            })
          )
        )
    }),
  AlertDialog: (h) =>
    h.div.class("kit-overlay").children(
      lines(h, [60, 44]),
      h.div.class("kit-backdrop"),
      h.div.class("kit-pop kit-dialog").children(
        bar(h, 36),
        h.div.class("kit-actions").children(
          h.span.class("kit-key"),
          h.span.class("kit-key kit-key-danger")
        )
      )
    ),
  Autocomplete: (h, on) =>
    Autocomplete(h, {
      key: "Autocomplete",
      props: {
        open: on,
        value: on ? "effect/ui-" : "",
        items: packages,
        ...inTile,
        sideOffset: 3
      },
      onEmit: none,
      view: (autocomplete) =>
        h.div.class("kit-overlay kit-top").children(
          autocomplete.input(h.input.class("kit-input kit-typing")),
          autocomplete.positioner(h.div.class("kit-positioner"))
            .children(
              autocomplete.popup(h.div.class("kit-popup kit-list"))
                .children(
                  autocomplete.list(h.div).children(
                    autocomplete.items.map(({ label, value }) =>
                      autocomplete.item({ element: h.div, value })
                        .children(
                          label
                        )
                    )
                  )
                )
            )
        )
    }),
  Avatar: (h) =>
    h.div.class("kit-avatars").children(
      ["MB", "TK"].map((initials) =>
        Avatar(h, {
          key: initials,
          props: {},
          view: (avatar) =>
            avatar.root(h.span.class("kit-avatar")).children(
              avatar.fallback(h.span)?.children(initials)
            )
        })
      )
    ),
  Button: (h) =>
    Button(h, {}).class("kit-button kit-button-primary").children(
      "Deploy"
    ),
  Checkbox: (h, on) =>
    h.div.class("kit-row").children(
      Checkbox(h, {
        key: "Checkbox",
        props: { checked: on },
        view: (checkbox) =>
          checkbox.root(h.button.class("kit-checkbox")).children(
            checkbox.indicator(h.span.class("kit-tick"))?.children(
              "✓"
            )
          )
      }),
      bar(h, 44)
    ),
  CheckboxGroup: (h, on) =>
    CheckboxGroup(h, {
      key: "CheckboxGroup",
      props: { value: on ? fruits : [], allValues: fruits },
      view: (group) =>
        group.root(h.div.class("kit-row kit-checkbox-group"))
          .children(
            Checkbox(h, {
              key: "all",
              props: { parent: true },
              view: (checkbox) =>
                checkbox.root(h.button.class("kit-checkbox"))
                  .children(
                    checkbox.indicator(h.span.class("kit-tick"))
                      ?.children("✓")
                  )
            }),
            fruits.map((fruit) =>
              Checkbox(h, {
                key: fruit,
                props: { value: fruit },
                view: (checkbox) =>
                  checkbox.root(h.button.class("kit-checkbox"))
                    .children(
                      checkbox.indicator(h.span.class("kit-tick"))
                        ?.children("✓")
                    )
              })
            )
          )
    }),
  Collapsible: (h, on) =>
    Collapsible(h, {
      key: "Collapsible",
      props: { open: on },
      view: (collapsible) =>
        collapsible.root(h.div.class("kit-collapsible")).children(
          collapsible.trigger(h.button).children(bar(h, 50, true)),
          collapsible.panel(h.div.class("kit-panel"))?.children(
            lines(h, [64, 48])
          )
        )
    }),
  Combobox: (h, on) =>
    Combobox(h, {
      key: "Combobox",
      props: {
        open: on,
        inputValue: "",
        value: on ? ["ui", "kit"] : ["ui"],
        multiple: true,
        items: [{ value: "ui", label: "ui" }, {
          value: "kit",
          label: "kit"
        }],
        ...inTile,
        // Against the chips, not the input after them.
        anchor: "kit-combobox-chips",
        align: "start",
        sideOffset: 3
      },
      onEmit: none,
      view: (combobox) =>
        h.div.class("kit-overlay kit-top").children(
          combobox.chips(
            h.div.class("kit-input kit-combobox").attr(
              "id",
              "kit-combobox-chips"
            )
          ).children(
            combobox.selectedItems.map(({ label, value }) =>
              combobox.chip({
                element: h.div.class("kit-chip"),
                value
              })
                .children(label)
            ),
            combobox.input(h.input)
          ),
          combobox.positioner(h.div.class("kit-positioner")).children(
            combobox.popup(h.div.class("kit-popup kit-list"))
              .children(
                combobox.list(h.div).children(
                  combobox.items.map(({ label, value }) =>
                    combobox.item({ element: h.div, value }).children(
                      label,
                      combobox.itemIndicator({
                        element: h.span,
                        value
                      })
                        ?.children("✓")
                    )
                  )
                )
              )
          )
        )
    }),
  ContextMenu: (h, on) =>
    ContextMenu(h, {
      key: "ContextMenu",
      props: {
        open: on,
        items: menuItems,
        ...inTile,
        anchor: "kit-context-point"
      },
      onEmit: none,
      view: (contextMenu) =>
        contextMenu.trigger(
          h.div.class("kit-overlay kit-context-area")
        )
          .children(
            h.span.class("kit-pointer").attr(
              "id",
              "kit-context-point"
            ),
            contextMenu.positioner(h.div.class("kit-positioner"))
              .children(
                contextMenu.popup(h.div.class("kit-popup kit-menu"))
                  .children(
                    menuItems.map(({ value }, index) =>
                      contextMenu.item({ element: h.div, value })
                        .children(
                          bar(h, [28, 22, 30][index]!)
                        )
                    )
                  )
              )
          )
    }),
  Dialog: (h, on) =>
    Dialog(h, {
      key: "Dialog",
      props: { open: on, ...quietDialog },
      onEmit: none,
      view: (dialog) =>
        h.div.class("kit-overlay").children(
          lines(h, [50, 64]),
          dialog.portal(h.dialog)?.children(
            dialog.backdrop(h.div.class("kit-backdrop")),
            dialog.popup(h.div.class("kit-popup kit-dialog"))
              .children(
                bar(h, 40, true),
                bar(h, 30)
              )
          )
        )
    }),
  Drawer: (h, on) =>
    Drawer(h, {
      key: "Drawer",
      props: { open: on, ...quietDialog },
      onEmit: none,
      view: (drawer) =>
        h.div.class("kit-overlay").children(
          lines(h, [56, 40]),
          drawer.portal(h.dialog)?.children(
            drawer.viewport(h.div.class("kit-viewport")).children(
              drawer.popup(h.div.class("kit-sheet"))
            )
          )
        )
    }),
  Field: (h, on) =>
    Field(h, {
      key: "Field",
      props: { invalid: on },
      view: (field) =>
        field.root(h.div.class("kit-field")).children(
          field.label(h.label).children(bar(h, 26)),
          field.control(h.input.class("kit-input")),
          field.error(h.div.class("kit-error"))
        )
    }),
  Fieldset: (h, on) =>
    Fieldset(h, {
      key: "Fieldset",
      props: { disabled: on },
      view: (fieldset) =>
        fieldset.root(h.fieldset.class("kit-fieldset")).children(
          fieldset.legend(h.div).children(bar(h, 20)),
          h.input.class("kit-input"),
          bar(h, 40)
        )
    }),
  Form: (h, on) =>
    Form(h, {
      key: "Form",
      view: (form) =>
        form.root(h.form.class("kit-form")).children(
          ["name", "email"].map((name, index) =>
            Field(h, {
              key: `Form-${name}`,
              props: { invalid: on && index === 1 },
              view: (field) =>
                field.root(h.div).children(
                  field.control(h.input.class("kit-input"))
                )
            })
          )
        )
    }),
  Input: (h, on) =>
    Input(h, { props: { value: on ? "Hello, kit" : "" } })
      .class("kit-input kit-typing"),
  Menu: (h, on) =>
    Menu(h, {
      key: "Menu",
      props: {
        open: on,
        items: menuItems,
        ...inTile,
        align: "start",
        sideOffset: 3,
        finalFocus: false
      },
      onEmit: none,
      view: (menu) =>
        h.div.class("kit-overlay kit-top").children(
          menu.trigger({
            element: h.button.class("kit-button self-start")
          })
            .children("Edit ▾"),
          menu.positioner(h.div.class("kit-positioner")).children(
            menu.popup(h.div.class("kit-popup kit-menu kit-dropdown"))
              .children(
                menuItems.map(({ value }, index) =>
                  menu.item({ element: h.div, value }).children(
                    bar(h, [40, 30, 44][index]!, index === 1)
                  )
                )
              )
          )
        )
    }),
  Menubar: (h, on) =>
    Menubar(h, {
      key: "Menubar",
      props: {},
      view: (menubar) =>
        menubar.root(h.div.class("kit-menubar")).children(
          ["file", "edit", "view"].map((name, index) =>
            Menu(h, {
              key: name,
              props: {
                open: on && index === 1,
                items: menuItems,
                ...inTile,
                align: "start",
                sideOffset: 3,
                finalFocus: false
              },
              onEmit: none,
              view: (menu) =>
                h.div.children(
                  menu.trigger({ element: h.button }).children(
                    bar(h, 22)
                  ),
                  menu.positioner(h.div.class("kit-positioner"))
                    .children(
                      menu.popup(h.div.class("kit-popup kit-menu"))
                        .children(
                          menuItems.map(({ value }, item) =>
                            menu.item({ element: h.div, value })
                              .children(
                                bar(h, [28, 20, 24][item]!)
                              )
                          )
                        )
                    )
                )
            })
          )
        )
    }),
  Meter: (h, on) =>
    Meter(h, {
      key: "Meter",
      props: { value: on ? 82 : 38 },
      view: (meter) =>
        meter.root(h.div.class("kit-meter")).children(
          meter.track(h.div.class("kit-track")).children(
            meter.indicator(h.div.class("kit-fill"))
          )
        )
    }),
  NavigationMenu: (h, on) =>
    NavigationMenu(h, {
      key: "NavigationMenu",
      view: (navigationMenu) =>
        navigationMenu.root(h.nav.class("kit-nav")).children(
          navigationMenu.list(h.ul).children(
            [0, 1, 2].map((index) =>
              navigationMenu.item(h.li.key(String(index))).children(
                navigationMenu.link({
                  element: h.a.attr("href", "#ui-kit"),
                  active: index === (on ? 2 : 0)
                }).children(bar(h, 20))
              )
            )
          )
        )
    }),
  NumberField: (h, on) =>
    NumberField(h, {
      key: "NumberField",
      props: { value: on ? 4 : 3 },
      view: (numberField) =>
        numberField.root(h.div.class("kit-number")).children(
          numberField.group(h.div.class("kit-input")).children(
            numberField.decrement({ element: h.button }).children(
              "−"
            ),
            numberField.input(h.input),
            numberField.increment({ element: h.button }).children("+")
          )
        )
    }),
  OTPField: (h, on) =>
    OTPField(h, {
      key: "OTPField",
      props: { value: Redacted.make(on ? "4192" : ""), length: 4 },
      view: (otpField) =>
        otpField.root(h.div.class("kit-otp")).children(
          Array.from(
            { length: otpField.length },
            (_, index) => otpField.input({ element: h.input, index })
          )
        )
    }),
  Popover: (h, on) =>
    Popover(h, {
      key: "Popover",
      props: {
        open: on,
        ...inTile,
        initialFocus: false,
        finalFocus: false,
        side: "top",
        sideOffset: 4
      },
      onEmit: none,
      view: (popover) =>
        h.div.class("kit-overlay kit-under").children(
          popover.trigger({ element: h.button.class("kit-button") })
            .children("Share"),
          popover.portal(h.dialog)?.children(
            popover.positioner(h.div.class("kit-positioner"))
              .children(
                popover.popup(h.div.class("kit-popup kit-popover"))
                  .children(bar(h, 40))
              )
          )
        )
    }),
  PreviewCard: (h, on) =>
    PreviewCard(h, {
      key: "PreviewCard",
      props: {
        open: on,
        ...inTile,
        side: "top",
        align: "start",
        sideOffset: 4
      },
      onEmit: none,
      view: (previewCard) =>
        h.div.class("kit-overlay kit-under").children(
          previewCard.trigger({
            element: h.a.class("kit-link").attr("href", "#ui-kit")
          }).children("effect.website"),
          previewCard.portal(h.div)?.children(
            previewCard.positioner(h.div.class("kit-positioner"))
              .children(
                previewCard.popup(
                  h.div.class("kit-popup kit-preview")
                )
                  .children(h.span.class("kit-thumb"), bar(h, 34))
              )
          )
        )
    }),
  Progress: (h, on) =>
    Progress(h, {
      key: "Progress",
      props: { value: on ? 92 : 8 },
      view: (progress) =>
        progress.root(h.div.class("kit-meter kit-progress")).children(
          progress.track(h.div.class("kit-track")).children(
            progress.indicator(h.div.class("kit-fill"))
          )
        )
    }),
  RadioGroup: (h, on) =>
    RadioGroup(h, {
      key: "RadioGroup",
      props: {
        value: on ? "b" : "a",
        items: ["a", "b", "c"].map((value) => ({ value }))
      },
      view: (radioGroup) =>
        radioGroup.root(h.div.class("kit-row kit-radios")).children(
          ["a", "b", "c"].map((value) =>
            radioGroup.radio({
              element: h.button.class("kit-radio"),
              value
            })
              .children(
                radioGroup.indicator({ element: h.span, value })
              )
          )
        )
    }),
  ScrollArea: (h, on) =>
    ScrollArea(h, {
      key: "ScrollArea",
      view: (scrollArea) =>
        // The root writes its own `position: relative`, so a layer
        // around it holds it to the picture.
        h.div.class("kit-scroll").children(
          scrollArea.root(h.div.class("kit-scroll-area")).children(
            scrollArea.viewport(h.div.class("kit-scroll-viewport"))
              .onMount(ScrollTo({ top: on ? 24 : 0 }))
              .children(
                scrollArea.content(h.div.class("kit-scroll-content"))
                  .children(
                    lines(h, [60, 44, 56, 38, 60, 48, 52, 40, 58])
                  )
              ),
            scrollArea.scrollbar({
              element: h.div.class("kit-scrollbar"),
              thumb: h.div.class("kit-scroll-thumb")
            })
          )
        )
    }),
  Select: (h, on) =>
    Select(h, {
      key: "Select",
      props: {
        open: on,
        value: "eu-west-1",
        items: regions,
        ...inTile,
        sideOffset: 3,
        finalFocus: false
      },
      onEmit: none,
      view: (select) =>
        h.div.class("kit-overlay kit-top").children(
          select.trigger(h.button.class("kit-input kit-select"))
            .children(
              select.value(h.span),
              select.icon(h.span).children("▾")
            ),
          select.positioner(h.div.class("kit-positioner")).children(
            select.popup(h.div.class("kit-popup kit-list")).children(
              regions.map(({ label, value }) =>
                select.item({ element: h.div, value }).children(
                  select.itemText(h.div).children(label),
                  select.itemIndicator({ element: h.span, value })
                    ?.children("✓")
                )
              )
            )
          )
        )
    }),
  Separator: (h) =>
    h.div.class("kit-stack").children(
      bar(h, 50),
      Separator(h, {}).class("kit-separator"),
      bar(h, 36)
    ),
  Slider: (h, on) =>
    Slider(h, {
      key: "Slider",
      props: { value: on ? 75 : 25 },
      view: (slider) =>
        slider.root(h.div.class("kit-slider")).children(
          slider.control(h.div).children(
            slider.track(h.div.class("kit-track")).children(
              slider.indicator(h.div.class("kit-fill")),
              slider.thumb({
                element: h.div.class("kit-thumb"),
                input: h.input
              })
            )
          )
        )
    }),
  Switch: (h, on) =>
    Switch(h, {
      props: { checked: on },
      view: (parts) =>
        parts.root(h.button.class("kit-switch")).children(
          parts.thumb(h.span)
        )
    }),
  Tabs: (h, on) =>
    Tabs(h, {
      key: "Tabs",
      props: {
        value: on ? "b" : "a",
        tabs: [{ value: "a" }, { value: "b" }, { value: "c" }]
      },
      view: (tabs) =>
        tabs.root(h.div.class("kit-tabs")).children(
          tabs.list(h.div).children(
            ["a", "b", "c"].map((value) =>
              tabs.tab({ element: h.button, value }).children(
                bar(h, 20)
              )
            ),
            tabs.indicator(h.span.class("kit-indicator"))
          )
        )
    }),
  Toast: (h, on) =>
    ToastProvider(h, {
      key: "Toast",
      props: { topLayer: false, timeout: 0 },
      view: (toastProvider) =>
        h.div.class("kit-overlay").children(
          ToastPoster(h, { props: { on } }),
          toastProvider.viewport(h.div.class("kit-toasts")).children(
            toastProvider.toasts.map((toast) =>
              toastProvider.root({
                element: h.div.class("kit-toast"),
                toast
              })
                .children(h.i, h.span)
            )
          )
        )
    }),
  Toggle: (h, on) =>
    h.div.class("kit-row").children(
      Toggle(h, { props: { pressed: on } }).class(
        "kit-button kit-toggle"
      )
        .children("B"),
      Toggle(h, { props: { pressed: on } }).class(
        "kit-button kit-toggle kit-toggle-late"
      ).children("I")
    ),
  ToggleGroup: (h, on) =>
    ToggleGroup(h, {
      key: "ToggleGroup",
      props: {
        value: [on ? "R" : "L"],
        items: ["L", "C", "R"].map((value) => ({ value }))
      },
      view: (toggleGroup) =>
        toggleGroup.root(h.div.class("kit-segments")).children(
          ["L", "C", "R"].map((value) =>
            toggleGroup.item({ element: h.button, value }).children(
              value
            )
          )
        )
    }),
  Toolbar: (h) =>
    Toolbar(h, {
      key: "Toolbar",
      props: {
        items: ["cut", "copy", "trash"].map((value) => ({ value }))
      },
      view: (toolbar) =>
        toolbar.root(h.div.class("kit-segments kit-toolbar"))
          .children(
            (["cut", "copy", "trash"] as const).map((value) =>
              toolbar.button({ element: h.button, value }).children(
                Icon(h, value, { class: "size-2.5" })
              )
            )
          )
    }),
  Tooltip: (h, on) =>
    Tooltip(h, {
      key: "Tooltip",
      props: { open: on, ...inTile, sideOffset: 4 },
      onEmit: none,
      view: (tooltip) =>
        h.div.class("kit-overlay kit-under").children(
          tooltip.trigger(h.button.class("kit-button")).children(
            Icon(h, "copy", { class: "size-2.5" })
          ),
          tooltip.positioner(h.div.class("kit-positioner kit-fade"))
            .children(tooltip.popup(h.div.class("kit-tooltip")))
        )
    }),
  DirectionProvider: (h, on) =>
    DirectionProvider(h, {
      props: { direction: on ? "rtl" : "ltr" },
      view: (provider) =>
        h.div.class("kit-row kit-direction").attr(
          "dir",
          provider.direction
        )
          .children(
            h.span.class("kit-arrow").children("→"),
            bar(h, 30, true),
            bar(h, 18)
          )
    }),
  Positioning: (h, on) => {
    const { anchor, box, side } = floating(on)
    const at = (
      rect: { readonly x: number; readonly y: number }
    ) => ({
      left: `${rect.x}px`,
      top: `${rect.y}px`
    })
    return h.div.class("kit-positioning").attr(
      "data-flipped",
      side === "bottom" ? undefined : ""
    ).style({
      width: `${stage.width}px`,
      height: `${stage.height}px`
    })
      .children(
        h.span.class("kit-anchor").style(at(anchor)),
        h.span.class("kit-floating").style(at(box)),
        h.span.class("kit-edge")
      )
  },
  VirtualKeyboard: (h, on) =>
    h.div.class("kit-overlay kit-keyboard").children(
      h.div.class("kit-input").children(h.span.class("kit-caret")),
      // The keyboard covers as much of the picture as the band it
      // leaves would of the phone's screen.
      h.div.class("kit-keys").style({
        height: `${Math.round(keyboardCover(on) * 100)}%`
      }).children(
        h.div.children(Array.from({ length: 12 }, () => h.span))
      )
    ),
  VirtualList: (h, on) =>
    VirtualList(h, {
      key: "VirtualList",
      props: {
        count: 10_000,
        itemSize: 10,
        measure: false,
        initialCount: 5,
        scrollTo: on
          ? { target: { _tag: "Index", index: 1873 } }
          : { target: { _tag: "Offset", offset: 0 } }
      },
      view: (virtualList) =>
        virtualList.viewport(h.div.class("kit-scroll kit-virtual"))
          .children(
            virtualList.list(h.div.class("kit-rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.div.key(String(index)),
                  index
                }).children(
                  h.span.children(String(index + 1).padStart(5, "0")),
                  bar(h, 30 + ((index * 7) % 20))
                )
              )
            )
          )
    })
}

export const tile = <M>(h: Html.H<M>, name: Module, on: boolean) =>
  pictures[name](h, on)
