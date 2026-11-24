import {
  Component,
  Subscription,
  UiSchema,
  type View
} from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"

const names = ["Root", "A", "A1", "A2"] as const

const Name = Schema.Literals(names)
type Name = typeof Name.Type

interface Step {
  readonly nodes: ReadonlyArray<Name>
  readonly text: string
}

const SideId = Schema.Literals(["foldkit", "effect"])
type SideId = typeof SideId.Type

interface Side {
  readonly id: SideId
  readonly title: string
  readonly subtitle: string
  readonly submodels: ReadonlyArray<Name>
  readonly steps: (sender: Name) => ReadonlyArray<Step>
}

const sent = (sender: Name): Step => ({
  nodes: [sender],
  text: `${sender}'s view sends a Message.`
})

const rendered: Step = {
  nodes: names,
  text: "The view runs from the root with the new Model."
}

const foldkit: Side = {
  id: "foldkit",
  title: "Foldkit 0.x",
  subtitle: "One Model, held at the root",
  submodels: ["A", "A1", "A2"],
  steps: (sender) => {
    switch (sender) {
      case "Root":
        return [
          sent(sender),
          {
            nodes: ["Root"],
            text:
              "The root update receives it and returns a new Model."
          },
          rendered
        ]
      case "A":
        return [
          sent(sender),
          {
            nodes: ["Root"],
            text:
              "Root wraps it in a Message of its own, and the root update receives it."
          },
          {
            nodes: ["A"],
            text:
              "Root's update passes it to A's update, which returns a new value."
          },
          {
            nodes: ["Root"],
            text: "Root puts that value in the application Model."
          },
          rendered
        ]
      default:
        return [
          sent(sender),
          {
            nodes: ["A"],
            text: "A wraps it in a Message of its own."
          },
          {
            nodes: ["Root"],
            text:
              "Root wraps it again, and the root update receives it."
          },
          {
            nodes: ["A"],
            text: "Root's update passes it to A's update."
          },
          {
            nodes: [sender],
            text:
              `A's update passes it to ${sender}'s update, which returns a new value.`
          },
          {
            nodes: ["A"],
            text: "A puts that value in its part of the Model."
          },
          {
            nodes: ["Root"],
            text: "Root puts A's part in the application Model."
          },
          rendered
        ]
    }
  }
}

const effect: Side = {
  id: "effect",
  title: "Effect UI",
  subtitle: "One Model per Component",
  submodels: [],
  steps: (sender) => [
    sent(sender),
    {
      nodes: [sender],
      text: `The runtime delivers it to ${sender}'s update.`
    },
    {
      nodes: [sender],
      text:
        `The runtime stores ${sender}'s new Model, and ${sender}'s view runs.`
    }
  ]
}

const ArchitectureModel = Schema.Struct({
  sender: Name,
  foldkit: Schema.NullOr(Schema.Number),
  effect: Schema.NullOr(Schema.Number),
  isPlaying: Schema.Boolean,
  runs: Schema.Number
})
type ArchitectureModel = typeof ArchitectureModel.Type

export const ArchitectureMessage = UiSchema.TaggedEnum({
  ClickedSender: { sender: Name },
  ClickedStep: { side: SideId, index: Schema.Number },
  Ticked: {}
})

const last = (side: Side, sender: Name) =>
  side.steps(sender).length - 1

const advance = (side: Side, sender: Name, index: number | null) =>
  Math.min((index ?? -1) + 1, last(side, sender))

const Node = <M>(
  h: View.H<M>,
  side: Side,
  highlighted: ReadonlyArray<Name>,
  name: Name
) => {
  const isSubmodel = side.submodels.includes(name)
  return h.div.class(
    "arch2-node",
    isSubmodel && "arch2-node-plain",
    highlighted.includes(name) && "arch2-node-active"
  )
    .children(
      h.span.class("arch2-name").children(name),
      h.span.class("arch2-role").children(
        isSubmodel ? "Submodel" : "Model + update"
      )
    )
}

const Panel = (
  h: View.H<typeof ArchitectureMessage.Type>,
  side: Side,
  model: ArchitectureModel
) => {
  const active = model[side.id]
  const steps = side.steps(model.sender)
  const highlighted = active === null ? [] : steps[active].nodes
  return h.div.class("arch2-panel").attrs({
    role: "group",
    "aria-label": side.title
  }).children(
    h.p.class("arch2-title").children(side.title),
    h.p.class("arch2-subtitle").children(side.subtitle),
    h.div.class("arch2-tree").attr("aria-hidden", "true").children(
      Node(h, side, highlighted, "Root"),
      h.div.class("arch2-stem"),
      Node(h, side, highlighted, "A"),
      h.div.class("arch2-fork"),
      h.div.class("arch2-children").children(
        Node(h, side, highlighted, "A1"),
        Node(h, side, highlighted, "A2")
      )
    ),
    h.ol.class("arch2-steps").children(
      ...steps.map((step, index) =>
        h.li.key(String(index)).children(
          h.button.class("arch2-step").attrs({
            type: "button",
            "aria-current": index === active ? "step" : undefined
          }).onClick(
            ArchitectureMessage.ClickedStep({ side: side.id, index })
          ).children(
            h.span.class("arch2-step-number").children(
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

export const Architecture = Component.define({
  name: "Architecture",
  scoped: false,
  model: ArchitectureModel,
  message: ArchitectureMessage,
  elements: Html
}).make({
  init: () => ({
    sender: "A1",
    foldkit: null,
    effect: null,
    isPlaying: false,
    runs: 0
  }),
  update: {
    ClickedSender: ($, { sender }) =>
      $.set({
        sender,
        foldkit: 0,
        effect: 0,
        isPlaying: true,
        runs: $.model.runs + 1
      }),
    ClickedStep: ($, { side, index }) =>
      $.evolve({ [side]: index, isPlaying: false }),
    Ticked: ($) => {
      const { sender } = $.model
      return $.model.foldkit === last(foldkit, sender) &&
          $.model.effect === last(effect, sender)
        ? $.evolve({ foldkit: null, effect: null, isPlaying: false })
        : $.evolve({
          foldkit: advance(foldkit, sender, $.model.foldkit),
          effect: advance(effect, sender, $.model.effect)
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
          Stream.map(() => ArchitectureMessage.Ticked())
        )
    )
  ],
  view: (h, model) =>
    h.figure.class("arch2 wide").children(
      h.div.class("arch2-controls").attrs({
        role: "group",
        "aria-label": "Send a Message from"
      }).children(
        h.span.class("arch2-prompt").attr("aria-hidden", "true")
          .children("Send a Message from"),
        h.div.class("arch2-senders").children(
          ...names.map((sender) =>
            h.button
              .key(sender)
              .class("arch2-sender")
              .attr("type", "button")
              .onClick(ArchitectureMessage.ClickedSender({ sender }))
              .children(sender)
          )
        )
      ),
      h.div.class("arch2-panels").children(
        Panel(h, foldkit, model),
        Panel(h, effect, model)
      )
    )
})
