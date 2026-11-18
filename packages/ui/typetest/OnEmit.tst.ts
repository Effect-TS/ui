import type { Component, View } from "@effect/ui"
import { expect, it } from "tstyche"

type Renamed = { readonly _tag: "Renamed"; readonly name: string }
type Discarded = { readonly _tag: "Discarded" }
type Events = Renamed | Discarded

declare const Editor: Component.Mountable<{}, Events>
declare const Untagged: Component.Mountable<{}, { readonly name: string }>
declare const h: View.Helper<{ readonly title: string }, unknown>

it("narrows each onEmit handler to its event, but gives the callback the whole union", () => {
  Editor(h, {
    onEmit: {
      Renamed: (event) => {
        expect(event).type.toBe<Renamed>()
        return { title: event.name }
      },
      Discarded: (event) => {
        expect(event).type.toBe<Discarded>()
        return undefined
      }
    }
  })
  Editor(h, {
    onEmit: (event) => {
      expect(event).type.toBe<Events>()
      return undefined
    }
  })
})

it("requires exactly the child tags and checks each handler's result against the parent message", () => {
  const handlers = { Renamed: () => undefined, Discarded: () => undefined }
  Editor(h, {
    // @ts-expect-error Property 'Discarded' is missing
    onEmit: { Renamed: handlers.Renamed }
  })
  Editor(h, {
    onEmit: {
      ...handlers,
      // @ts-expect-error 'Saved' does not exist
      Saved: () => undefined
    }
  })
  Editor(h, {
    onEmit: {
      ...handlers,
      // @ts-expect-error Property 'title' is missing
      Renamed: () => ({ name: "foreign" })
    }
  })
  // @ts-expect-error Type '{}' is not assignable
  Untagged(h, { onEmit: {} })
})
