import { MarkdownParser } from "@effect/ui/html"
import { Option, Schema } from "effect"
import {
  architectureDescription,
  scenarios
} from "../diagram/scenarios.ts"
import { modules } from "../kit/components.ts"
import { byline, Frontmatter, Islands } from "./Island.ts"
import type { Snippet, Snippets } from "./Snippet.ts"

const attributes = (text: string) =>
  Object.fromEntries(
    Array.from(
      text.matchAll(/(\w+)="([^"]*)"/g),
      (match) => [match[1], match[2]]
    )
  )

const decode = {
  Diagram: Schema.decodeUnknownSync(Islands.Diagram),
  Counter: Schema.decodeUnknownSync(Islands.Counter),
  Listing: Schema.decodeUnknownSync(Islands.Listing)
}

const code = (file: Snippet) =>
  [
    `\`${file.name}\``,
    "",
    "```ts",
    ...file.lines.map((line) =>
      line.map((token) => token.text).join("")
    ),
    "```"
  ].join("\n")

const files = (list: ReadonlyArray<Snippet>) =>
  list.map(code).join("\n\n")

const diagram = (name: keyof typeof scenarios) => {
  const { choices, label, side } = scenarios[name]
  const choice = choices.includes("A1") ? "A1" : choices[0]
  return [
    `**${side.subtitle}.** ${label}: ${choice}.`,
    "",
    ...side.steps(choice).map((step, index) =>
      `${index + 1}. ${step.text}`
    )
  ].join("\n")
}

export const toMarkdown = (source: string, snippets: Snippets) => {
  const island = (name: string, text = "", body = ""): string => {
    switch (name) {
      case "Architecture":
        return architectureDescription
      case "Diagram":
        return diagram(decode.Diagram(attributes(text)).scenario)
      case "Counter":
        return files(snippets[decode.Counter(attributes(text)).code])
      case "Listing":
        return [
          files(snippets[decode.Listing(attributes(text)).code]),
          body
        ]
          .filter((part) => part !== "").join("\n\n")
      case "PlayTest":
        return [
          files(snippets.play),
          "An interactive figure runs this test in the browser, on the test host with a TestClock. A slider steps through it one line at a time and shows the app as the test host holds it, the TestClock and whether DelayReset is running. The test clicks +1 and Reset, so the count is 1 and DelayReset is asleep. It advances the clock to 999 ms, and the count is still 1. It advances the clock one more millisecond. DelayReset finishes, the runtime delivers CompletedDelayReset, and the count is 0.",
          files(snippets.playSignIn),
          "A second tab runs this test of the sign-in flow in `examples/auth`. The router and the session store keep their data in memory. The test types an email and a password, and the form enables its button. It clicks Sign In. The real sign-in Command starts a request that takes one second, and the button reads \"Signing in...\". It advances the clock one second. The app shows the dashboard, the session is in the store and the URL is /dashboard.",
          files(snippets.playSnake),
          "A third tab runs this test of the Snake game in `examples/snake`. A seed fixes where the apple appears. The test presses Space to start the game and the up arrow to turn, then advances the TestClock 150 ms, which is one move. It presses the right arrow and advances the clock 900 ms, which is six moves. The snake reaches the apple and the score is 10. It presses Space to pause and advances the clock ten seconds, and the snake doesn't move."
        ].join("\n\n")
      case "Kit":
        return `Modules: ${modules.join(", ")}.`
      case "Footer":
      case "LauncherPointer":
        return body
      case "AgentPrompts":
      case "PageOnly":
        return ""
      case "Chips": {
        const { items, label } = attributes(text)
        return `${label}: ${items}.`
      }
      default:
        throw new Error(`No text for the island "${name}"`)
    }
  }
  const meta = Schema.decodeUnknownSync(Frontmatter)(
    Option.getOrThrow(
      MarkdownParser.parseMarkdownWithFrontmatter(source, {
        islands: Islands,
        frontmatter: Frontmatter
      }).frontmatter
    )
  )
  const dates = byline(meta).map(({ label, text }) =>
    `${label} ${text}`
  )
  return source
    .replace(
      /^---\n[^]*?\n---\n/,
      () => `# ${meta.title}\n\n${dates.join(" · ")}\n`
    )
    .replace(
      /^:::(\w+)(?:\{(.*)\})?\n([^]*?)\n:::$/gm,
      (_, name, text, body) => island(name, text, body)
    )
    .replace(
      /^::(\w+)(?:\{(.*)\})?$/gm,
      (_, name, text) => island(name, text)
    )
    .replace(/\n{3,}/g, "\n\n")
    // A section with nothing but islands the copy leaves out goes too.
    .replace(/^## .*\n\n(?=## )/gm, "")
}
