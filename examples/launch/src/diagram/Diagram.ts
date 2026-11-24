import {
  Component,
  Subscription,
  UiSchema,
  type View
} from "@effect/ui"
import { Select } from "@effect/ui-kit"
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
  isOpen: Schema.Boolean,
  foldkit: Schema.NullOr(Schema.Number),
  effect: Schema.NullOr(Schema.Number),
  isPlaying: Schema.Boolean,
  runs: Schema.Number
})
type DiagramModel = typeof DiagramModel.Type

export const DiagramMessage = UiSchema.TaggedEnum({
  RequestedOpen: {},
  RequestedClose: {},
  PickedChoice: { choice: Name },
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
    "diagram-node",
    side.plain.includes(name) && "diagram-node-plain",
    highlighted.includes(name) && "diagram-node-active"
  )
    .children(
      h.span.class("diagram-name").children(
        name === "Root" ? side.rootName : name
      ),
      h.span.class("diagram-role").children(side.roles[name])
    )

const Panel = (
  h: View.H<typeof DiagramMessage.Type>,
  side: Side,
  model: DiagramModel
) => {
  const active = model[side.id]
  const steps = side.steps(model.choice)
  const highlighted = active === null ? [] : steps[active].nodes
  return h.div.class("diagram-panel").attrs({
    role: "group",
    "aria-label": side.title
  }).children(
    h.p.class("diagram-title").children(side.title),
    h.p.class("diagram-subtitle").children(side.subtitle),
    h.div.class("diagram-tree").attr("aria-hidden", "true").children(
      Node(h, side, highlighted, "Root"),
      h.div.class("diagram-stem"),
      Node(h, side, highlighted, "A"),
      h.div.class("diagram-fork"),
      h.div.class("diagram-children").children(
        Node(h, side, highlighted, "A1"),
        Node(h, side, highlighted, "A2")
      )
    ),
    h.ol.class("diagram-steps").children(
      ...steps.map((step, index) =>
        h.li.key(String(index)).children(
          h.button.class("diagram-step").attrs({
            type: "button",
            "aria-current": index === active ? "step" : undefined
          }).onClick(
            DiagramMessage.ClickedStep({ side: side.id, index })
          ).children(
            h.span.class("diagram-step-number").children(
              String(index + 1)
            ),
            h.span.children(step.text)
          )
        )
      )
    ),
    h.p.class("sr-only").attr("aria-live", "polite").children(
      active === null
        ? ""
        : `Step ${active + 1}: ${steps[active].text}`
    )
  )
}

export const Diagram = Component.define({
  name: "Diagram",
  scoped: false,
  props: Schema.Struct({ scenario: ScenarioName }),
  model: DiagramModel,
  message: DiagramMessage,
  elements: Html
}).make({
  init: () => ({
    choice: "A1",
    isOpen: false,
    foldkit: null,
    effect: null,
    isPlaying: false,
    runs: 0
  }),
  update: {
    RequestedOpen: ($) => $.evolve({ isOpen: true }),
    RequestedClose: ($) => $.evolve({ isOpen: false }),
    PickedChoice: ($, { choice }) =>
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
    return h.figure.class("diagram wide").children(
      h.div.class("diagram-controls").children(
        Select(h, {
          props: {
            open: model.isOpen,
            value: model.choice,
            items: scenario.choices.map((value) => ({
              value,
              label: value
            })),
            alignItemWithTrigger: false
          },
          onEmit: {
            RequestedOpen: () => DiagramMessage.RequestedOpen(),
            RequestedClose: () => DiagramMessage.RequestedClose(),
            Picked: ({ value }) => {
              const choice = names.find((name) => name === value)
              return choice && DiagramMessage.PickedChoice({ choice })
            },
            Settled: () => undefined
          },
          view: (select) =>
            h.div.class("diagram-select").children(
              select.label(h.div.class("diagram-label")).children(
                scenario.label
              ),
              select.trigger(h.button.class("diagram-trigger"))
                .children(
                  select.value(h.span),
                  select.icon(h.span.class("diagram-chevron"))
                ),
              select.positioner(h.div.class("diagram-positioner"))
                .children(
                  select.popup(h.div.class("diagram-popup")).children(
                    ...scenario.choices.map((value) =>
                      select.item({
                        element: h.div.class("diagram-item"),
                        value
                      }).children(
                        select.itemText(h.div).children(value)
                      )
                    )
                  )
                )
            )
        }),
        h.button
          .class("diagram-send")
          .attr("type", "button")
          .onClick(DiagramMessage.ClickedSend())
          .children(scenario.action)
      ),
      h.div.class("diagram-panels").children(
        Panel(h, scenario.sides[0], model),
        Panel(h, scenario.sides[1], model)
      )
    )
  }
})
