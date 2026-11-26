import { Schema, Struct } from "effect"
import { ScenarioName } from "../diagram/scenarios.ts"
import { Snippets } from "./Snippet.ts"

const Code = Schema.Literals(Struct.keys(Snippets.fields))

export const Islands = {
  // Holds the article's AgentPrompt islands, and draws them as tabs.
  AgentPrompts: Schema.Struct({}),
  // `label` names its tab, and `about` says where to paste it.
  AgentPrompt: Schema.Struct({
    label: Schema.String,
    about: Schema.String,
    prompt: Schema.String
  }),
  // Text for the page that the Markdown copy of the article leaves
  // out.
  PageOnly: Schema.Struct({}),
  // Short phrases drawn as a row of chips, separated by commas.
  Chips: Schema.Struct({
    label: Schema.String,
    items: Schema.String
  }),
  // A still picture of one app in each architecture.
  Architecture: Schema.Struct({}),
  Diagram: Schema.Struct({ scenario: ScenarioName }),
  // `example` names an app to run above the code.
  Compare: Schema.Struct({
    foldkit: Code,
    foldkitTitle: Schema.String,
    effect: Code,
    effectTitle: Schema.String,
    example: Schema.optional(Schema.Literal("counter"))
  }),
  Counter: Schema.Struct({ code: Code, label: Schema.String }),
  // `whole` shows a long file in full, for one whose point is below
  // the lines a preview would show.
  Listing: Schema.Struct({
    code: Code,
    whole: Schema.optional(Schema.Literal("true"))
  }),
  // The components of the UI kit.
  Kit: Schema.Struct({}),
  PlayTest: Schema.Struct({}),
  // Text that an arrow to the DevTools button goes with.
  LauncherPointer: Schema.Struct({}),
  PerformanceChart: Schema.Struct({}),
  AllResults: Schema.Struct({}),
  Footer: Schema.Struct({})
}

export const Frontmatter = Schema.Struct({ title: Schema.String })
