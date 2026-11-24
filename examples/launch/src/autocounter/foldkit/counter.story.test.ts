import { describe, expect, it } from "@effect/vitest"
import { Story } from "foldkit/test"
import { DelayReset, Message, update } from "./counter.ts"

describe("Foldkit 0.x counter", () => {
  it("resets after the delay", () => {
    Story.story(
      update,
      Story.given({ count: 5 }),
      Story.message(Message.ClickedResetAfterDelay()),
      Story.Command.expectExact(DelayReset),
      Story.Command.resolve(
        DelayReset,
        Message.CompletedDelayReset()
      ),
      Story.model((model) => {
        expect(model.count).toBe(0)
      })
    )
  })
})
