import { Component, Subscription, UiSchema } from "@effect/ui"
import { DomCommand, DomSubscription, Html } from "@effect/ui/html"
import { Array, Option, Schema, Stream } from "effect"

export const sections = [
  { id: "terms", label: "Terms", isNested: false },
  { id: "architecture", label: "Change: Component-based architecture", isNested: false },
  { id: "define", label: "A first Component", isNested: true },
  { id: "one-model", label: "One Model in Foldkit 0.x", isNested: true },
  { id: "components", label: "A Model per Component", isNested: true },
  { id: "split", label: "Separate functions", isNested: true },
  { id: "queries", label: "Change: Built-in queries", isNested: false },
  { id: "testing", label: "Change: Play tests", isNested: false },
  { id: "performance", label: "Change: Improved performance", isNested: false },
  { id: "more", label: "More changes", isNested: false },
  { id: "carries-over", label: "Unchanged: Values, features and guarantees", isNested: false },
  { id: "next", label: "You can keep building on Foldkit 0.x", isNested: false }
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
    ClickedToggle: ($) => $.evolve({ isOpen: (isOpen) => !isOpen }),
    ClickedSection: ($) => $.evolve({ isOpen: false }),
    PressedEscape: ($) => $.evolve({ isOpen: false }).run(DomCommand.focus(Toggle, () => Component.noop)),
    ChangedSection: ($, { current }) => $.evolve({ current })
  },
  subscriptions: ({ model }) => [
    TrackSection,
    model.isOpen &&
    DomSubscription.onDocument("keydown", ({ key }) => key === "Escape" ? NavMessage.PressedEscape() : undefined)
  ],
  view: (h, model) => {
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
        ...sections.map(({ id, label, isNested }) =>
          h.li.key(id).children(
            h.a.class("nav-link", isNested && "nav-nested").attrs({
              href: `#${id}`,
              "aria-current": id === model.current ? "location" : undefined
            }).onClick(NavMessage.ClickedSection()).children(label)
          )
        )
      )
    )
  }
})
