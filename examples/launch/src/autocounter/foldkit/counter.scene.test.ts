// @vitest-environment happy-dom
import { describe, it } from "@effect/vitest"
import { Scene } from "foldkit/test"
import { DelayReset, Message, update, view } from "./counter.ts"

const delayedReset = () =>
  Scene.scene(
    { update, view },
    Scene.given({ count: 5 }),
    Scene.click(Scene.role("button", { name: "Reset in 1 second" })),
    Scene.Command.expectExact(DelayReset),
    Scene.Command.resolve(DelayReset, Message.CompletedDelayReset()),
    Scene.expect(Scene.role("status")).toHaveText("0")
  )

describe("Foldkit 0.x counter", () => {
  it("resets after the delay", delayedReset)
})
