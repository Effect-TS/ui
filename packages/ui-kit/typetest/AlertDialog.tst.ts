import { expect, it } from "tstyche"

import { UiSchema, type View } from "@effect/ui"
import { AlertDialog } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

it("does not let the caller disable modality or enable outside dismissal", () => {
  const view = () => h.div
  expect(AlertDialog).type.toBeCallableWith(h, { props: { open: true }, view })
  expect(AlertDialog).type.not.toBeCallableWith(h, { props: { open: true, modal: false }, view })
  expect(AlertDialog).type.not.toBeCallableWith(h, { props: { open: true, disablePointerDismissal: false }, view })
})
