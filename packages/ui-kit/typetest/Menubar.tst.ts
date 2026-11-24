import { UiSchema, type View } from "@effect/ui"
import { Menubar } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

it("takes the orientation, modal, disabled and loopFocus props, all optional", () => {
  const view = () => h.div
  expect(Menubar).type.toBeCallableWith(h, { view })
  expect(Menubar).type.toBeCallableWith(h, {
    props: {
      orientation: "vertical",
      modal: false,
      disabled: true,
      loopFocus: false
    },
    view
  })
  expect(Menubar).type.not.toBeCallableWith(h, {
    props: { orientation: "diagonal" },
    view
  })
})

it("draws its root and reads its state", () => {
  Menubar(h, {
    view: (menubar) => {
      expect(menubar.root).type.toBeCallableWith(h.div)
      expect(menubar.orientation).type.toBe<"horizontal" | "vertical">()
      expect(menubar.modal).type.toBe<boolean>()
      expect(menubar.disabled).type.toBe<boolean>()
      expect(menubar.hasSubmenuOpen).type.toBe<boolean>()
      return menubar.root(h.div)
    }
  })
})
