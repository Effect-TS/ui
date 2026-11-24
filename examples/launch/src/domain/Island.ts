import { Schema, Struct } from "effect"
import { ScenarioName } from "../diagram/scenarios.ts"
import { Snippets } from "./Snippet.ts"

const Code = Schema.Literals(Struct.keys(Snippets.fields))

export const Islands = {
  AgentPrompt: Schema.Struct({
    title: Schema.String,
    prompt: Schema.String
  }),
  Diagram: Schema.Struct({ scenario: ScenarioName }),
  Compare: Schema.Struct({
    foldkit: Code,
    foldkitTitle: Schema.String,
    effect: Code,
    effectTitle: Schema.String
  }),
  Counter: Schema.Struct({ code: Code, label: Schema.String }),
  Listing: Schema.Struct({ code: Code }),
  PerformanceChart: Schema.Struct({}),
  AllResults: Schema.Struct({}),
  Footer: Schema.Struct({})
}

export const Frontmatter = Schema.Struct({ title: Schema.String })
