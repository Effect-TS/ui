import { srOnly, wide } from "#components/Classes"
import {
  Component,
  Subscription,
  UiSchema,
  type View
} from "@effect/ui"
import { Button, Select } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import {
  Name,
  names,
  ScenarioName,
  scenarios,
  type Side,
  SideId
} from "./scenarios.ts"

const DiagramModel = Schema.Struct({
  choice: Name,
  isSelectOpen: Schema.Boolean,
  foldkit: Schema.NullOr(Schema.Number),
  effect: Schema.NullOr(Schema.Number),
  isPlaying: Schema.Boolean,
  runs: Schema.Number
})
type DiagramModel = typeof DiagramModel.Type

export const DiagramMessage = UiSchema.TaggedEnum({
  RequestedOpenSelect: {},
  RequestedCloseSelect: {},
  PickedSelectChoice: { choice: Name },
  ClickedSend: {},
  ClickedStep: { side: SideId, index: Schema.Number },
  Ticked: {}
})

const last = (side: Side, choice: Name) =>
  side.steps(choice).length - 1

const advance = (side: Side, choice: Name, index: number | null) =>
  Math.min((index ?? -1) + 1, last(side, choice))

const Node = <M>(
  h: View.H<M>,
  side: Side,
  highlighted: ReadonlyArray<Name>,
  name: Name
) =>
  h.div.class(
    "group/node flex min-w-[min(100%,7.5rem)] flex-col items-center",
    "self-center rounded-md border border-border-strong",
    "bg-background px-[3px] py-1.5 text-center",
    side.plain.includes(name) && "border-dashed",
    "data-[active]:border-solid data-[active]:border-accent",
    "data-[active]:bg-accent data-[active]:text-accent-foreground",
    "motion-safe:transition-[background-color,border-color,color]",
    "motion-safe:duration-200"
  ).attr("data-active", highlighted.includes(name) ? "" : undefined)
    .children(
      h.span.class(
        "font-mono text-[0.8125rem]/[1.4] font-semibold",
        "font-features-[normal]"
      ).attr("data-part", "name").children(
        name === "Root" ? side.rootName : name
      ),
      h.span.class(
        "text-[0.625rem]/[1.3] text-muted-foreground",
        "group-data-[active]/node:text-inherit",
        "motion-safe:transition-[color] motion-safe:duration-200"
      ).children(side.roles[name])
    )

const Panel = (
  h: View.H<typeof DiagramMessage.Type>,
  side: Side,
  model: DiagramModel
) => {
  const active = model[side.id]
  const steps = side.steps(model.choice)
  const highlighted = active === null ? [] : steps[active].nodes
  return h.div.class(
    "@container/diagram-panel flex min-w-0 flex-col rounded-lg",
    "border border-border bg-muted p-4 diagram-medium:p-3"
  ).attrs({
    role: "group",
    "aria-label": side.title
  }).children(
    h.p.class("text-[0.9375rem]/[1.4] font-semibold text-pretty")
      .children(side.title),
    h.p.class(
      "mt-0.5 text-sm/[1.4] text-pretty text-muted-foreground"
    ).children(side.subtitle),
    h.div.class("mt-4 flex min-w-0 flex-col").attr(
      "aria-hidden",
      "true"
    ).children(
      Node(h, side, highlighted, "Root"),
      h.div.class("h-4.5 w-px self-center bg-border-strong"),
      Node(h, side, highlighted, "A"),
      h.div.class(
        "relative mx-[calc((100%-8px)/4)] h-4.5",
        "before:absolute before:top-0 before:bottom-1/2",
        "before:left-[calc(50%-0.5px)] before:border-l",
        "before:border-border-strong before:content-['']",
        "after:absolute after:inset-x-0 after:top-1/2 after:bottom-0",
        "after:border-x after:border-t after:border-border-strong",
        "after:content-['']"
      ),
      h.div.class(
        "grid grid-cols-2 gap-2 *:min-w-0 *:self-stretch",
        "panel-narrow:gap-1.5"
      ).children(
        Node(h, side, highlighted, "A1"),
        Node(h, side, highlighted, "A2")
      )
    ),
    h.ol.class("mt-4 flex flex-col gap-0.5").children(
      ...steps.map((step, index) =>
        h.li.key(String(index)).children(
          Button(h, {
            onPress: DiagramMessage.ClickedStep({
              side: side.id,
              index
            })
          }).class(
            "group/step grid w-full cursor-pointer items-start gap-2",
            "grid-cols-[1.5rem_minmax(0,1fr)] rounded-md border",
            "border-transparent px-2 py-1.5 text-start text-sm/[1.5]",
            "font-features-[normal] hover:border-border-strong",
            "aria-[current]:border-accent",
            "aria-[current]:bg-background",
            "motion-safe:transition-[background-color,border-color]",
            "motion-safe:duration-200"
          ).attr(
            "aria-current",
            index === active ? "step" : undefined
          ).children(
            h.span.class(
              "grid h-[1.5rem] place-items-center rounded-[50%]",
              "border border-border-strong pt-0.5 font-mono",
              "text-xs/none font-semibold",
              "group-aria-[current]/step:border-accent",
              "group-aria-[current]/step:bg-accent",
              "group-aria-[current]/step:text-accent-foreground",
              "motion-safe:transition-[background-color,border-color,color]",
              "motion-safe:duration-200"
            ).children(
              String(index + 1)
            ),
            h.span.children(step.text)
          )
        )
      )
    ),
    h.p.class(srOnly, "text-pretty").attr("aria-live", "polite")
      .children(
        active === null
          ? ""
          : `Step ${active + 1}: ${steps[active].text}`
      )
  )
}

