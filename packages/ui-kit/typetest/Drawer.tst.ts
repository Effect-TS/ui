import { type Component, UiSchema, type View } from "@effect/ui"
import {
  type DialogDismissReason,
  Drawer,
  type DrawerDismissReason,
  type DrawerEvents,
  type DrawerSnapPoint,
  type DrawerSwipeDirection
} from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type DialogElement = Html.Element<Msg, never, Html.EventsOf<"dialog">, HTMLDialogElement, "dialog">

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

describe("Drawer", () => {
  it("takes a Dialog's props and its own, and its events carry their payloads", () => {
    const view = () => h.div
    Drawer(h, {
      props: {
        open: true,
        modal: "trap-focus",
        swipeDirection: "left",
        snapPoints: [0.5, 1, "320px", "20rem"],
        snapPoint: null,
        snapToSequentialPoints: true
      },
      onEmit: {
        Opened: ({ triggerId }) => {
          expect(triggerId).type.toBe<string | null>()
          return Msg.Clicked()
        },
        Dismissed: ({ reason }) => {
          expect(reason).type.toBe<DrawerDismissReason>()
          return undefined
        },
        Settled: ({ open }) => {
          expect(open).type.toBe<boolean>()
          return undefined
        },
        Snapped: ({ snapPoint }) => {
          expect(snapPoint).type.toBe<DrawerSnapPoint>()
          return undefined
        }
      },
      view
    })
    expect<Component.Headless.Requirements<typeof Drawer>>().type.toBe<never>()
    expect<DrawerSnapPoint>().type.toBe<string | number>()
    expect<Extract<DrawerEvents, { readonly _tag: "Snapped" }>["snapPoint"]>().type.toBe<string | number>()
  })

  it("rejects a bad prop", () => {
    const view = () => h.div
    expect(Drawer).type.not.toBeCallableWith(h, { props: {}, view })
    expect(Drawer).type.not.toBeCallableWith(h, { props: { open: true, swipeDirection: "sideways" }, view })
    expect(Drawer).type.not.toBeCallableWith(h, { props: { open: true, snapPoints: [true] }, view })
    expect(Drawer).type.not.toBeCallableWith(h, { props: { open: true, snapToSequentialPoints: "yes" }, view })
  })

  it("each part returns the builder it was given, and the portal and backdrop may draw nothing", () => {
    Drawer(h, {
      props: { open: false },
      view: (drawer) => {
        expect(drawer.popup(h.div)).type.toBe<Div>()
        expect(drawer.backdrop(h.div)).type.toBe<Div | undefined>()
        expect(drawer.viewport(h.div)).type.toBe<Div>()
        expect(drawer.content(h.div)).type.toBe<Div>()
        expect(drawer.portal(h.dialog)).type.toBe<DialogElement | undefined>()
        expect(drawer.swiping).type.toBe<boolean>()
        expect(drawer.swipeDirection).type.toBe<DrawerSwipeDirection>()
        expect(drawer.expanded).type.toBe<boolean>()
        expect(drawer.nestedDrawers).type.toBe<number>()
        expect(drawer.nestedDrawerSwiping).type.toBe<boolean>()
        expect(drawer.transitionStatus).type.toBe<"starting" | "ending" | null>()

        expect(drawer.popup).type.not.toBeCallableWith(h.span)
        expect(drawer.backdrop).type.not.toBeCallableWith(h.span)
        expect(drawer.content).type.not.toBeCallableWith(h.span)
        return h.div(drawer.portal(h.dialog)?.children(drawer.popup(h.div)))
      }
    })
  })

  it("a dismiss reason is a Dialog's or a swipe", () => {
    expect<DrawerDismissReason>().type.toBe<DialogDismissReason | "swipe">()
  })
})
