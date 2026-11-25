import { Schema } from "effect"

export const names = ["Root", "A", "A1", "A2"] as const

export const Name = Schema.Literals(names)
export type Name = typeof Name.Type

// What travels between two Components in one step: a Message on its
// way to an update, a value on its way back up, or a value handed
// down to a view.
export type Carries = "message" | "value" | "render"

export interface Move {
  readonly from: Name
  readonly to: Name
  readonly carries: Carries
}

// What the step is holding, outermost first: a Message and the
// Messages it's wrapped in, a Model and the Models it sits in, or the
// shared value.
export interface Payload {
  readonly kind: "message" | "model" | "value"
  readonly layers: ReadonlyArray<string>
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
  readonly payload: Payload
}

export const SideId = Schema.Literals(["foldkit", "effect"])
export type SideId = typeof SideId.Type

export interface Side {
  readonly id: SideId
  readonly title: string
  readonly subtitle: string
  readonly rootName: string
  readonly roles: Readonly<Record<Name, string>>
  readonly plain: ReadonlyArray<Name>
  readonly steps: (choice: Name) => ReadonlyArray<Step>
}

export interface Scenario {
  readonly label: string
  readonly action: string
  // The verb for a sender, as in "A1 sends" or "A1 changes it".
  readonly verb: string
  readonly choices: ReadonlyArray<Name>
  readonly sides: readonly [Side, Side]
}

export const ScenarioName = Schema.Literals([
  "messages",
  "sharedState"
])
export type ScenarioName = typeof ScenarioName.Type

export const displayName = (side: Side, name: Name) =>
  name === "Root" ? side.rootName : name

const step = (
  fields:
    & Pick<Step, "nodes" | "text" | "label" | "payload">
    & Partial<Pick<Step, "moves" | "updates" | "views">>
): Step => ({ moves: [], updates: [], views: [], ...fields })

const go = (
  from: Name,
  to: Name,
  carries: Carries = "message"
): Move => ({ from, to, carries })

const message = (...layers: ReadonlyArray<string>): Payload => ({
  kind: "message",
  layers
})

const model = (...layers: ReadonlyArray<string>): Payload => ({
  kind: "model",
  layers
})

const value: Payload = { kind: "value", layers: ["count"] }

// The Message a Submodel's parent wraps it in.
const got = (name: Name) => `Got${name}`

const sent = (sender: Name, payload: Payload): Step =>
  step({
    nodes: [sender],
    text: `${sender}'s view sends a Message.`,
    label: "Send",
    payload
  })

const renderDown: ReadonlyArray<Move> = [
  go("Root", "A", "render"),
  go("A", "A1", "render"),
  go("A", "A2", "render")
]

const rendered = (payload: Payload): Step =>
  step({
    nodes: names,
    text: "The view runs from the root with the new Model.",
    label: "Render",
    moves: renderDown,
    views: names,
    payload
  })

const clicked = "Clicked"

const messages: Scenario = {
  label: "Message destination",
  action: "Send Message",
  verb: "sends",
  choices: names,
  sides: [
    {
      id: "foldkit",
      title: "Foldkit 0.x",
      subtitle: "One Model, held at the root",
      rootName: "Root",
      roles: {
        Root: "Model + update",
        A: "Submodel",
        A1: "Submodel",
        A2: "Submodel"
      },
      plain: ["A", "A1", "A2"],
      steps: (destination) => {
        switch (destination) {
          case "Root":
            return [
              sent(destination, message(clicked)),
              step({
                nodes: ["Root"],
                text:
                  "The root update receives it and returns a new Model.",
                label: "Update",
                updates: ["Root"],
                payload: message(clicked)
              }),
              rendered(model("Model"))
            ]
          case "A":
            return [
              sent(destination, message(clicked)),
              step({
                nodes: ["Root"],
                text:
                  "Root wraps it in a Message of its own, and the root update receives it.",
                label: "Wrap",
                moves: [go("A", "Root")],
                updates: ["Root"],
                payload: message(got("A"), clicked)
              }),
              step({
                nodes: ["A"],
                text:
                  "Root's update passes it to A's update, which returns a new value.",
                label: "Pass down",
                moves: [go("Root", "A")],
                updates: ["A"],
                payload: message(clicked)
              }),
              step({
                nodes: ["Root"],
                text:
                  "Root puts that value in the application Model.",
                label: "Store",
                moves: [go("A", "Root", "value")],
                payload: model("Model", "A")
              }),
              rendered(model("Model", "A"))
            ]
          default:
            return [
              sent(destination, message(clicked)),
              step({
                nodes: ["A"],
                text: "A wraps it in a Message of its own.",
                label: "Wrap",
                moves: [go(destination, "A")],
                payload: message(got(destination), clicked)
              }),
              step({
                nodes: ["Root"],
                text:
                  "Root wraps it again, and the root update receives it.",
                label: "Wrap",
                moves: [go("A", "Root")],
                updates: ["Root"],
                payload: message(got("A"), got(destination), clicked)
              }),
              step({
                nodes: ["A"],
                text: "Root's update passes it to A's update.",
                label: "Pass down",
                moves: [go("Root", "A")],
                updates: ["A"],
                payload: message(got(destination), clicked)
              }),
              step({
                nodes: [destination],
                text:
                  `A's update passes it to ${destination}'s update, which returns a new value.`,
                label: "Pass down",
                moves: [go("A", destination)],
                updates: [destination],
                payload: message(clicked)
              }),
              step({
                nodes: ["A"],
                text: "A puts that value in its part of the Model.",
                label: "Store",
                moves: [go(destination, "A", "value")],
                payload: model("A", destination)
              }),
              step({
                nodes: ["Root"],
                text: "Root puts A's part in the application Model.",
                label: "Store",
                moves: [go("A", "Root", "value")],
                payload: model("Model", "A", destination)
              }),
              rendered(model("Model", "A", destination))
            ]
        }
      }
    },
    {
      id: "effect",
      title: "Effect UI",
      subtitle: "One Model per Component",
      rootName: "Root",
      roles: {
        Root: "Model + update",
        A: "Model + update",
        A1: "Model + update",
        A2: "Model + update"
      },
      plain: [],
      steps: (destination) => [
        sent(destination, message(clicked)),
        step({
          nodes: [destination],
          text: `The runtime delivers it to ${destination}'s update.`,
          label: "Deliver",
          updates: [destination],
          payload: message(clicked)
        }),
        step({
          nodes: [destination],
          text:
            `The runtime stores ${destination}'s new Model, and ${destination}'s view runs.`,
          label: "Render",
          views: [destination],
          payload: model(destination)
        })
      ]
    }
  ]
}

