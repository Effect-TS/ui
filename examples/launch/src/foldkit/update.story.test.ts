import { describe, expect, it } from "@effect/vitest"
import { Animation, Dialog } from "@foldkit/ui"
import { Story } from "foldkit/test"
import { foldkitSteps } from "../foldkitFlow.ts"
import { init } from "./init.ts"
import { Message } from "./message.ts"
import type { Model } from "./model.ts"
import { update } from "./update.ts"

const transition = (state: Model) => state.confirm.animation.transitionState

describe("Foldkit 0.x confirm dialog", () => {
  it("opens and closes with 8 messages through the page's update and 6 Commands", () => {
    Story.story(
      update,
      Story.given(init().model),
      Story.message(Message.ClickedOpenConfirm()),
      Story.expectNoOutMessage(),
      Story.model((state) => {
        expect(state.confirm.isOpen).toBe(true)
        expect(transition(state)).toBe("EnterStart")
      }),
      Story.Command.expectExact(Dialog.ShowDialog, Animation.WaitForPaint),
      Story.Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Story.Command.expectExact(Animation.WaitForPaint),
      Story.Command.resolve(Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint({ generation: 1 })),
      Story.model((state) => expect(transition(state)).toBe("EnterAnimating")),
      Story.Command.expectExact(Animation.WaitForAnimationSettled),
      Story.Command.resolve(Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation({ generation: 1 })),
      Story.model((state) => expect(transition(state)).toBe("Idle")),
      Story.Command.expectNone(),
      Story.message(Message.GotConfirmMessage({ message: Dialog.Message.RequestedClose() })),
      Story.model((state) => {
        expect(state.confirm.isOpen).toBe(false)
        expect(transition(state)).toBe("LeaveStart")
      }),
      Story.Command.expectExact(Animation.WaitForPaint),
      Story.Command.resolve(Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint({ generation: 2 })),
      Story.model((state) => expect(transition(state)).toBe("LeaveAnimating")),
      Story.Command.expectExact(Animation.WaitForAnimationSettled),
      Story.Command.resolve(Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation({ generation: 2 })),
      Story.Command.expectExact(Dialog.CloseDialog),
      Story.Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      Story.model((state) => expect(transition(state)).toBe("Idle"))
    )
  })

  it("figure follows the same messages", () => {
    expect(foldkitSteps.filter((step) => step.kind === "message").map((step) => step.name)).toEqual([
      "ClickedOpenConfirm",
      "SucceededShowDialog",
      "CompletedWaitForPaint",
      "EndedAnimation",
      "RequestedClose",
      "CompletedWaitForPaint",
      "EndedAnimation",
      "CompletedCloseDialog"
    ])
  })
})
