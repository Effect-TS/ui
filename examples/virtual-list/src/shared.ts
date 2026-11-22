import { Html } from "@effect/ui/html"

export { Html }

const words = [
  "The build finished without warnings.",
  "Can you take a look at the failing check on the release branch before lunch?",
  "Shipped.",
  "I moved the meeting to Thursday so everyone from the design team can join, and I attached the notes from last week.",
  "Sounds good to me.",
  "The new dashboard loads in under a second now, even with the full year of data selected."
]

/** A sentence for item `index`, of one of a few lengths, so items differ in height. */
export const textOf = (index: number): string => words[(index * 7) % words.length]!

/** The `?demo=` of the page's URL, so each demo can be opened on its own. */
export const demoName = (): string => new URLSearchParams(window.location.search).get("demo") ?? ""
