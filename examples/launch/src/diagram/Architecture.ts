import { srOnly } from "#components/Classes"
import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"
import { panel } from "./controls.ts"
import { architectureDescription } from "./scenarios.ts"

const parts = ["Model", "update", "view"]

const name = "font-mono text-[0.8125rem]/[1.35] font-semibold"

const mono = "font-mono font-features-[normal]"

const line = "bg-border-strong"

const flow = [
  "absolute top-1/2 -translate-y-1/2 font-mono whitespace-nowrap",
  "text-[0.625rem]/[1] text-muted-foreground font-features-[normal]"
].join(" ")

// The three parts of an Elm Architecture program. Each set marks
// one program that the runtime runs.
const Parts = <M>(h: Html.H<M>) =>
  h.span.class("flex justify-center gap-1").children(
    parts.map((part) =>
      h.span.key(part).class(
        mono,
        "rounded-sm px-1.5 py-px text-[0.625rem]/[1.5] font-medium",
        "text-accent-text",
        // The tint alone is too faint to show the chip's edge.
        "[box-shadow:inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_22%,transparent)]",
        "bg-[color-mix(in_oklab,var(--color-accent)_6%,var(--color-background))]"
      ).children(part)
    )
  )

const Program = <M>(h: Html.H<M>, label: string) =>
  h.div.class(
    "flex flex-col items-center gap-1.5 rounded-md border",
    "border-border-strong bg-background px-2 py-2"
  ).children(h.span.class(mono, name).children(label), Parts(h))

// What travels along a line between two Components: props from the
// parent on its left, events from the child on its right.
const Flow = <M>(h: Html.H<M>) => [
  h.span.class(flow, "right-full mr-2").children("props ↓"),
  h.span.class(flow, "left-full ml-2").children("events ↑")
]

const Stem = <M>(h: Html.H<M>) =>
  h.span.class(
    "relative mx-auto block h-6 w-px",
    line
  ).attr("aria-hidden", "true").children(Flow(h))

// From the middle of the node above to the middle of each of the two
// nodes below, which share the width with a gap of 1rem.
const Fork = <M>(h: Html.H<M>) =>
  h.span.class("relative block h-8").attr(
    "aria-hidden",
    "true"
  )
    .children(
      h.span.class(
        "absolute top-0 bottom-2 left-1/2 w-px",
        line
      ).children(Flow(h)),
      h.span.class(
        "absolute right-[calc((100%-1rem)/4)] bottom-2",
        "left-[calc((100%-1rem)/4)] h-px",
        line
      ),
      h.span.class(
        "absolute bottom-0 left-[calc((100%-1rem)/4)] h-2 w-px",
        line
      ),
      h.span.class(
        "absolute right-[calc((100%-1rem)/4)] bottom-0 h-2 w-px",
        line
      )
    )

const Pair = <M>(
  h: Html.H<M>,
  node: (h: Html.H<M>, label: string) => View.Content<M>
) =>
  h.div.class("grid grid-cols-2 gap-4").children(
    node(h, "A1"),
    node(h, "A2")
  )

/**
 * A four-part Effect UI app: every Component has its own Model, update
 * and view, with props flowing down and events flowing up.
 */
export const Architecture = <M>(h: Html.H<M>) =>
  h.figure.class(
    "mx-auto my-8 max-w-(--column) @container/diagram [p+&]:mt-[1.4em]"
  ).attr(
    "aria-label",
    "Component tree in Effect UI"
  ).children(
    h.div.class(panel, "gap-4 py-6").children(
      h.div.class("mx-auto w-full max-w-[340px]").children(
        h.div.class("flex flex-col").children(
          h.div.class("mx-auto w-1/2 min-w-[9.5rem]").children(
            Program(h, "Root")
          ),
          Stem(h),
          h.div.class("mx-auto w-1/2 min-w-[9.5rem]").children(
            Program(h, "A")
          ),
          Fork(h),
          Pair(h, Program)
        )
      ),
      h.p.class(srOnly).children(architectureDescription)
    )
  )
