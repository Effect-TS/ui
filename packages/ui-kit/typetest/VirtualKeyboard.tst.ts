import { Component, Mount, UiSchema, type View } from "@effect/ui"
import * as VirtualKeyboard from "@effect/ui-kit/VirtualKeyboard"
import type { Html } from "@effect/ui/html"
import type { Stream } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ ChangedBand: {} })
type Msg = typeof Msg.Type

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>
declare const sample: VirtualKeyboard.Sample

describe("VirtualKeyboard", () => {
  it("step takes a state and a sample, and returns the next state and a band or null", () => {
    const { band, state } = VirtualKeyboard.step(VirtualKeyboard.initialState(sample), sample)
    expect(state).type.toBe<VirtualKeyboard.State>()
    expect(band).type.toBe<VirtualKeyboard.Band | null>()
    expect<VirtualKeyboard.Band>().type.toBe<
      { readonly top: number; readonly bottom: number; readonly inset: number; readonly resizing: boolean }
    >()
  })

  it("watch is a Stream of bands with no requirements", () => {
    expect(VirtualKeyboard.watch(document.body)).type.toBe<Stream.Stream<VirtualKeyboard.Band | null>>()
    expect(VirtualKeyboard.textFieldOf(null)).type.toBe<HTMLElement | null>()
  })

  it("TrackKeyboard takes no args, reports bands, and goes on an HTML element once mapped to a message", () => {
    expect<Mount.Result<typeof VirtualKeyboard.TrackKeyboard>>().type.toBe<VirtualKeyboard.Band | null>()
    const mount = VirtualKeyboard.TrackKeyboard().pipe(Mount.map(() => Msg.ChangedBand()))
    h.div.onMount(mount)
    h.div.onMount(VirtualKeyboard.TrackKeyboard().pipe(Mount.map(() => Component.noop)))
    expect(h.div.onMount).type.not.toBeCallableWith(VirtualKeyboard.TrackKeyboard())
  })
})
