import { type Component, UiSchema, type View } from "@effect/ui"
import {
  type DialogDismissReason,
  Drawer,
  type DrawerDismissReason,
  DrawerProvider,
  type DrawerSnapPoint,
  type DrawerSwipeDirection
} from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type Button = Html.Element<
  Msg,
  never,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type DialogElement = Html.Element<
  Msg,
  never,
  Html.EventsOf<"dialog">,
  HTMLDialogElement,
  "dialog"
>

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
        snapToSequentialPoints: true,
        virtualKeyboard: true
      },
      onEmit: {
        RequestedOpen: ({ reason, triggerId }) => {
          expect(triggerId).type.toBe<string | null>()
          expect(reason).type.toBe<"trigger-press" | "swipe">()
          return Msg.Clicked()
        },
        RequestedClose: ({ reason }) => {
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
    expect<DrawerDismissReason>().type.toBe<DialogDismissReason | "swipe">()
  })

  it("rejects a bad prop", () => {
    const view = () => h.div
    expect(Drawer).type.not.toBeCallableWith(h, { props: {}, view })
    expect(Drawer).type.not.toBeCallableWith(h, {
      props: { open: true, swipeDirection: "sideways" },
      view
    })
    expect(Drawer).type.not.toBeCallableWith(h, {
      props: { open: true, snapPoints: [true] },
      view
    })
    expect(Drawer).type.not.toBeCallableWith(h, {
      props: { open: true, snapToSequentialPoints: "yes" },
      view
    })
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
        expect(
          drawer.swipeArea({
            element: h.div,
            swipeDirection: "up",
            disabled: true
          })
        ).type.toBe<Div>()
        expect(drawer.swipeArea({ element: h.div })).type.toBe<Div>()
        expect(drawer.snapTrigger(h.button)).type.toBe<Button>()
        expect(drawer.snapStatus(h.div)).type.toBe<Div>()
        expect(drawer.swiping).type.toBe<boolean>()
        expect(drawer.swipeDirection).type.toBe<DrawerSwipeDirection>()
        expect(drawer.expanded).type.toBe<boolean>()
        expect(drawer.nestedDrawers).type.toBe<number>()
        expect(drawer.nestedDrawerSwiping).type.toBe<boolean>()
        expect(drawer.transitionStatus).type.toBe<
          "starting" | "ending" | null
        >()

        expect(drawer.popup).type.not.toBeCallableWith(h.span)
        expect(drawer.backdrop).type.not.toBeCallableWith(h.span)
        expect(drawer.content).type.not.toBeCallableWith(h.span)
        expect(drawer.snapTrigger).type.not.toBeCallableWith(h.div)
        expect(drawer.snapStatus).type.not.toBeCallableWith(h.span)
        expect(drawer.swipeArea).type.not.toBeCallableWith({ element: h.span })
        expect(drawer.swipeArea).type.not.toBeCallableWith({
          element: h.div,
          swipeDirection: "sideways"
        })
        return h.div(drawer.portal(h.dialog)?.children(drawer.popup(h.div)))
      }
    })
  })
})

describe("DrawerProvider", () => {
  it("its parts return the builder they were given", () => {
    DrawerProvider(h, {
      view: (drawerProvider) => {
        expect(drawerProvider.active).type.toBe<boolean>()
        expect(drawerProvider.indent(h.div.attr("id", "page"))).type.toBe<Div>()
        expect(drawerProvider.indentBackground(h.div)).type.toBe<Div>()
        expect(drawerProvider.indent).type.not.toBeCallableWith(h.span)
        expect(drawerProvider.indentBackground).type.not.toBeCallableWith(
          h.span
        )
        return h.div(
          drawerProvider.indentBackground(h.div),
          drawerProvider.indent(h.div)
        )
      }
    })
  })
})
