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

export const Nav = Html.component({
  name: "Nav",
  props: Schema.Struct({ sections: Schema.Array(Section) }),
  model: Schema.Struct({
    current: Schema.NullOr(Schema.String),
    isOpen: Schema.Boolean
  }),
  message: NavMessage
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
          h.nav.class(
            "sticky top-0 z-10 leading-[1.4]",
            "rail:max-h-screen rail:w-(--nav-rail) rail:self-start",
            "rail:justify-self-end rail:overflow-y-auto",
            "rail:pt-12 rail:pb-6 rail:pl-5"
          ).attr("aria-label", "On this page")
        )
          .children(
            h.p.class(
              "text-sm max-rail:hidden",
              "rail:mb-5 rail:font-mono rail:text-[0.625rem]",
              "rail:tracking-[0.1em] rail:uppercase rail:text-muted-foreground"
            ).attr("aria-hidden", "true")
              .children("On this page"),
            Button(h, {
              element: h.button.ref(Toggle),
              onPress: NavMessage.ClickedToggle()
            }).class(
              "peer flex h-(--nav-bar) w-full cursor-pointer",
              "items-center gap-2.5 border-b border-border",
              "bg-background px-(--nav-inset) text-start",
              "text-muted-foreground rail:hidden",
              "focus-visible:-outline-offset-2",
              "after:ms-auto after:size-[7px] after:flex-none",
              "after:border-r-[1.5px] after:border-b-[1.5px]",
              "after:border-current after:content-['']",
              "after:transform-[translateY(-2px)_rotate(45deg)]",
              "aria-expanded:after:transform-[translateY(2px)_rotate(-135deg)]",
              "motion-safe:after:transition-[transform]",
              "motion-safe:after:ease-out-expo"
            ).attrs({
              "aria-expanded": String(model.isOpen),
              "aria-controls": list
            }).children(
              h.span.class("text-sm whitespace-nowrap").children(
                "On this page"
              ),
              " ",
              current &&
                h.span.class(
                  "min-w-0 truncate text-sm font-[560] text-foreground"
                ).children(current.label)
            ),
            menu.list(
              h.ul.id(list).class(
                "max-rail:absolute max-rail:inset-x-0 max-rail:top-full",
                "max-rail:hidden max-rail:peer-aria-expanded:block",
                "max-rail:max-h-[calc(100dvh-var(--nav-bar))]",
                "max-rail:overflow-y-auto max-rail:border-b",
                "max-rail:border-border max-rail:bg-background",
                "max-rail:px-(--nav-inset) max-rail:pt-3 max-rail:pb-4",
                "max-rail:[box-shadow:0_16px_24px_-16px_var(--color-ring)]"
              )
            ).children(
              sections.map(({ id, label, isNested }) =>
                menu.item(h.li.key(id)).children(
                  menu.link({
                    element: h.a.class(
                      "block border-s-2 border-border text-sm",
                      "text-muted-foreground hover:text-foreground",
                      "aria-[current]:border-accent-text aria-[current]:bg-muted",
                      // The same weight as the others: a heavier label is
                      // wider, and wrapping it moved every item below.
                      "aria-[current]:text-foreground",
                      "wrap-break-word focus-visible:-outline-offset-2",
                      "max-rail:py-2.5 max-rail:pe-3.5",
                      "rail:py-[5px] rail:pe-3 rail:text-[0.8125rem]",
                      isNested
                        ? "max-rail:ps-[30px] rail:ps-[26px]"
                        : "max-rail:ps-3.5 rail:ps-3"
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
