import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  AgentPrompt,
  AgentPromptMessage,
  CopyPrompt
} from "./AgentPrompt.ts"

describe("AgentPrompt", () => {
  it.effect("copies the prompt it shows", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(AgentPrompt, {
        title: "TL;DR agent prompt",
        prompt: "Read https://example.com/article.md"
      })
      s.click(HtmlLocator.role("button", { name: "Copy prompt" }))
        .expectExact(
          CopyPrompt.make({
            text: "Read https://example.com/article.md"
          })
        )
        .resolve(CopyPrompt, AgentPromptMessage.SucceededCopyPrompt())
        .expect(HtmlLocator.role("button", { name: "Copied" }))
        .toExist()
    }))
})
