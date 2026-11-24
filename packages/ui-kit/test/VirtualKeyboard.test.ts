// @vitest-environment happy-dom
import { Component, Mount, UiSchema } from "@effect/ui"
import * as VirtualKeyboard from "@effect/ui-kit/VirtualKeyboard"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  byId,
  container,
  isViewportProbe,
  tick,
  visualViewport
} from "./utils/document.ts"

const closed: VirtualKeyboard.Sample = {
  layoutWidth: 400,
  layoutHeight: 800,
  visualHeight: 800,
  visualTop: 0,
  scale: 1,
  smallViewportHeight: 800,
  android: false,
  focused: true
}

const bandAfter = (
  samples: ReadonlyArray<Partial<VirtualKeyboard.Sample>>
): VirtualKeyboard.Band | null => {
  let state = VirtualKeyboard.initialState(closed)
  let band: VirtualKeyboard.Band | null = null
  for (const sample of samples) {
    ;({ state, band } = VirtualKeyboard.step(state, { ...closed, ...sample }))
  }
  return band
}

const over = { visualHeight: 500 }
const shrunk = { visualHeight: 500, layoutHeight: 500 }

describe("VirtualKeyboard.step", () => {
  it.each<{
    readonly name: string
    readonly samples: ReadonlyArray<Partial<VirtualKeyboard.Sample>>
    readonly band: VirtualKeyboard.Band | null
  }>([
    {
      name: "no keyboard while the viewports match",
      samples: [{}],
      band: null
    },
    {
      name:
        "a visual viewport over 60px shorter is a keyboard, its inset rounded up",
      samples: [{ visualHeight: 499.5 }],
      band: { top: 0, bottom: 499.5, inset: 301, resizing: false }
    },
    {
      name: "60px or less is a browser's toolbar",
      samples: [{ visualHeight: 740 }],
      band: null
    },
    {
      name: "no keyboard without a focused text field",
      samples: [{ ...over, focused: false }],
      band: null
    },
    {
      name: "no band while pinch-zoomed",
      samples: [{ ...over, scale: 2 }],
      band: null
    },
    {
      name: "the band moves with a panned visual viewport",
      samples: [{ ...over, visualTop: 120 }],
      band: { top: 120, bottom: 620, inset: 180, resizing: false }
    },
    {
      name:
        "a layout viewport that follows the keyboard gets no inset, and is resizing until it reaches it",
      samples: [{ ...over, smallViewportHeight: 500 }],
      band: { top: 0, bottom: 800, inset: 0, resizing: true }
    },
    {
      name:
        "a layout viewport that has reached the keyboard is no longer resizing",
      samples: [{ ...over, smallViewportHeight: 500 }, {
        ...shrunk,
        smallViewportHeight: 500
      }],
      band: { top: 0, bottom: 500, inset: 0, resizing: false }
    },
    {
      name:
        "a keyboard stays seen once the layout viewport shrinks to the visual one",
      samples: [over, shrunk],
      band: { top: 0, bottom: 500, inset: 0, resizing: false }
    },
    {
      name: "a visual viewport that changes by over 60px forgets it",
      samples: [over, shrunk, { visualHeight: 600, layoutHeight: 600 }],
      band: null
    },
    {
      name: "focus leaving the text fields forgets it",
      samples: [over, { ...shrunk, focused: false }, shrunk],
      band: null
    },
    {
      name: "both viewports shrinking together is a resize elsewhere",
      samples: [shrunk],
      band: null
    },
    {
      name:
        "on Android, a layout viewport over 60px below its tallest is a keyboard that resizes the page",
      samples: [{ ...shrunk, android: true }],
      band: { top: 0, bottom: 500, inset: 0, resizing: false }
    },
    {
      name: "on Android, a rotation is no keyboard",
      samples: [{ ...shrunk, layoutWidth: 800, android: true }],
      band: null
    }
  ])("$name", ({ band, samples }) => {
    assert.deepStrictEqual(bandAfter(samples), band)
  })
})

const Message = UiSchema.TaggedEnum({
  ChangedBand: { band: Schema.NullOr(VirtualKeyboard.Band) }
})

const Sheet = Component.define({
  name: "Sheet",
  model: Schema.Struct({
    bands: Schema.Array(Schema.NullOr(VirtualKeyboard.Band))
  }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ bands: [] }),
  update: {
    ChangedBand: ($, { band }) => ({ bands: [...$.model.bands, band] })
  },
  view: (h) =>
    h.div
      .id("sheet")
      .attr("style", "color:red")
      .onMount(
        VirtualKeyboard.TrackKeyboard().pipe(
          Mount.map((band) => Message.ChangedBand({ band }))
        )
      )
      .children(h.input.id("field"), h.button.id("done").children("Done"))
})

const probes = () =>
  Array.from(document.body.children).filter(isViewportProbe).length

describe("VirtualKeyboard.TrackKeyboard", { concurrent: false }, () => {
  it.effect("writes the inset while a focused field has the keyboard up, and removes it when it goes", () =>
    Effect.gen(function*() {
      const { visual } = yield* visualViewport
      const sheet = yield* Effect.scoped(Effect.gen(function*() {
        const app = yield* container
        const root = yield* BrowserHost.mountEffect(Sheet, {}, app)
        yield* tick
        const sheet = byId("sheet")
        const inset = () => sheet.style.getPropertyValue("--keyboard-inset")
        assert.deepStrictEqual(root.model()!.bands, [null])
        assert.strictEqual(inset(), "")

        byId("field").focus()
        visual.move({ height: 500 }, "resize")
        yield* tick
        assert.strictEqual(inset(), "300px")
        assert.strictEqual(sheet.style.getPropertyValue("color"), "red")

        visual.move({ offsetTop: 100 }, "scroll")
        yield* tick
        assert.strictEqual(inset(), "200px")
        assert.deepStrictEqual(root.model()!.bands, [
          null,
          { top: 0, bottom: 500, inset: 300, resizing: false },
          { top: 100, bottom: 600, inset: 200, resizing: false }
        ])

        byId("done").focus()
        yield* tick
        assert.strictEqual(inset(), "")
        assert.deepStrictEqual(root.model()!.bands.at(-1), null)

        byId("field").focus()
        visual.move({ height: 400 }, "resize")
        yield* tick
        assert.strictEqual(inset(), "300px")
        assert.strictEqual(probes(), 1)
        return sheet
      }))
      assert.strictEqual(sheet.style.getPropertyValue("--keyboard-inset"), "")
      assert.strictEqual(probes(), 0)
    }))
})
