import { Icon } from "#components/Icon"
import * as TabStrip from "#components/TabStrip"
import { Prompt } from "#domain/Prompt"
import { Command, UiSchema } from "@effect/ui"
import { Button, Tabs, Tooltip } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"

export const AgentPromptsMessage = UiSchema.TaggedEnum({
  SelectedPrompt: { label: Schema.String },
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
      Effect.as(AgentPromptsMessage.SucceededCopyPrompt()),
      Effect.orElseSucceed(() =>
        AgentPromptsMessage.FailedCopyPrompt()
      )
    )
)

export const ClearCopyFeedback = Command.make(
  "ClearCopyFeedback",
  { args: {} },
  () =>
    Effect.sleep("2 seconds").pipe(
      Effect.as(AgentPromptsMessage.ClearedCopyFeedback())
    )
)

const labels = {
  Idle: "Copy prompt",
  Copied: "Copied",
  Failed: "Couldn't copy"
} as const

const cell = "col-start-1 row-start-1 flex flex-col"

// The prompt has the panel to itself, so it is plain that it alone is
// copied. Where to paste it goes in a strip along the bottom.
const Text = <M>(h: Html.H<M>, { about, prompt }: Prompt) => [
  h.p.class("flex-1 px-4 py-3.5 font-mono text-code wrap-anywhere")
    .children(prompt),
  h.p.class(
    "border-t border-border bg-muted px-4 py-2.5 text-xs",
    "text-muted-foreground"
  ).children(about)
]

/**
 * The article's prompts for an AI agent, as tabs: one prompt shows at a
 * time, and the button copies the one that shows.
 */
export const AgentPrompts = Html.component({
  name: "AgentPrompts",
  props: Schema.Struct({ prompts: Schema.Array(Prompt) }),
  model: Schema.Struct({
    selected: Schema.String,
    status: Schema.Literals(["Idle", "Copied", "Failed"]),
    isTipOpen: Schema.Boolean
  }),
  message: AgentPromptsMessage
}).make({
  init: ($) =>
    $.set({
      selected: $.props.prompts[0]?.label ?? "",
      status: "Idle",
      isTipOpen: false
    }),
  update: {
    // A result on show is about the prompt that was copied.
    SelectedPrompt: ($, { label }) =>
      $.evolve({ selected: label, status: "Idle" }),
    ClickedCopy: ($) => {
      const shown = $.props.prompts.find((prompt) =>
        prompt.label === $.model.selected
      )
      return shown === undefined
        ? $.model
        : $.run(CopyPrompt.make({ text: shown.prompt }))
    },
    SucceededCopyPrompt: ($) =>
      $.evolve({ status: "Copied" }).run(ClearCopyFeedback.make({})),
    FailedCopyPrompt: ($) =>
      $.evolve({ status: "Failed" }).run(ClearCopyFeedback.make({})),
    ClearedCopyFeedback: ($) => $.evolve({ status: "Idle" }),
    RequestedOpenTip: ($) => $.evolve({ isTipOpen: true }),
    RequestedCloseTip: ($) => $.evolve({ isTipOpen: false })
  },
  view: (h, model) => {
    const { prompts } = h.props
    return Tabs(h, {
      key: "prompts",
      props: {
        value: model.selected,
        tabs: prompts.map(({ label }) => ({ value: label })),
        // The arrow keys show the next prompt as they move to its tab.
        activateOnFocus: true
      },
      onEmit: {
        Selected: ({ value }) =>
          AgentPromptsMessage.SelectedPrompt({ label: value })
      },
      view: (tabs) =>
        tabs.root(
          h.aside.class(
            "agent-prompts mx-auto mt-[1.1em] max-w-(--column)",
            "overflow-hidden rounded-lg border border-border bg-card"
          ).attr("aria-label", "Agent prompts")
        ).children(
          h.div.class(TabStrip.strip).children(
            tabs.list(
              h.div.class(TabStrip.list).attr("aria-label", "Prompt")
            ).children(
              tabs.indicator(h.span.class(TabStrip.indicator)),
              prompts.map(({ label }) =>
                tabs.tab({
                  element: h.button.key(label).class(TabStrip.tab),
                  value: label
                }).children(label)
              )
            ),
            Tooltip(h, {
              props: {
                // The result of a copy shows for as long as it is
                // news, wherever the pointer is.
                open: model.isTipOpen || model.status !== "Idle",
                delay: 200,
                closeOnClick: false,
                align: "end",
                sideOffset: 4
              },
              onEmit: {
                RequestedOpen: () =>
                  AgentPromptsMessage.RequestedOpenTip(),
                RequestedClose: () =>
                  AgentPromptsMessage.RequestedCloseTip()
              },
              view: (tooltip) =>
                h.div.class("shrink-0 self-center").children(
                  Button(h, {
                    element: tooltip.trigger(h.button),
                    onPress: AgentPromptsMessage.ClickedCopy()
                  })
                    .attr("aria-label", labels[model.status])
                    .class(
                      "flex size-8 cursor-pointer items-center",
                      "justify-center rounded-sm",
                      "text-muted-foreground transition-colors",
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
          h.div.class("grid").children(
            // Every prompt takes up room in the same cell, unseen, so
            // the card is as tall as its longest prompt and the page
            // below stays put when the tab changes.
            prompts.map((prompt) =>
              h.div.key(`room-${prompt.label}`).class(
                cell,
                "invisible"
              )
                .attr("aria-hidden", "true").children(Text(h, prompt))
            ),
            prompts.map((prompt) =>
              tabs.panel({
                element: h.div.key(prompt.label).class(
                  cell,
                  "data-[ending-style]:hidden"
                ),
                value: prompt.label
              })?.children(Text(h, prompt))
            )
          ),
          h.span.class("sr-only").attr("role", "status").children(
            model.status === "Idle" ? "" : labels[model.status]
          )
        )
    })
  }
})
