import { Schema } from "effect"
import { scenarios } from "../diagram/scenarios.ts"
import {
  format,
  frameworks,
  load,
  names,
  type Row,
  script,
  summary,
  value
} from "../performance/Results.ts"
import { Islands } from "./Island.ts"
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
  Compare: Schema.decodeUnknownSync(Islands.Compare),
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

const table = (title: string, rows: ReadonlyArray<Row>) =>
  [
    `**${title}**`,
    "",
    `| Workload | ${frameworks.map((id) => names[id]).join(" | ")} |`,
    `| --- |${frameworks.map(() => " ---: |").join("")}`,
    ...rows.map((row) =>
      `| ${row.label} | ${
        frameworks.map((id) =>
          `${format(value(row, id))} ${row.unit}`
        )
          .join(" | ")
      } |`
    )
  ].join("\n")

const diagram = (name: keyof typeof scenarios) => {
  const { choices, label, sides } = scenarios[name]
  const choice = choices.includes("A1") ? "A1" : choices[0]
  return sides.map((side) =>
    [
      `**${side.title}** (${side.subtitle}). ${label}: ${choice}.`,
      "",
      ...side.steps(choice).map((step, index) =>
        `${index + 1}. ${step.text}`
      )
    ].join("\n")
  ).join("\n\n")
}

export const toMarkdown = (source: string, snippets: Snippets) => {
  const island = (name: string, text = "", body = ""): string => {
    switch (name) {
      case "Diagram":
        return diagram(decode.Diagram(attributes(text)).scenario)
      case "Compare": {
        const compare = decode.Compare(attributes(text))
        return [
          `**${compare.foldkitTitle}**`,
          files(snippets[compare.foldkit]),
          `**${compare.effectTitle}**`,
          files(snippets[compare.effect]),
          body
        ].filter((part) => part !== "").join("\n\n")
      }
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
          "An interactive figure runs this test in the browser, on the test host with a TestClock. A slider steps through it one line at a time and shows the count, the TestClock and whether DelayReset is running. After the two clicks the count is 1 and DelayReset is asleep. At 999 ms the count is still 1. One more millisecond wakes DelayReset, the runtime delivers CompletedDelayReset, and the count is 0."
        ].join("\n\n")
      case "PerformanceChart":
        return [
          "| Library | JavaScript time, as a multiple of vanilla JS |",
          "| --- | ---: |",
          ...summary.map((entry) =>
            `| ${names[entry.framework]} | ${
              entry.multiple.toFixed(2)
            }× |`
          )
        ].join("\n")
      case "AllResults":
        return [
          table(
            "Median time running JavaScript per operation",
            script
          ),
          table("Page load and memory", load)
        ].join("\n\n")
      case "Footer":
        return body
      case "AgentPrompt":
        return ""
      default:
        throw new Error(`No text for the island "${name}"`)
    }
  }
  return source
    .replace(/^---\ntitle: (.*)\n---\n/, "# $1\n")
    .replace(
      /^:::(\w+)(?:\{(.*)\})?\n([^]*?)\n:::$/gm,
      (_, name, text, body) => island(name, text, body)
    )
    .replace(
      /^::(\w+)(?:\{(.*)\})?$/gm,
      (_, name, text) => island(name, text)
    )
    .replace(/\n{3,}/g, "\n\n")
}