const add = "ClickedAdd"
const request = "RequestedAddItem"

const sharedState: Scenario = {
  label: "Changed by",
  action: "Change the shared value",
  verb: "changes it",
  choices: ["A1", "A2"],
  sides: [
    {
      id: "foldkit",
      title: "Foldkit 0.x",
      subtitle: "The shared value lives in the root Model",
      rootName: "Root",
      roles: {
        Root: "Owns the value",
        A: "Passes it down",
        A1: "Reads it",
        A2: "Reads it"
      },
      plain: [],
      steps: (reader) => [
        sent(reader, message(add)),
        step({
          nodes: ["A", "Root"],
          text:
            "A and Root wrap it, and the root update receives it.",
          label: "Wrap",
          moves: [go(reader, "A"), go("A", "Root")],
          updates: ["Root"],
          payload: message(got("A"), got(reader), add)
        }),
        step({
          nodes: ["A", reader],
          text:
            `Root's update passes it through A's update to ${reader}'s update.`,
          label: "Pass down",
          moves: [go("Root", "A"), go("A", reader)],
          updates: ["A", reader],
          payload: message(add)
        }),
        step({
          nodes: [reader],
          text:
            `${reader} doesn't own the value, so its update returns an OutMessage.`,
          label: "OutMessage",
          payload: message(request)
        }),
        step({
          nodes: ["A"],
          text:
            "A's update forwards the OutMessage to Root's update.",
          label: "Forward",
          moves: [go(reader, "A"), go("A", "Root")],
          payload: message(request)
        }),
        step({
          nodes: ["Root"],
          text:
            "Root's update handles it and changes the value in the Model.",
          label: "Change",
          payload: value
        }),
        step({
          nodes: ["Root", "A"],
          text:
            "The view runs from the root, and Root passes the value to A's view.",
          label: "Render",
          moves: [go("Root", "A", "render")],
          views: ["Root", "A"],
          payload: value
        }),
        step({
          nodes: ["A", "A1", "A2"],
          text: "A's view passes it on to A1's and A2's views.",
          label: "Render",
          moves: [go("A", "A1", "render"), go("A", "A2", "render")],
          views: ["A1", "A2"],
          payload: value
        })
      ]
    },
    {
      id: "effect",
      title: "Effect UI",
      subtitle: "The shared value lives in a Provider's Model",
      rootName: "Provider",
      roles: {
        Root: "Owns the value",
        A: "Not involved",
        A1: "Reads it",
        A2: "Reads it"
      },
      plain: ["A"],
      steps: (reader) => [
        sent(reader, message(add)),
        step({
          nodes: [reader, "Root"],
          text: `${reader}'s update sends a Message to the Provider.`,
          label: "To Provider",
          moves: [go(reader, "Root")],
          updates: [reader],
          payload: message(request)
        }),
        step({
          nodes: ["Root"],
          text:
            "The Provider's update changes the value in its Model.",
          label: "Change",
          updates: ["Root"],
          payload: value
        }),
        step({
          nodes: ["A1", "A2"],
          text: "A1 and A2 read the value, so their views run again.",
          label: "Render",
          moves: [
            go("Root", "A1", "render"),
            go("Root", "A2", "render")
          ],
          views: ["A1", "A2"],
          payload: value
        })
      ]
    }
  ]
}

export const scenarios: Readonly<Record<ScenarioName, Scenario>> = {
  messages,
  sharedState
}
