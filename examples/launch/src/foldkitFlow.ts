import { type FlowStep, step } from "#domain/FlowStep"

const wrapped = "update › GotConfirmMessage"
const animation = `${wrapped} › GotAnimationMessage`

const state = (isOpen: boolean, transition: string) => [`confirm.isOpen: ${isOpen}`, `confirm.animation: ${transition}`]

export const foldkitSteps: ReadonlyArray<FlowStep> = [
  step({
    kind: "message",
    at: "page",
    name: "ClickedOpenConfirm",
    where: "update",
    caption:
      "You press the trigger. The page's own message reaches its update, which runs Dialog.open on the Model it stores.",
    line: "ClickedOpenConfirm: () =>",
    page: state(true, "EnterStart")
  }),
  step({
    kind: "command",
    at: "dialog",
    move: "up",
    name: "ShowDialog, WaitForPaint",
    where: "Dialog.open",
    caption:
      "Dialog.open returns two Commands. The fold lifts them into the page's Message so the runtime can run them.",
    line: "update: Dialog.open"
  }),
  step({
    kind: "outmessage",
    at: "dialog",
    move: "up",
    name: "Opened",
    where: "Dialog.open",
    caption: "It also reports Opened. The page's fold handles it and changes nothing.",
    line: "Opened: () =>"
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "SucceededShowDialog",
    where: wrapped,
    caption:
      "ShowDialog's result enters the page's update wrapped in GotConfirmMessage. The fold unwraps it for Dialog.update.",
    line: "GotConfirmMessage: ({ message }) =>"
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "CompletedWaitForPaint",
    where: animation,
    caption: "The paint result arrives two wrappers deep. The Animation moves on and asks for WaitForAnimationSettled.",
    line: "GotConfirmMessage: ({ message }) =>",
    page: state(true, "EnterAnimating")
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "EndedAnimation",
    where: animation,
    caption: "The enter animation ended. The page stores the dialog's new state.",
    line: "GotConfirmMessage: ({ message }) =>",
    page: state(true, "Idle")
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "RequestedClose",
    where: wrapped,
    caption:
      "You press a close button. Its attributes send the Dialog's message, wrapped by toParentMessage, to the page's update.",
    line: "toParentMessage: (message) =>",
    page: state(false, "LeaveStart")
  }),
  step({
    kind: "outmessage",
    at: "dialog",
    move: "up",
    name: "Closed",
    where: "Dialog.update",
    caption: "Dialog.update reports Closed and asks for WaitForPaint. The page's fold changes nothing.",
    line: "Closed: () =>"
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "CompletedWaitForPaint",
    where: animation,
    caption:
      "The paint result arrives wrapped. The Animation reports StartedLeaveAnimating to the Dialog, which asks for WaitForAnimationSettled.",
    line: "GotConfirmMessage: ({ message }) =>",
    page: state(false, "LeaveAnimating")
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "EndedAnimation",
    where: animation,
    caption:
      "The leave animation ended. The Animation reports TransitionedOut to the Dialog, which asks for CloseDialog.",
    line: "GotConfirmMessage: ({ message }) =>",
    page: state(false, "Idle")
  }),
  step({
    kind: "message",
    at: "dialog",
    move: "down",
    name: "CompletedCloseDialog",
    where: wrapped,
    caption:
      "CloseDialog closed the <dialog> and unlocked the scroll. Its result goes through the page's update too, and changes nothing.",
    line: "GotConfirmMessage: ({ message }) =>"
  })
]
