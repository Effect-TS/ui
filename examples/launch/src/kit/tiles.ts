import { Icon } from "#components/Icon"
import type { View } from "@effect/ui"
import {
  Accordion,
  AccordionItem,
  Avatar,
  Button,
  Checkbox,
  CheckboxGroup,
  Collapsible,
  DirectionProvider,
  Field,
  Fieldset,
  Form,
  Input,
  Meter,
  NavigationMenu,
  NumberField,
  OTPField,
  Progress,
  RadioGroup,
  Separator,
  Slider,
  Switch,
  Tabs,
  Toggle,
  ToggleGroup,
  Toolbar
} from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { Redacted } from "effect"
import type { Module } from "./components.ts"

// The small picture in each tile of the kit wall. `on` is true while
// the tile plays. Where the kit has the component as something that
// draws in place, the picture is that component, with `on` passed in
// its props, and its data attributes drive the CSS. A component that
// opens over the page, such as a Dialog or a Menu, would open over
// the article, so its picture is drawn with plain elements in the
// shape of its parts, and `data-playing` on the tile drives it.

type Picture = <M>(h: Html.H<M>, on: boolean) => View.Content<M>

const bar = <M>(h: Html.H<M>, width: number, accent = false) =>
  h.span.class(accent ? "kit-bar kit-bar-accent" : "kit-bar").style({
    width: `${width}px`
  })

const lines = <M>(h: Html.H<M>, widths: ReadonlyArray<number>) =>
  widths.map((width) => bar(h, width))

const fruits = ["apple", "pear", "plum"]

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
  Autocomplete: (h) =>
    h.div.class("kit-input kit-autocomplete").children(
      h.span.children("effect"),
      h.span.class("kit-completion").children("/ui-kit")
    ),
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
  Combobox: (h) =>
    h.div.class("kit-input kit-combobox").children(
      h.span.class("kit-chip").children("ui"),
      h.span.class("kit-chip kit-chip-new").children("kit")
    ),
  ContextMenu: (h) =>
    h.div.class("kit-overlay kit-context-area").children(
      h.span.class("kit-pointer"),
      h.div.class("kit-pop kit-menu kit-context-menu").children(
        lines(h, [28, 22, 30])
      )
    ),
  Dialog: (h) =>
    h.div.class("kit-overlay").children(
      lines(h, [50, 64]),
      h.div.class("kit-backdrop"),
      h.div.class("kit-pop kit-dialog").children(
        bar(h, 40, true),
        bar(h, 30)
      )
    ),
  Drawer: (h) =>
    h.div.class("kit-overlay").children(
      lines(h, [56, 40]),
      h.div.class("kit-sheet")
    ),
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
  Menu: (h) =>
    h.div.class("kit-overlay kit-top").children(
      h.span.class("kit-button").children("Edit ▾"),
      h.div.class("kit-pop kit-menu kit-dropdown").children(
        bar(h, 40),
        bar(h, 30, true),
        bar(h, 44)
      )
    ),
  Menubar: (h) =>
    h.div.class("kit-menubar").children(
      h.span.class("kit-highlight"),
      lines(h, [22, 22, 22])
    ),
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
  Popover: (h) =>
    h.div.class("kit-overlay kit-under").children(
      h.div.class("kit-pop kit-popover").children(bar(h, 40)),
      h.span.class("kit-button").children("Share")
    ),
  PreviewCard: (h) =>
    h.div.class("kit-overlay kit-under").children(
      h.div.class("kit-pop kit-preview").children(
        h.span.class("kit-thumb"),
        bar(h, 34)
      ),
      h.span.class("kit-link").children("effect.website")
    ),
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
  ScrollArea: (h) =>
    h.div.class("kit-scroll").children(
      h.div.class("kit-scroll-content").children(
        lines(h, [60, 44, 56, 38, 60, 48, 52])
      ),
      h.span.class("kit-scroll-thumb")
    ),
  Select: (h) =>
    h.div.class("kit-overlay kit-top").children(
      h.div.class("kit-input kit-select").children(
        h.span.children("eu-west-1"),
        h.span.children("▾")
      ),
      h.div.class("kit-pop kit-menu kit-select-popup").children(
        h.span.children("us-east-1"),
        h.span.class("kit-selected").children("eu-west-1 ✓")
      )
    ),
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
  Toast: (h) =>
    h.div.class("kit-overlay").children(
      lines(h, [44, 30]),
      h.div.class("kit-toast").children(h.i, h.span)
    ),
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
  Tooltip: (h) =>
    h.div.class("kit-overlay kit-under").children(
      h.div.class("kit-pop kit-tooltip"),
      h.span.class("kit-button").children(
        Icon(h, "copy", { class: "size-2.5" })
      )
    ),
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
  Positioning: (h) =>
    h.div.class("kit-positioning").children(
      h.span.class("kit-anchor"),
      h.span.class("kit-floating"),
      h.span.class("kit-edge")
    ),
  VirtualKeyboard: (h) =>
    h.div.class("kit-overlay kit-keyboard").children(
      h.div.class("kit-input").children(h.span.class("kit-caret")),
      h.div.class("kit-keys").children(
        Array.from({ length: 12 }, () => h.span)
      )
    ),
  VirtualList: (h) =>
    h.div.class("kit-scroll").children(
      h.div.class("kit-scroll-content kit-rows").children(
        Array.from({ length: 7 }, (_, index) =>
          h.div.children(
            h.span.children(
              String((index + 1) * 1873).padStart(5, "0")
            ),
            bar(h, 30 + ((index * 7) % 20))
          ))
      )
    )
}

export const tile = <M>(h: Html.H<M>, name: Module, on: boolean) =>
  pictures[name](h, on)
