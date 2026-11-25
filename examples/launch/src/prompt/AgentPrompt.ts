import { Icon } from "#components/Icon"
import { Command, UiSchema } from "@effect/ui"
import { Button, Tooltip } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"

export const AgentPromptMessage = UiSchema.TaggedEnum({
  ClickedCopy: {},
  SucceededCopyPrompt: {},
  FailedCopyPrompt: {},
  ClearedCopyFeedback: {},
  RequestedOpenTip: {},
  RequestedCloseTip: {}
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

export const AgentPrompt = Html.component({
  name: "AgentPrompt",
  props: Schema.Struct({
    title: Schema.String,
    prompt: Schema.String
  }),
  model: Schema.Struct({
    status: Schema.Literals(["Idle", "Copied", "Failed"]),
    isTipOpen: Schema.Boolean
  }),
  message: AgentPromptMessage
}).make({
  init: () => ({ status: "Idle", isTipOpen: false }),
  update: {
    ClickedCopy: ($) =>
      $.run(CopyPrompt.make({ text: $.props.prompt })),
    SucceededCopyPrompt: ($) =>
      $.evolve({ status: "Copied" }).run(ClearCopyFeedback.make({})),
    FailedCopyPrompt: ($) =>
      $.evolve({ status: "Failed" }).run(ClearCopyFeedback.make({})),
    ClearedCopyFeedback: ($) => $.evolve({ status: "Idle" }),
    RequestedOpenTip: ($) => $.evolve({ isTipOpen: true }),
    RequestedCloseTip: ($) => $.evolve({ isTipOpen: false })
  },
  view: (h, model) =>
    h.aside.class(
      "mx-auto mt-[1.1em] max-w-(--column) rounded-lg border",
      "border-border bg-muted px-4 py-3"
    ).attr("aria-label", h.props.title).children(
      h.div.class("flex items-center justify-between gap-3")
        .children(
          h.p.class("text-sm font-semibold").children(h.props.title),
          Tooltip(h, {
            props: {
              // The result of a copy shows for as long as it is news,
              // wherever the pointer is.
              open: model.isTipOpen || model.status !== "Idle",
              delay: 200,
              closeOnClick: false,
              align: "end",
              sideOffset: 4
            },
            onEmit: {
              RequestedOpen: () =>
                AgentPromptMessage.RequestedOpenTip(),
              RequestedClose: () =>
                AgentPromptMessage.RequestedCloseTip()
            },
            view: (tooltip) =>
              h.div.class("shrink-0").children(
                Button(h, {
                  element: tooltip.trigger(h.button),
                  onPress: AgentPromptMessage.ClickedCopy()
                })
                  .attr("aria-label", labels[model.status])
                  .class(
                    "flex size-8 cursor-pointer items-center justify-center",
                    "rounded-sm text-muted-foreground transition-colors",
                    "hover:bg-wash hover:text-foreground"
                  ).children(
                    Icon(
                      h,
                      model.status === "Copied" ? "check" : "copy"
                    )
                  ),
                // A popover comes with a border, padding and a
                // background of its own.
                tooltip.positioner(
                  h.div.class(
                    "overflow-visible border-0 bg-transparent p-0"
                  )
                ).children(
                  tooltip.popup(
                    h.div.class(
                      "rounded-sm bg-foreground px-2 py-1 text-xs",
                      "whitespace-nowrap text-background"
                    )
                  ).children(labels[model.status])
                )
              )
          })
        ),
      h.p.class("mt-1 font-mono text-code wrap-anywhere").children(
        h.props.prompt
      ),
      h.span.class("sr-only").attr("role", "status").children(
        model.status === "Idle" ? "" : labels[model.status]
      )
    )
})
