import type { FlowStep } from "#domain/FlowStep"
import type { Snippet } from "#domain/Snippet"
import type { FlowProps } from "./Flow.ts"

const plain = (text: string) => [{ text, color: "#000" }]

const snippet: Snippet = {
  name: "DialogPage.ts",
  lines: [plain("update: {"), plain("  RequestedOpenConfirm: (_model) => model"), plain("}")]
}

export const press: FlowStep = {
  kind: "message",
  at: "dialog",
  name: "ClickedTrigger",
  where: "/DialogPage/Dialog",
  caption: "You press the trigger.",
  starts: true
}

export const opened: FlowStep = {
  kind: "message",
  at: "page",
  name: "RequestedOpenConfirm",
  where: "/DialogPage",
  caption: "The page sets confirm to true.",
  line: "RequestedOpenConfirm:",
  page: ["confirm: true"]
}

export const props = (overrides: Partial<FlowProps> = {}): FlowProps => ({
  title: "Effect UI",
  files: [snippet],
  steps: [press, opened],
  page: { name: "DialogPage", note: "Owns whether the dialog is open", state: ["confirm: false"] },
  dialog: { name: "Dialog", note: "Owns focus", state: [] },
  empty: "Press Step to start.",
  ...overrides
})
