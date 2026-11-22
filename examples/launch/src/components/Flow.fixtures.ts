import { step } from "#domain/FlowStep"
import type { Snippet } from "#domain/Snippet"
import type { FlowProps } from "./Flow.ts"

const plain = (text: string) => [{ text, light: "#000", dark: "#fff" }]

export const snippet: Snippet = {
  name: "DialogPage.ts",
  lines: [plain("update: {"), plain("  OpenedConfirm: (_model) => model"), plain("}")]
}

export const press = step({
  kind: "message",
  at: "dialog",
  name: "ClickedTrigger",
  where: "/DialogPage/Dialog",
  caption: "You press the trigger.",
  starts: true
})

export const opened = step({
  kind: "message",
  at: "page",
  name: "OpenedConfirm",
  where: "/DialogPage",
  caption: "The page sets confirm to true.",
  line: "OpenedConfirm:",
  page: ["confirm: true"]
})

export const props = (overrides: Partial<FlowProps> = {}): FlowProps => ({
  title: "Effect UI",
  files: [snippet],
  steps: [press, opened],
  live: false,
  page: { name: "DialogPage", note: "Owns whether the dialog is open", state: ["confirm: false"] },
  dialog: { name: "Dialog", note: "Owns focus", state: [] },
  empty: "Press Step to start.",
  ...overrides
})
