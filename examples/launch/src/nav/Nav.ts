import { Component, Subscription, UiSchema } from "@effect/ui"
import { DomCommand, DomSubscription, Html } from "@effect/ui/html"
import { Array, Option, Schema, Stream } from "effect"

export const sections = [
  { id: "terms", label: "Terms" },
  { id: "architecture", label: "The architecture" },
  { id: "define", label: "Components" },
  { id: "split", label: "Separate functions" },
  { id: "one-model", label: "One Model in Foldkit 0.x" },
  { id: "components", label: "A Model per Component" },
  { id: "queries", label: "Queries" },
  { id: "testing", label: "Testing" },
  { id: "performance", label: "Performance" },
  { id: "more", label: "More that is new" },
  { id: "carries-over", label: "What carries over" },
  { id: "next", label: "What happens next" }
] as const

const ids = sections.map(({ id }) => id)

const SectionId = Schema.Literals(ids)

export const NavMessage = UiSchema.TaggedEnum({
  ClickedToggle: {},
  ClickedSection: {},
  PressedEscape: {},
  ChangedSection: { current: Schema.NullOr(SectionId) }
})

const Toggle = Html.ref("Nav.toggle", "button")

const hasPassed = (id: string) => {
  const heading = document.getElementById(id)
  return heading !== null &&
    heading.getBoundingClientRect().top <= Number.parseFloat(getComputedStyle(heading).scrollMarginTop) + 1
}

const isAtEnd = () =>
  window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1

const currentSection = () =>
  isAtEnd() ? sections[sections.length - 1].id : Option.getOrNull(Array.findLast(ids, hasPassed))

const TrackSection = Subscription.make(
  "section",
  Stream.suspend(() =>
    Stream.merge(
      Stream.fromEventListener(window, "scroll", { passive: true }),
      Stream.fromEventListener(window, "resize")
    )
  ).pipe(
    Stream.prepend([undefined]),
    Stream.map(currentSection),
    Stream.changes,
    Stream.map((current) => NavMessage.ChangedSection({ current }))
  )
)

export const Nav = Component.define({
  name: "Nav",
  scoped: false,
  model: Schema.Struct({ current: Schema.NullOr(SectionId), isOpen: Schema.Boolean }),
  message: NavMessage,
  elements: Html
}).make({
  init: () => ({ current: null, isOpen: false }),
  update: {
    ClickedToggle: (_model, _message, $) => $.evolve({ isOpen: (isOpen) => !isOpen }),
    ClickedSection: (_model, _message, $) => $.evolve({ isOpen: false }),
    PressedEscape: (_model, _message, $) =>
      $.evolve({ isOpen: false }).run(DomCommand.focus(Toggle, () => Component.noop)),
    ChangedSection: (_model, { current }, $) => $.evolve({ current })
  },
  subscriptions: (model) => [
    TrackSection,
    model.isOpen &&
    DomSubscription.onDocument("keydown", ({ key }) => key === "Escape" ? NavMessage.PressedEscape() : undefined)
  ],
  view: (model, h) => {
    const list = h.id("sections")
    const current = sections.find(({ id }) => id === model.current)
    return h.nav.class("nav").attr("aria-label", "On this page").children(
      h.p.class("nav-title").attr("aria-hidden", "true").children("On this page"),
      h.button.ref(Toggle).class("nav-toggle").attrs({
        type: "button",
        "aria-expanded": String(model.isOpen),
        "aria-controls": list
      }).onClick(NavMessage.ClickedToggle()).children(
        h.span.children("On this page"),
        " ",
        current && h.span.class("nav-current").children(current.label)
      ),
      h.ol.id(list).class("nav-list").children(
        ...sections.map(({ id, label }) =>
          h.li.key(id).children(
            h.a.class("nav-link").attrs({
              href: `#${id}`,
              "aria-current": id === model.current ? "location" : undefined
            }).onClick(NavMessage.ClickedSection()).children(label)
          )
        )
      )
    )
  }
})
