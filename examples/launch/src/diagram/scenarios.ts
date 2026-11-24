import { Schema } from "effect"

export const names = ["Root", "A", "A1", "A2"] as const

export const Name = Schema.Literals(names)
export type Name = typeof Name.Type

export interface Step {
  readonly nodes: ReadonlyArray<Name>
  readonly text: string
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
  readonly choices: ReadonlyArray<Name>
  readonly sides: readonly [Side, Side]
}

export const ScenarioName = Schema.Literals([
  "messages",
  "sharedState"
])
export type ScenarioName = typeof ScenarioName.Type

const sent = (sender: Name): Step => ({
  nodes: [sender],
  text: `${sender}'s view sends a Message.`
})

const rendered: Step = {
  nodes: names,
  text: "The view runs from the root with the new Model."
}

const messages: Scenario = {
  label: "Message destination",
  action: "Send Message",
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
              sent(destination),
              {
                nodes: ["Root"],
                text:
                  "The root update receives it and returns a new Model."
              },
              rendered
            ]
          case "A":
            return [
              sent(destination),
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
              sent(destination),
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
                nodes: [destination],
                text:
                  `A's update passes it to ${destination}'s update, which returns a new value.`
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
        sent(destination),
        {
          nodes: [destination],
          text: `The runtime delivers it to ${destination}'s update.`
        },
        {
          nodes: [destination],
          text:
            `The runtime stores ${destination}'s new Model, and ${destination}'s view runs.`
        }
      ]
    }
  ]
}

const sharedState: Scenario = {
  label: "Changed by",
  action: "Change the shared value",
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
        sent(reader),
        {
          nodes: ["A", "Root"],
          text: "A and Root wrap it, and the root update receives it."
        },
        {
          nodes: ["A", reader],
          text:
            `Root's update passes it through A's update to ${reader}'s update.`
        },
        {
          nodes: [reader],
          text:
            `${reader} doesn't own the value, so its update returns an OutMessage.`
        },
        {
          nodes: ["A"],
          text: "A's update forwards the OutMessage to Root's update."
        },
        {
          nodes: ["Root"],
          text:
            "Root's update handles it and changes the value in the Model."
        },
        {
          nodes: ["Root", "A"],
          text:
            "The view runs from the root, and Root passes the value to A's view."
        },
        {
          nodes: ["A", "A1", "A2"],
          text: "A's view passes it on to A1's and A2's views."
        }
      ]
    },
    {
      id: "effect",
      title: "Effect UI",
      subtitle: "The shared value lives in a provider's Model",
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
        {
          nodes: [reader, "Root"],
          text: `${reader}'s update sends a Message to the provider.`
        },
        {
          nodes: ["Root"],
          text:
            "The provider's update changes the value in its Model."
        },
        {
          nodes: ["A1", "A2"],
          text: "A1 and A2 read the value, so their views run again."
        }
      ]
    }
  ]
}

export const scenarios: Readonly<Record<ScenarioName, Scenario>> = {
  messages,
  sharedState
}
