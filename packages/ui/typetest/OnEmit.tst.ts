import type { Component, View } from "@effect/ui"
import { expect, it } from "tstyche"

type Renamed = { readonly _tag: "Renamed"; readonly name: string }
type Discarded = { readonly _tag: "Discarded" }
type Events = Renamed | Discarded

declare const Editor: Component.Mountable<{}, Events>
declare const Untagged: Component.Mountable<{}, { readonly name: string }>
type OpenEvents = Discarded | { readonly _tag: `Changed:${string}` }
declare const OpenEditor: Component.Mountable<{}, OpenEvents>
declare const h: View.Helper<{ readonly title: string }, unknown>

declare const SharedPayload: Component.Mountable<{}, { readonly _tag: "Renamed" | "Discarded"; readonly name: string }>

it("narrows a shared payload with a union-valued tag", () => {
  SharedPayload(h, {
    onEmit: {
      Renamed: (event) => {
        expect(event._tag).type.toBe<"Renamed">()
        return { title: event.name }
      },
      Discarded: () => undefined
    }
  })
  SharedPayload(h, {
    onEmit: {
      // @ts-expect-error Property 'wrong' is missing
      Renamed: (event: { wrong: string }) => ({ title: event.wrong }),
      Discarded: () => undefined
    }
  })
})

it("requires a callback when any event tag is an open template", () => {
  OpenEditor(h, {
    onEmit: (event) => {
      expect(event).type.toBe<OpenEvents>()
      return undefined
    }
  })
  // @ts-expect-error 'Discarded' does not exist
  OpenEditor(h, { onEmit: { Discarded: () => undefined } })
})

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
