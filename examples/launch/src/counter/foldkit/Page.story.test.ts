import { describe, expect, it } from "@effect/vitest"
import { Story } from "foldkit/test"
import * as Counter from "./Counter.ts"
import { init, Message, update } from "./Page.ts"

describe("Foldkit 0.x counter page", () => {
  it("routes a click on + through Page's update and keeps the count while hidden", () => {
    Story.story(
      update,
      Story.given(init().model),
      Story.message(Message.GotCounterMessage({ message: Counter.Message.ClickedIncrement() })),
      Story.model((model) => expect(model).toEqual({ isCounterShown: true, counter: { count: 1 } })),
      Story.message(Message.ClickedToggleCounter()),
      Story.message(Message.ClickedToggleCounter()),
      Story.model((model) => expect(model).toEqual({ isCounterShown: true, counter: { count: 1 } })),
      Story.Command.expectNone()
    )
  })
})
