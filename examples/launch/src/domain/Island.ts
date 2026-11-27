import { DateTime, Schema, Struct } from "effect"
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
  // A picture of a component tree in Effect UI.
  Architecture: Schema.Struct({}),
  Diagram: Schema.Struct({ scenario: ScenarioName }),
  Counter: Schema.Struct({ code: Code, label: Schema.String }),
  // `whole` shows a long file in full, for one whose point is below
  // the lines a preview would show. `example` names a live app to run
  // above the code.
  Listing: Schema.Struct({
    code: Code,
    whole: Schema.optional(Schema.Literal("true")),
    example: Schema.optional(Schema.Literal("counter"))
  }),
  // The components of the UI kit.
  Kit: Schema.Struct({}),
  PlayTest: Schema.Struct({}),
  // Text that an arrow to the DevTools button goes with.
  LauncherPointer: Schema.Struct({}),
  Footer: Schema.Struct({})
}

export const Frontmatter = Schema.Struct({
  title: Schema.String,
  published: Schema.DateTimeUtcFromString,
  updated: Schema.DateTimeUtcFromString
})

/** Omits "Updated" when both timestamps are equal. */
export const byline = (
  { published, updated }: typeof Frontmatter.Type
) =>
  [
    { label: "Published", date: published },
    ...DateTime.Equivalence(published, updated)
      ? []
      : [{ label: "Updated", date: updated }]
  ].map(({ date, label }) => ({
    label,
    iso: DateTime.formatIsoDateUtc(date),
    text: DateTime.formatUtc(date, {
      locale: "en-US",
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }))
