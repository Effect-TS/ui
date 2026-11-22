import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { opened, press, props } from "./Flow.fixtures.ts"
import { Flow, FlowMessage } from "./Flow.ts"

describe("Flow", () => {
  it.effect("steps through a fixed sequence and goes back to any step", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Flow, props())
      assert.strictEqual(s.model.step, -1)
      s.send(FlowMessage.ClickedStep()).send(FlowMessage.ClickedStep()).send(FlowMessage.ClickedStep())
      assert.strictEqual(s.model.step, 1)
      s.send(FlowMessage.ClickedPill({ index: 0 }))
      assert.strictEqual(s.model.step, 0)
      s.send(FlowMessage.ClickedReset())
      assert.strictEqual(s.model.step, -1)
      assert.deepStrictEqual(s.subscriptions, [])
    }))

  it.effect("records from the press that opens the dialog, and plays once", () =>
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
    }))

  it.effect("a new open starts a new recording", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Flow, props({ steps: undefined }))
      s.send(FlowMessage.RecordedStep({ step: press }))
        .send(FlowMessage.RecordedStep({ step: opened }))
        .send(FlowMessage.ClickedPill({ index: 1 }))
        .send(FlowMessage.RecordedStep({ step: press }))
      assert.deepStrictEqual(s.model, { recorded: [press], step: 0, playing: true })
    }))
})
