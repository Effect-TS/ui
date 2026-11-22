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

export const textOf = (index: number): string => words[(index * 7) % words.length]!

export const demoName = (): string => new URLSearchParams(window.location.search).get("demo") ?? ""
