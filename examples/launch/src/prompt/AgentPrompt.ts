import { Command, Component, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"

export const AgentPromptMessage = UiSchema.TaggedEnum({
  ClickedCopy: {},
  SucceededCopyPrompt: {},
  FailedCopyPrompt: {}
})

export const CopyPrompt = Command.make(
  "CopyPrompt",
  { args: { text: Schema.String } },
  ({ text }) =>
    Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
      Effect.as(AgentPromptMessage.SucceededCopyPrompt()),
      Effect.orElseSucceed(() =>
        AgentPromptMessage.FailedCopyPrompt()
      )
    )
)

const labels = {
  Idle: "Copy prompt",
  Copied: "Copied",
  Failed: "Couldn't copy"
} as const

export const AgentPrompt = Component.define({
  name: "AgentPrompt",
  props: Schema.Struct({
    title: Schema.String,
    prompt: Schema.String
  }),
  model: Schema.Struct({
    status: Schema.Literals(["Idle", "Copied", "Failed"])
  }),
  message: AgentPromptMessage,
  elements: Html
}).make({
  init: () => ({ status: "Idle" }),
  update: {
    ClickedCopy: ($) =>
      $.run(CopyPrompt.make({ text: $.props.prompt })),
    SucceededCopyPrompt: ($) => $.evolve({ status: "Copied" }),
    FailedCopyPrompt: ($) => $.evolve({ status: "Failed" })
  },
  view: (h, model) =>
    h.aside.class(
      "mx-auto mt-[1.1em] max-w-(--column) rounded-lg border",
      "border-border bg-muted p-4"
    ).attr("aria-label", h.props.title).children(
      h.div.class("flex items-center justify-between gap-3")
        .children(
          h.p.class("text-sm font-semibold").children(h.props.title),
          Button(h, { onPress: AgentPromptMessage.ClickedCopy() })
            .class(
              "min-w-[7.5rem] cursor-pointer rounded-md border",
              "border-border-strong bg-background px-3 py-1.5",
              "text-control font-medium transition-[border-color]",
              "hover:border-foreground"
            ).children(labels[model.status])
        ),
      h.p.class("mt-3 font-mono text-code wrap-anywhere").children(
        h.props.prompt
      )
    )
})
