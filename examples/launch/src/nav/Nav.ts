import { Section } from "#domain/Section"
import { Component, Subscription, UiSchema } from "@effect/ui"
import { Button, NavigationMenu } from "@effect/ui-kit"
import { Html, HtmlCommand, HtmlSubscription } from "@effect/ui/html"
import { Array, Option, Schema, Stream } from "effect"

export const NavMessage = UiSchema.TaggedEnum({
  ClickedToggle: {},
  ClickedSection: {},
  PressedEscape: {},
  ChangedSection: { current: Schema.NullOr(Schema.String) }
})

const Toggle = Html.ref("Nav.toggle", "button")

const hasPassed = (id: string) => {
  const heading = document.getElementById(id)
  return heading !== null &&
    heading.getBoundingClientRect().top <=
      Number.parseFloat(getComputedStyle(heading).scrollMarginTop) + 1
}

const isAtEnd = () =>
  window.scrollY > 0 &&
  window.scrollY + window.innerHeight >=
    document.documentElement.scrollHeight - 1

const currentSection = (ids: ReadonlyArray<string>) =>
  Option.getOrNull(
    isAtEnd() ? Array.last(ids) : Array.findLast(ids, hasPassed)
  )

const TrackSection = (ids: ReadonlyArray<string>) =>
  Subscription.make(
    "section",
    ids,
    (ids) =>
      Stream.suspend(() =>
        Stream.merge(
          Stream.fromEventListener(window, "scroll", {
            passive: true
          }),
          Stream.fromEventListener(window, "resize")
        )
      ).pipe(
        Stream.prepend([undefined]),
        Stream.map(() => currentSection(ids)),
        Stream.changes,
        Stream.map((current) =>
          NavMessage.ChangedSection({ current })
        )
      )
  )

export const Nav = Component.define({
  name: "Nav",
  scoped: false,
  props: Schema.Struct({ sections: Schema.Array(Section) }),
  model: Schema.Struct({
    current: Schema.NullOr(Schema.String),
    isOpen: Schema.Boolean
  }),
  message: NavMessage,
  elements: Html
}).make({
  init: () => ({ current: null, isOpen: false }),
  update: {
    ClickedToggle: ($) => $.evolve({ isOpen: (isOpen) => !isOpen }),
    ClickedSection: ($) => $.evolve({ isOpen: false }),
    PressedEscape: ($) =>
      $.evolve({ isOpen: false }).run(
        HtmlCommand.focus(Toggle, () => Component.noop)
      ),
    ChangedSection: ($, { current }) => $.evolve({ current })
  },
  subscriptions: ({ model, props }) => [
    TrackSection(props.sections.map(({ id }) => id)),
    model.isOpen &&
    HtmlSubscription.onDocument(
      "keydown",
      ({ key }) =>
        key === "Escape" ? NavMessage.PressedEscape() : undefined
    )
  ],
  view: (h, model) => {
    const list = h.id("sections")
    const { sections } = h.props
    const current = sections.find(({ id }) => id === model.current)
    return NavigationMenu(h, {
      props: { orientation: "vertical" },
      view: (menu) =>
        menu.root(
          h.nav.class("nav").attr("aria-label", "On this page")
        )
          .children(
            h.p.class("nav-title").attr("aria-hidden", "true")
              .children("On this page"),
            Button(h, {
              element: h.button.ref(Toggle),
              onPress: NavMessage.ClickedToggle()
            }).class("nav-toggle").attrs({
              "aria-expanded": String(model.isOpen),
              "aria-controls": list
            }).children(
              h.span.children("On this page"),
              " ",
              current &&
                h.span.class("nav-current").children(current.label)
            ),
            menu.list(h.ul.id(list).class("nav-list")).children(
              ...sections.map(({ id, label, isNested }) =>
                menu.item(h.li.key(id)).children(
                  menu.link({
                    element: h.a.class(
                      "nav-link",
                      isNested && "nav-nested"
                    ).attr("href", `#${id}`).onClick(
                      NavMessage.ClickedSection()
                    ),
                    active: id === model.current
                  }).attr(
                    "aria-current",
                    id === model.current ? "location" : undefined
                  ).children(label)
                )
              )
            )
          )
    })
  }
})
