import { Component, Subscription, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"

const leaves = ["A1", "A2", "B1", "B2"] as const

const Leaf = Schema.Literals(leaves)
type Leaf = typeof Leaf.Type

type Branch = "A" | "B"
type Name = "Root" | Branch | Leaf

const tree: ReadonlyArray<{ readonly name: Branch; readonly leaves: ReadonlyArray<Leaf> }> = [
  { name: "A", leaves: ["A1", "A2"] },
  { name: "B", leaves: ["B1", "B2"] }
]

const names: ReadonlyArray<Name> = ["Root", ...tree.flatMap((branch) => [branch.name, ...branch.leaves])]

const branchOf = (leaf: Leaf): Branch => tree.find((branch) => branch.leaves.includes(leaf))!.name

interface Step {
  readonly at: "leaf" | "branch" | "root" | "all"
  readonly text: (leaf: Leaf, branch: Branch) => string
}

const SideId = Schema.Literals(["foldkit", "effect"])
type SideId = typeof SideId.Type

interface Side {
  readonly id: SideId
  readonly title: string
  readonly subtitle: string
  readonly submodels: ReadonlyArray<Name>
  readonly steps: ReadonlyArray<Step>
}

const foldkit: Side = {
  id: "foldkit",
  title: "Foldkit 0.x",
  subtitle: "One Model, held at the root",
  submodels: names.filter((name) => name !== "Root"),
  steps: [
    { at: "leaf", text: (leaf) => `${leaf}'s view sends a Message.` },
    { at: "branch", text: (_leaf, branch) => `${branch} wraps it in a Message of its own.` },
    { at: "root", text: () => "Root wraps it again, and the root update receives it." },
    { at: "branch", text: (_leaf, branch) => `Root's update passes it to ${branch}'s update.` },
    {
      at: "leaf",
      text: (leaf, branch) => `${branch}'s update passes it to ${leaf}'s update, which returns a new value.`
    },
    { at: "branch", text: (_leaf, branch) => `${branch} puts that value in its part of the Model.` },
    { at: "root", text: (_leaf, branch) => `Root puts ${branch}'s part in the application Model.` },
    { at: "all", text: () => "The view runs from the root with the new Model." }
  ]
}

const effect: Side = {
  id: "effect",
  title: "Effect UI",
  subtitle: "One Model per Component",
  submodels: [],
  steps: [
    { at: "leaf", text: (leaf) => `${leaf}'s view sends a Message.` },
    { at: "leaf", text: (leaf) => `The runtime delivers it to ${leaf}'s update.` },
    { at: "leaf", text: (leaf) => `The runtime stores ${leaf}'s new Model, and ${leaf}'s view runs.` }
  ]
}

const ArchitectureModel = Schema.Struct({
  leaf: Leaf,
  foldkit: Schema.NullOr(Schema.Number),
  effect: Schema.NullOr(Schema.Number),
  isPlaying: Schema.Boolean,
  runs: Schema.Number
})
type ArchitectureModel = typeof ArchitectureModel.Type

export const ArchitectureMessage = UiSchema.TaggedEnum({
  ClickedLeaf: { leaf: Leaf },
  ClickedStep: { side: SideId, index: Schema.Number },
  Ticked: {}
})

const nodesAt = (step: Step, leaf: Leaf): ReadonlyArray<Name> => {
  switch (step.at) {
    case "leaf":
      return [leaf]
    case "branch":
      return [branchOf(leaf)]
    case "root":
      return ["Root"]
    case "all":
      return names
  }
}

const advance = (side: Side, index: number | null) => Math.min((index ?? -1) + 1, side.steps.length - 1)

const Node = <M>(h: View.H<M>, side: Side, highlighted: ReadonlyArray<Name>, name: Name) => {
  const isSubmodel = side.submodels.includes(name)
  return h.div.class("arch2-node", isSubmodel && "arch2-node-plain", highlighted.includes(name) && "arch2-node-active")
    .children(
      h.span.class("arch2-name").children(name),
      h.span.class("arch2-role").children(isSubmodel ? "Submodel" : "Model + update")
    )
}

const Panel = (h: View.H<typeof ArchitectureMessage.Type>, side: Side, model: ArchitectureModel) => {
  const active = model[side.id]
  const parent = branchOf(model.leaf)
  const highlighted = active === null ? [] : nodesAt(side.steps[active], model.leaf)
  return h.div.class("arch2-panel").attrs({ role: "group", "aria-label": side.title }).children(
    h.p.class("arch2-title").children(side.title),
    h.p.class("arch2-subtitle").children(side.subtitle),
    h.div.class("arch2-tree").attr("aria-hidden", "true").children(
      Node(h, side, highlighted, "Root"),
      h.div.class("arch2-fork"),
      h.div.class("arch2-children").children(
        ...tree.map((branch) =>
          h.div.class("arch2-branch").key(branch.name).children(
            Node(h, side, highlighted, branch.name),
            h.div.class("arch2-fork"),
            h.div.class("arch2-children").children(
              ...branch.leaves.map((leaf) => Node(h, side, highlighted, leaf).key(leaf))
            )
          )
        )
      )
    ),
    h.ol.class("arch2-steps").children(
      ...side.steps.map((step, index) =>
        h.li.key(String(index)).children(
          h.button.class("arch2-step").attrs({
            type: "button",
            "aria-current": index === active ? "step" : undefined
          }).onClick(ArchitectureMessage.ClickedStep({ side: side.id, index })).children(
            h.span.class("arch2-step-number").children(String(index + 1)),
            h.span.children(step.text(model.leaf, parent))
          )
        )
      )
    ),
    h.p.class("sr-only").attr("aria-live", "polite").children(
      active === null ? "" : `Step ${active + 1}: ${side.steps[active].text(model.leaf, parent)}`
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
  init: () => ({ leaf: "A1", foldkit: null, effect: null, isPlaying: false, runs: 0 }),
  update: {
    ClickedLeaf: ($, { leaf }) => $.set({ leaf, foldkit: 0, effect: 0, isPlaying: true, runs: $.model.runs + 1 }),
    ClickedStep: ($, { side, index }) => $.evolve({ [side]: index, isPlaying: false }),
    Ticked: ($) => {
      const next = { foldkit: advance(foldkit, $.model.foldkit), effect: advance(effect, $.model.effect) }
      return $.evolve({
        ...next,
        isPlaying: next.foldkit < foldkit.steps.length - 1 || next.effect < effect.steps.length - 1
      })
    }
  },
  subscriptions: ({ model }) => [
    model.isPlaying &&
    Subscription.make(
      "tick",
      model.runs,
      () => Stream.tick("900 millis").pipe(Stream.drop(1), Stream.map(() => ArchitectureMessage.Ticked()))
    )
  ],
  view: (h, model) =>
    h.figure.class("arch2 wide").children(
      h.div.class("arch2-controls").attrs({ role: "group", "aria-label": "Send a Message from" }).children(
        h.span.class("arch2-prompt").attr("aria-hidden", "true").children("Send a Message from"),
        h.div.class("arch2-leaves").children(
          ...leaves.map((leaf) =>
            h.button.key(leaf).class("arch2-leaf").attrs({
              type: "button",
              "aria-pressed": String(leaf === model.leaf)
            }).onClick(ArchitectureMessage.ClickedLeaf({ leaf })).children(leaf)
          )
        )
      ),
      h.div.class("arch2-panels").children(Panel(h, foldkit, model), Panel(h, effect, model))
    )
})
