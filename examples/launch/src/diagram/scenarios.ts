import { Schema } from "effect"

export const architectureDescription =
  "Every Component has a Model, an update and a view of its own. Root renders A, and A renders A1 and A2. Props flow down and events flow up."

export const names = ["Root", "A", "A1", "A2"] as const

export const Name = Schema.Literals(names)
export type Name = typeof Name.Type

// What travels between two Components in one step: a Message on its
// way to an update, or a shared value handed down to a view.
export type Carries = "message" | "render"

export interface Move {
  readonly from: Name
  readonly to: Name
  readonly carries: Carries
}

export interface Step {
  // The Components the step happens in.
  readonly nodes: ReadonlyArray<Name>
  // One sentence, also used by /article.md and screen readers.
  readonly text: string
  // A word or two for step chips and arrow labels.
  readonly label: string
  // What travels during the step, in order.
  readonly moves: ReadonlyArray<Move>
  // The updates and views that run during the step.
  readonly updates: ReadonlyArray<Name>
  readonly views: ReadonlyArray<Name>
}

export interface Side {
  readonly subtitle: string
  readonly rootName: string
  readonly roles: Readonly<Record<Name, string>>
  readonly plain: ReadonlyArray<Name>
  readonly steps: (choice: Name) => ReadonlyArray<Step>
}

export interface Scenario {
  readonly label: string
  readonly choices: ReadonlyArray<Name>
  readonly side: Side
}

export const ScenarioName = Schema.Literals(["sharedState"])
export type ScenarioName = typeof ScenarioName.Type

export const displayName = (side: Side, name: Name) =>
  name === "Root" ? side.rootName : name

const step = (
  fields:
    & Pick<Step, "nodes" | "text" | "label">
    & Partial<Pick<Step, "moves" | "updates" | "views">>
): Step => ({
  moves: [],
  updates: [],
  views: [],
  ...fields
})

const go = (
  from: Name,
  to: Name,
  carries: Carries = "message"
): Move => ({ from, to, carries })

const sent = (sender: Name): Step =>
  step({
    nodes: [sender],
    text: `A click in ${sender}'s view produces a Message.`,
    label: "Click"
  })

const sharedState: Scenario = {
  label: "Changed by",
  choices: ["A1", "A2"],
  side: {
    subtitle: "A Provider's Model holds the shared value",
    rootName: "Provider",
    roles: {
      Root: "Owns the value",
      A: "Not involved",
      A1: "Reads it",
      A2: "Reads it"
    },
    plain: ["A"],
    steps: (reader) => [
      sent(reader),
      step({
        nodes: [reader, "Root"],
        text: `${reader}'s update sends a Message to the Provider.`,
        label: "To Provider",
        moves: [go(reader, "Root")],
        updates: [reader]
      }),
      step({
        nodes: ["Root"],
        text: "The Provider's update changes the value in its Model.",
        label: "Change",
        updates: ["Root"]
      }),
      step({
        nodes: ["A1", "A2"],
        text: "A1 and A2 read the value, so their views run again.",
        label: "Render",
        moves: [
          go("Root", "A1", "render"),
          go("Root", "A2", "render")
        ],
        views: ["A1", "A2"]
      })
    ]
  }
}

export const scenarios: Readonly<Record<ScenarioName, Scenario>> = {
  sharedState
}