export const Diagram = Component.define({
  name: "Diagram",
  props: Schema.Struct({ scenario: ScenarioName }),
  model: DiagramModel,
  message: DiagramMessage,
  elements: Html
}).make({
  init: () => ({
    choice: "A1",
    isSelectOpen: false,
    foldkit: null,
    effect: null,
    isPlaying: false,
    runs: 0
  }),
  update: {
    RequestedOpenSelect: ($) => $.evolve({ isSelectOpen: true }),
    RequestedCloseSelect: ($) => $.evolve({ isSelectOpen: false }),
    PickedSelectChoice: ($, { choice }) =>
      $.evolve({
        choice,
        foldkit: null,
        effect: null,
        isPlaying: false
      }),
    ClickedSend: ($) =>
      $.evolve({
        foldkit: 0,
        effect: 0,
        isPlaying: true,
        runs: $.model.runs + 1
      }),
    ClickedStep: ($, { side, index }) =>
      $.evolve({ [side]: index, isPlaying: false }),
    Ticked: ($) => {
      const [foldkit, effect] = scenarios[$.props.scenario].sides
      const { choice } = $.model
      return $.model.foldkit === last(foldkit, choice) &&
          $.model.effect === last(effect, choice)
        ? $.evolve({ foldkit: null, effect: null, isPlaying: false })
        : $.evolve({
          foldkit: advance(foldkit, choice, $.model.foldkit),
          effect: advance(effect, choice, $.model.effect)
        })
    }
  },
  subscriptions: ({ model }) => [
    model.isPlaying &&
    Subscription.make(
      "tick",
      model.runs,
      () =>
        Stream.tick("900 millis").pipe(
          Stream.drop(1),
          Stream.map(() => DiagramMessage.Ticked())
        )
    )
  ],
  view: (h, model) => {
    const scenario = scenarios[h.props.scenario]
    return h.figure.class(
      wide,
      "@container/diagram flex flex-col gap-4 [--wide:920px]"
    ).children(
      h.div.class("flex flex-wrap items-end gap-3").children(
        Select(h, {
          props: {
            open: model.isSelectOpen,
            value: model.choice,
            items: scenario.choices.map((value) => ({
              value,
              label: value
            })),
            alignItemWithTrigger: false
          },
          onEmit: {
            RequestedOpen: () => DiagramMessage.RequestedOpenSelect(),
            RequestedClose: () =>
              DiagramMessage.RequestedCloseSelect(),
            Picked: ({ value }) => {
              const choice = names.find((name) => name === value)
              return choice &&
                DiagramMessage.PickedSelectChoice({ choice })
            },
            Settled: () => undefined
          },
          view: (select) =>
            h.div.class("flex flex-col gap-1.5").children(
              select.label(h.div.class("text-sm font-medium"))
                .children(
                  scenario.label
                ),
              select.trigger(
                h.button.class(
                  "flex min-w-42 cursor-pointer items-center",
                  "justify-between gap-3 rounded-md border",
                  "border-border-strong bg-background px-3 py-1.5",
                  "font-mono text-control font-medium text-foreground",
                  "font-features-[normal]",
                  "hover:border-muted-foreground",
                  "focus-visible:outline-accent",
                  "data-[popup-open]:border-muted-foreground",
                  "motion-safe:transition-[border-color,box-shadow]",
                  "motion-safe:duration-150"
                )
              )
                .children(
                  select.value(h.span),
                  select.icon(
                    h.span.class(
                      "-mt-[3px] size-[7px] border-r-[1.5px]",
                      "border-b-[1.5px] border-muted-foreground",
                      "transform-[rotate(45deg)]"
                    )
                  )
                ),
              select.positioner(
                h.div.class("overflow-visible bg-transparent")
              )
                .children(
                  select.popup(
                    h.div.class(
                      "mt-1 min-w-(--anchor-width) rounded-lg border",
                      "border-border-strong bg-background p-1",
                      "[box-shadow:0_8px_24px_-8px_oklch(0%_0_0/0.2)]"
                    )
                  ).children(
                    ...scenario.choices.map((value) =>
                      select.item({
                        element: h.div.class(
                          "cursor-default rounded-[5px] px-2.5 py-1.5",
                          "font-mono text-control font-medium",
                          "text-foreground font-features-[normal]",
                          "not-first:mt-0.5 data-[highlighted]:bg-muted",
                          "data-[selected]:bg-wash"
                        ),
                        value
                      }).children(
                        select.itemText(h.div).children(value)
                      )
                    )
                  )
                )
            )
        }),
        Button(h, { onPress: DiagramMessage.ClickedSend() })
          .class(
            "cursor-pointer rounded-md border border-foreground",
            "bg-foreground px-3.5 py-1.5 text-control font-medium",
            "text-background font-features-[normal]",
            "hover:border-prose-foreground hover:bg-prose-foreground",
            "focus-visible:outline-accent active:translate-y-px",
            "motion-safe:transition-[background-color,border-color]",
            "motion-safe:duration-150"
          )
          .children(scenario.action)
      ),
      h.div.class(
        "grid grid-cols-2 gap-4 diagram-narrow:grid-cols-1"
      ).children(
        Panel(h, scenario.sides[0], model),
        Panel(h, scenario.sides[1], model)
      )
    )
  }
})
