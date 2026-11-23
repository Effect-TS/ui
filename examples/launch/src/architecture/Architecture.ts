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

interface Side {
  readonly title: string
  readonly subtitle: string
  readonly owners: ReadonlyArray<Name>
  readonly steps: ReadonlyArray<Step>
}

const foldkit: Side = {
  title: "Foldkit 0.x",
  subtitle: "One Model, held at the root",
  owners: ["Root"],
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
  title: "Effect UI",
  subtitle: "One Model per Component",
  owners: names,
  steps: [
    { at: "leaf", text: (leaf) => `${leaf}'s view sends a Message.` },
    { at: "leaf", text: (leaf) => `The runtime delivers it to ${leaf}'s update.` },
    { at: "leaf", text: (leaf) => `The runtime stores ${leaf}'s new Model, and ${leaf}'s view runs.` }
  ]
}

const duration = Math.max(foldkit.steps.length, effect.steps.length)

const ArchitectureModel = Schema.Struct({ leaf: Schema.NullOr(Leaf), elapsed: Schema.Number })
type ArchitectureModel = typeof ArchitectureModel.Type

export const ArchitectureMessage = UiSchema.TaggedEnum({
  ClickedLeaf: { leaf: Leaf },
  Ticked: {}
})

const isPlaying = (model: ArchitectureModel) => model.leaf !== null && model.elapsed < duration

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

const progress = (side: Side, model: ArchitectureModel) => {
  const total = side.steps.length
  if (model.leaf === null) {
    return { sentence: "Send a Message to start.", status: `Step 0 of ${total}.`, highlighted: [], handled: 0 }
  }
  const leaf = model.leaf
  const index = Math.min(model.elapsed, total - 1)
  const isDone = model.elapsed >= total
  const handled = new Set(
    side.steps.slice(0, index + 1).filter((step) => step.at !== "all").flatMap((step) => nodesAt(step, leaf))
  )
  return {
    sentence: side.steps[index].text(leaf, branchOf(leaf)),
    status: `Step ${index + 1} of ${total}${isDone ? ", done." : "."}`,
    highlighted: isDone ? [] : nodesAt(side.steps[index], leaf),
    handled: handled.size
  }
}

const Node = <M>(h: View.H<M>, side: Side, highlighted: ReadonlyArray<Name>, name: Name) => {
  const owns = side.owners.includes(name)
  return h.div.class("arch2-node", !owns && "arch2-node-plain", highlighted.includes(name) && "arch2-node-active")
    .children(
      h.span.class("arch2-name").children(name),
      h.span.class("arch2-role").children(owns ? "Model + update" : "functions only")
    )
}

const Panel = <M>(h: View.H<M>, side: Side, model: ArchitectureModel) => {
  const { sentence, status, highlighted, handled } = progress(side, model)
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
    h.p.class("arch2-sentence").attr("aria-live", "polite").children(sentence),
    h.p.class("arch2-progress").children(
      h.span.children(status),
      " ",
      h.span.class("arch2-handled").children(`Parts that handled the Message: ${handled}`)
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
  init: () => ({ leaf: null, elapsed: 0 }),
  update: {
    ClickedLeaf: ($, { leaf }) => isPlaying($.model) ? $.model : $.evolve({ leaf, elapsed: 0 }),
    Ticked: ($) => $.evolve({ elapsed: (elapsed) => elapsed + 1 })
  },
  subscriptions: ({ model }) => [
    isPlaying(model) &&
    Subscription.make(
      "tick",
      Stream.tick("900 millis").pipe(Stream.drop(1), Stream.map(() => ArchitectureMessage.Ticked()))
    )
  ],
  view: (h, model) =>
    h.figure.class("arch2 wide").children(
      h.div.class("arch2-controls").attrs({ role: "group", "aria-label": "Send a Message from" }).children(
        h.span.class("arch2-prompt").attr("aria-hidden", "true").children("Send a Message from"),
        h.div.class("arch2-leaves").children(
          ...leaves.map((leaf) =>
            h.button.key(leaf).class("arch2-leaf").attr("type", "button").disabled(isPlaying(model)).onClick(
              ArchitectureMessage.ClickedLeaf({ leaf })
            ).children(leaf)
          )
        )
      ),
      h.div.class("arch2-panels").children(Panel(h, foldkit, model), Panel(h, effect, model))
    )
})
