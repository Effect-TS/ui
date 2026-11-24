import { Component, Mount, UiSchema, View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { TestHost } from "@effect/ui/testing"
import { Context, type Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"
import {
  Dialog,
  type Item,
  Menu,
  type MenuEvents
} from "../../test/html/fixtures/headless.ts"

class Clock
  extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()(
    "Clock"
  )
{}
class Tracker
  extends Context.Service<Tracker, { readonly seen: Effect.Effect<void> }>()(
    "Tracker"
  )
{}

const Msg = UiSchema.TaggedEnum({
  Picked: { id: Schema.String },
  Clicked: {},
  Seen: {}
})
type Msg = typeof Msg.Type

const items: ReadonlyArray<Item> = [{ id: "a", label: "Archive" }]

// A headless component whose part has a mount that needs a service.
const Tick = Mount.make(
  "Tick",
  { args: {} },
  () => Clock.use((clock) => clock.now)
)
const MarkSeen = Mount.make(
  "MarkSeen",
  { args: {} },
  () => Tracker.use((tracker) => tracker.seen)
)
const Timed = Component.define({
  name: "Timed",
  model: Schema.Number,
  message: Schema.Number,
  elements: Html
}).make({
  init: () => 0,
  update: (_, now) => now,
  parts: (p, now) => ({
    now,
    clock: p.part("time", (b) => b.onMount(Tick()))
  })
})

// A part that takes either of two headings.
const Heading = Component.define({
  name: "Heading",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  parts: (p) => ({
    heading: p.part(["h2", "h3"], (b) => b.attr("role", "heading"))
  })
})

describe("headless components", () => {
  it("the consumer calls parts with no annotations", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Menu(h, {
          key: "actions",
          props: { items },
          onEmit: (event) => {
            expect(event).type.toBe<typeof MenuEvents.Type>()
            return Msg.Picked({ id: event.id })
          },
          view: (menu) => {
            expect(menu.visible).type.toBe<ReadonlyArray<Item>>()
            expect(menu.open).type.toBe<boolean>()
            // Args is fixed by the author: (b, item: Item).
            expect(menu.item).type.toBe<View.Part<"li", [item: Item], never>>()
            const trigger = menu.trigger(h.button.class("btn"))
            expect(trigger).type.toBe<
              Html.Element<
                Msg,
                never,
                Html.EventsOf<"button">,
                HTMLButtonElement,
                "button"
              >
            >()
            return h.div.class("toolbar").children(
              trigger.children("Actions"),
              menu.popup(h.div.class("menu")).children(
                menu.input(h.input.attr("aria-label", "Filter actions")),
                menu.visible.length === 0 && h.p("No actions found."),
                h.ul.children(menu.visible.map((item) => {
                  expect(item).type.toBe<Item>()
                  return menu.item(h.li.key(item.id), item).onClick(
                    Msg.Clicked()
                  ).children(item.label)
                }))
              )
            )
          }
        })
    })
  })

  it("a part returns the chain type, so the callable shorthand is gone", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Menu(h, {
          key: "actions",
          props: { items },
          view: (menu) => {
            // The root is callable and what a part returns isn't: menu.trigger(h.button)("Actions") doesn't compile.
            expect(menu.trigger(h.button)).type.toBe<
              Html.Element<
                Msg,
                never,
                Html.EventsOf<"button">,
                HTMLButtonElement,
                "button"
              >
            >()
            expect(menu.trigger(h.button)).type.not.toBeAssignableTo<
              (...children: ReadonlyArray<string>) => unknown
            >()
            expect(h.button).type.toBeCallableWith("Actions")
            // A part is tied to its tag name: a button part rejects a div, and the missing item is an error.
            expect(menu.trigger).type.not.toBeCallableWith(h.div)
            expect(menu.trigger).type.not.toBeCallableWith(h.el("button"))
            expect(menu.item).type.not.toBeCallableWith(h.li)
            expect(menu.item).type.not.toBeCallableWith(h.li, "a")
            // The tagless part takes any element.
            return Dialog(h, {
              key: "confirm",
              props: { label: "Confirm" },
              view: (dialog) =>
                dialog.popup(h.dialog).children(
                  dialog.close(menu.item(h.li, items[0]!)).children("Close")
                )
            })
          }
        })
    })
  })

  it("a part's mount requirements join the headless component's, and the closure's join the parent's", () => {
    expect<Component.Headless.Requirements<typeof Timed>>().type.toBe<Clock>()
    expect<Component.Headless.Requirements<typeof Menu>>().type.toBe<never>()
    // So do the requirements of a child the part adds, and of what its `forward` adds.
    const seen = () =>
      new Html.Element<never>("i").onMount(
        MarkSeen().pipe(Mount.map(() => Component.noop))
      )
    const Marked = Component.define({
      name: "Marked",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html
    })
      .make({
        init: () => null,
        update: ($) => $.model,
        parts: (p) => ({
          inside: p.part("button", (b) => b.children(seen())),
          around: p.part(
            "button",
            (b) =>
              b.forward((node) =>
                new Html.Element<never>("div").children(node, seen())
              )
          )
        })
      })
    expect<Component.Headless.Requirements<typeof Marked>>().type.toBe<
      Tracker
    >()
    const App = Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make(
      {
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Timed(h, {
            key: "t",
            view: (timed) =>
              timed.clock(h.time).onMount(
                MarkSeen().pipe(Mount.map(() => Msg.Seen()))
              )
                .children(String(timed.now))
          })
      }
    )
    expect<Component.Requirements<typeof App>>().type.toBe<Clock | Tracker>()
  })

  it("wrapped parts keep their requirements and the wrapper's call signature", () => {
    const Wrapped = Component.define({
      name: "Wrapped",
      model: Schema.Null,
      message: Schema.Number,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      parts: (p) => {
        const clock = p.part("time", (b) => b.onMount(Tick()))
        const seen = p.part(
          "div",
          (b, label: string) =>
            b.attr("aria-label", label).onMount(
              MarkSeen().pipe(Mount.map(() => Component.noop))
            )
        )
        return {
          clock: View.wrapPart(
            clock,
            <B extends View.PartTarget<"time">>(
              element: B
            ): ReturnType<B["attr"]> => clock(element)
          ),
          seen: View.wrapPart(seen, <B extends View.PartTarget<"div">>(
            { element, label }: { element: B; label: string }
          ): ReturnType<B["attr"]> => seen(element, label))
        }
      }
    })
    expect<Component.Headless.Requirements<typeof Wrapped>>().type.toBe<
      Clock | Tracker
    >()
    const App = Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make(
      {
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Wrapped(h, {
            key: "wrapped",
            view: (wrapped) => {
              expect(wrapped.clock).type.not.toBeCallableWith(h.div)
              expect(wrapped.seen).type.not.toBeCallableWith({ element: h.div })
              expect(wrapped.seen).type.not.toBeCallableWith({
                element: h.time,
                label: "Seen"
              })
              expect(wrapped.clock(h.time)).type.toBe<
                Html.Element<
                  Msg,
                  never,
                  Html.EventsOf<"time">,
                  HTMLTimeElement,
                  "time"
                >
              >()
              expect(wrapped.seen({ element: h.div, label: "Seen" })).type.toBe<
                Html.Element<
                  Msg,
                  never,
                  Html.EventsOf<"div">,
                  HTMLDivElement,
                  "div"
                >
              >()
              return h.div(
                wrapped.clock(h.time),
                wrapped.seen({ element: h.div, label: "Seen" })
              )
            }
          })
      }
    )
    expect<Component.Requirements<typeof App>>().type.toBe<Clock | Tracker>()
  })

  it("a part for one heading rejects another, and a part may list several tags", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Dialog(h, {
          key: "confirm",
          props: { label: "Confirm" },
          view: (dialog) => {
            // Both are HTMLHeadingElement: the check is by tag name, as at runtime.
            expect(dialog.title).type.toBeCallableWith(h.h2)
            expect(dialog.title).type.not.toBeCallableWith(h.h3)
            return Heading(h, {
              key: "h",
              view: (heading) => {
                expect(heading.heading).type.toBe<
                  View.Part<"h2" | "h3", [], never>
                >()
                expect(heading.heading).type.toBeCallableWith(h.h3)
                expect(heading.heading).type.not.toBeCallableWith(h.h4)
                return heading.heading(h.h2)
              }
            })
          }
        })
    })
  })

  it("a headless component isn't a Mountable", () => {
    expect(Menu).type.not.toBeAssignableTo<Component.Any>()
    expect(TestHost.mount).type.not.toBeCallableWith(Menu, { items })
    expect(Menu).type.toBeAssignableTo<Component.Headless.Any>()
    expect(Menu.definition).type.toBeAssignableTo<Component.Definition.Any>()
  })

  it("view is required for a headless child, and a normal child takes none", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        expect(Menu).type.not.toBeCallableWith(h, {
          key: "actions",
          props: { items }
        })
        return h.div()
      }
    })
  })
})
