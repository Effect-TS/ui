import { Command, Component, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"

export const AgentPromptMessage = UiSchema.TaggedEnum({
  ClickedCopy: {},
  SucceededCopyPrompt: {},
  FailedCopyPrompt: {},
  ClearedCopyFeedback: {}
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

export const ClearCopyFeedback = Command.make(
  "ClearCopyFeedback",
  { args: {} },
  () =>
    Effect.sleep("2 seconds").pipe(
      Effect.as(AgentPromptMessage.ClearedCopyFeedback())
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
    SucceededCopyPrompt: ($) =>
      $.evolve({ status: "Copied" }).run(ClearCopyFeedback.make({})),
    FailedCopyPrompt: ($) =>
      $.evolve({ status: "Failed" }).run(ClearCopyFeedback.make({})),
    ClearedCopyFeedback: ($) => $.evolve({ status: "Idle" })
  },
  view: (h, model) =>
    h.aside.class(
      "mx-auto mt-[1.1em] max-w-(--column) rounded-lg border",
      "border-border bg-muted px-4 py-3"
    ).attr("aria-label", h.props.title).children(
      h.div.class("flex items-center justify-between gap-3")
        .children(
          h.p.class("text-sm font-semibold").children(h.props.title),
          h.div.class("group relative shrink-0").children(
            Button(h, { onPress: AgentPromptMessage.ClickedCopy() })
              .attr("aria-label", labels[model.status])
              .class(
                "flex size-8 cursor-pointer items-center justify-center",
                "rounded-sm text-muted-foreground transition-colors",
                "hover:bg-wash hover:text-foreground"
              ).children(
                h.span.attr("aria-hidden", "true").class(
                  "block size-4 bg-current",
                  model.status === "Copied"
                    ? "mask-(--icon-check)"
                    : "mask-(--icon-copy)"
                )
              ),
            h.span.attr("aria-hidden", "true").class(
              "pointer-events-none absolute right-0 bottom-full mb-1",
              "rounded-sm bg-foreground px-2 py-1 text-xs",
              "whitespace-nowrap text-background transition-opacity",
              model.status === "Idle"
                ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                : "opacity-100"
            ).children(labels[model.status])
          )
        ),
      h.p.class("mt-1 font-mono text-code wrap-anywhere").children(
        h.props.prompt
      ),
      h.span.class("sr-only").attr("role", "status").children(
        model.status === "Idle" ? "" : labels[model.status]
      )
    )
})
