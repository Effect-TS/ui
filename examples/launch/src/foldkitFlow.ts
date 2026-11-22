import type { FlowStep } from "#domain/FlowStep"

const wrapped = "update › GotConfirmMessage"
const animation = `${wrapped} › GotAnimationMessage`

const state = (isOpen: boolean, transition: string) => [`confirm.isOpen: ${isOpen}`, `confirm.animation: ${transition}`]

export const foldkitInitial = state(false, "Idle")

const received = (
  name: string,
  where: string,
  caption: string,
  page?: ReadonlyArray<string>
): FlowStep => ({
  kind: "message",
  at: "dialog",
  move: "down",
  name,
  where,
  caption,
  line: "GotConfirmMessage: ({ message }) =>",
  page
})

export const foldkitSteps: ReadonlyArray<FlowStep> = [
  {
    kind: "message",
    at: "page",
    name: "ClickedOpenConfirm",
    where: "update",
    caption:
      "You press the trigger. The page's own message reaches its update, which runs Dialog.open on the Model it stores.",
    line: "ClickedOpenConfirm: () =>",
    page: state(true, "EnterStart")
  },
  {
    kind: "command",
    at: "dialog",
    move: "up",
    name: "ShowDialog, WaitForPaint",
    where: "Dialog.open",
    caption:
      "Dialog.open returns two Commands. The fold lifts them into the page's Message so the runtime can run them.",
    line: "update: Dialog.open"
  },
  {
    kind: "OutMessage",
    at: "dialog",
    move: "up",
    name: "Opened",
    where: "Dialog.open",
    caption: "It also reports Opened. The page's fold handles it and changes nothing.",
    line: "Opened: () =>"
  },
  received(
    "SucceededShowDialog",
    wrapped,
    "ShowDialog's result enters the page's update wrapped in GotConfirmMessage. The fold unwraps it for Dialog.update."
  ),
  received(
    "CompletedWaitForPaint",
    animation,
    "The paint result arrives two wrappers deep. The Animation moves on and asks for WaitForAnimationSettled.",
    state(true, "EnterAnimating")
  ),
  received(
    "EndedAnimation",
    animation,
    "The enter animation ended. The page stores the dialog's new state.",
    state(true, "Idle")
  ),
  {
    ...received(
      "RequestedClose",
      wrapped,
      "You press a close button. Its attributes send the Dialog's message, wrapped by toParentMessage, to the page's update.",
      state(false, "LeaveStart")
    ),
    line: "toParentMessage: (message) =>"
  },
  {
    kind: "OutMessage",
    at: "dialog",
    move: "up",
    name: "Closed",
    where: "Dialog.update",
    caption: "Dialog.update reports Closed and asks for WaitForPaint. The page's fold changes nothing.",
    line: "Closed: () =>"
  },
  received(
    "CompletedWaitForPaint",
    animation,
    "The paint result arrives wrapped. The Animation reports StartedLeaveAnimating to the Dialog, which asks for WaitForAnimationSettled.",
    state(false, "LeaveAnimating")
  ),
  received(
    "EndedAnimation",
    animation,
    "The leave animation ended. The Animation reports TransitionedOut to the Dialog, which asks for CloseDialog.",
    state(false, "Idle")
  ),
  received(
    "CompletedCloseDialog",
    wrapped,
    "CloseDialog closed the <dialog> and unlocked the scroll. Its result goes through the page's update too, and changes nothing."
  )
]
