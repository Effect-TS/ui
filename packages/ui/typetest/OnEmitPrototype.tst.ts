import type { Component, View } from "@effect/ui"
import { expect, it } from "tstyche"

type Printed = { readonly _tag: "toString"; readonly text: string }
declare const Printable: Component.Mountable<{}, Printed>
declare const Mixed: Component.Mountable<{}, Printed | { readonly _tag: "Saved" }>
declare const h: View.Helper<string, unknown>

it("requires an explicit handler even when Object.prototype has a compatible method", () => {
  // @ts-expect-error Type '{}' is not assignable
  Printable(h, { onEmit: {} })
  // @ts-expect-error Type
  Mixed(h, { onEmit: { Saved: () => "ok" } })
  Printable(h, {
    onEmit: {
      toString: (event) => {
        expect(event).type.toBe<Printed>()
        return event.text
      }
    }
  })
})
