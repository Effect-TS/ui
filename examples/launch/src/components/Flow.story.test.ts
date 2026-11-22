import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { opened, press, props } from "./Flow.fixtures.ts"
import { Flow, FlowMessage } from "./Flow.ts"

describe("Flow", () => {
  it.effect("records from a starting step, plays once, and restarts on a new open", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Flow, props({ steps: undefined }))
      assert.deepStrictEqual(s.subscriptions, ["trace"])
      s.send(FlowMessage.RecordedStep({ step: opened }))
      assert.deepStrictEqual(s.model.recorded, [])
      s.send(FlowMessage.RecordedStep({ step: press })).send(FlowMessage.RecordedStep({ step: opened }))
      assert.deepStrictEqual(s.model, { recorded: [press, opened], step: 0, playing: true })
      assert.deepStrictEqual(s.subscriptions, ["trace", "play"])
      s.send(FlowMessage.Ticked()).send(FlowMessage.Ticked())
      assert.deepStrictEqual({ step: s.model.step, playing: s.model.playing }, { step: 1, playing: false })
      assert.deepStrictEqual(s.subscriptions, ["trace"])
      s.send(FlowMessage.RecordedStep({ step: press }))
      assert.deepStrictEqual(s.model, { recorded: [press], step: 0, playing: true })
    }))
})
