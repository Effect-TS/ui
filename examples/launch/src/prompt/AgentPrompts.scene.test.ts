import { Tabs, TabsEvents } from "@effect/ui-kit"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  AgentPrompts,
  AgentPromptsMessage,
  ClearCopyFeedback,
  CopyPrompt
} from "./AgentPrompts.ts"

const prompts = [
  {
    label: "TL;DR",
    about: "Paste it into any AI agent.",
    prompt: "Read https://example.com/article.md"
  },
  {
    label: "Your app",
    about: "Paste it into a coding agent.",
    prompt: "Read https://example.com/article.md and this project"
  }
]

const copy = HtmlLocator.role("button", { name: "Copy prompt" })

describe("AgentPrompts", () => {
  it.effect("copies the first prompt until another is selected", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(AgentPrompts, { prompts })
      scene.click(copy)
        .expectExact(
          CopyPrompt.make({
            text: "Read https://example.com/article.md"
          })
        )
        .resolve(
          CopyPrompt,
          AgentPromptsMessage.SucceededCopyPrompt()
        )
        .expectExact(ClearCopyFeedback.make())
        .expect(HtmlLocator.role("button", { name: "Copied" }))
        .toExist()
        .resolve(
          ClearCopyFeedback,
          AgentPromptsMessage.ClearedCopyFeedback()
        )
        .expect(copy)
        .toExist()
    }))

  it.effect("copies the prompt whose tab is selected", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(AgentPrompts, { prompts })
      // A scene doesn't run a child, so the Tabs' event stands in for
      // a click on the second tab.
      scene.childEmit(
        Tabs,
        "prompts",
        TabsEvents.Selected({
          value: "Your app",
          activationDirection: "right"
        })
      )
        .click(copy)
        .expectExact(
          CopyPrompt.make({
            text:
              "Read https://example.com/article.md and this project"
          })
        )
        .resolve(CopyPrompt, AgentPromptsMessage.FailedCopyPrompt())
        .expectExact(ClearCopyFeedback.make())
        .expect(HtmlLocator.role("button", { name: "Couldn't copy" }))
        .toExist()
        .resolve(
          ClearCopyFeedback,
          AgentPromptsMessage.ClearedCopyFeedback()
        )
    }))
})
