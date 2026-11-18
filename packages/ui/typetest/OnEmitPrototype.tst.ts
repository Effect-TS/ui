import type { Component, View } from "@effect/ui"
import { expect, it } from "tstyche"

type Printed = { readonly _tag: "toString"; readonly text: string }
type Events = Printed | { readonly _tag: "Saved" }
declare const Printable: Component.Mountable<{}, Printed>
declare const Mixed: Component.Mountable<{}, Events>
declare const Proto: Component.Mountable<{}, { readonly _tag: "__proto__" }>
declare const h: View.Helper<string, unknown>

it("rejects a reserved record whether the handler is supplied or inherited", () => {
  // @ts-expect-error 'toString' does not exist
  Printable<string>(h, { onEmit: { toString: (event: Printed) => event.text } })
  // @ts-expect-error Type '{}' is not assignable
  Printable(h, { onEmit: {} })
  // @ts-expect-error Expected 1-3 type arguments
  Printable<string, never, never, "toString">(h, { onEmit: {} })
  // @ts-expect-error 'Saved' does not exist
  Mixed(h, { onEmit: { Saved: () => "ok", toString: () => "ok" } })
})

it("rejects both literal spellings of a __proto__ handler", () => {
  // @ts-expect-error '__proto__' does not exist
  Proto(h, { onEmit: { __proto__: () => "ok" } })
  // @ts-expect-error '["__proto__"]' does not exist
  Proto(h, { onEmit: { ["__proto__"]: () => "ok" } })
})

it("can omit onEmit or migrate a reserved record to a callback", () => {
  Printable(h, {})
  Printable<string>(h, { onEmit: (event) => event.text })
  Mixed(h, {
    onEmit: (event) => {
      expect(event).type.toBe<Events>()
      return event._tag === "toString" ? event.text : undefined
    }
  })
})
