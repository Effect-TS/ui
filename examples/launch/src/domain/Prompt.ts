import type { Markdown } from "@effect/ui/html"
import { Schema } from "effect"
import { Islands } from "./Island.ts"

export const Prompt = Islands.AgentPrompt
export type Prompt = typeof Prompt.Type

const decode = Schema.decodeUnknownSync(Prompt)

const named = (
  blocks: ReadonlyArray<Markdown.Block>,
  name: string
): ReadonlyArray<Markdown.Island> =>
  blocks.filter((block): block is Markdown.Island =>
    block._tag === "Island" && block.name === name
  )

/**
 * The prompts inside the article's `AgentPrompts` island, in the order
 * it lists them. An island's view gets what is inside it already drawn,
 * so the page reads the prompts from the document instead.
 */
export const fromDocument = (
  document: Markdown.Document
): ReadonlyArray<Prompt> =>
  named(document.blocks, "AgentPrompts").flatMap((island) =>
    named(island.blocks, "AgentPrompt").map((prompt) =>
      decode(prompt.attributes)
    )
  )
