import { wide } from "#components/Classes"
import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"
import { panel } from "./controls.ts"

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

const Submodel = <M>(h: Html.H<M>, label: string) =>
  h.div.class(
    "flex flex-col items-center rounded-md border border-dashed",
    "border-border-strong bg-background px-2 py-1.5"
  ).children(
    h.span.class(mono, name).children(label),
    h.span.class("text-[0.625rem]/[1.3] text-muted-foreground")
      .children("Submodel")
  )

// What travels along a line between two Components: props from the
// parent on its left, events from the child on its right.
const Flow = <M>(h: Html.H<M>) => [
  h.span.class(flow, "right-full mr-2").children("props ↓"),
  h.span.class(flow, "left-full ml-2").children("events ↑")
]

const Stem = <M>(h: Html.H<M>, labelled = false) =>
  h.span.class(
    "relative mx-auto block w-px",
    labelled ? "h-6" : "h-4",
    line
  ).attr("aria-hidden", "true").children(labelled && Flow(h))

// From the middle of the node above to the middle of each of the two
// nodes below, which share the width with a gap of 1rem.
const Fork = <M>(h: Html.H<M>, labelled = false) =>
  h.span.class("relative block", labelled ? "h-8" : "h-4").attr(
    "aria-hidden",
    "true"
  )
    .children(
      h.span.class(
        "absolute top-0 bottom-2 left-1/2 w-px",
        line
      ).children(labelled && Flow(h)),
      h.span.class(
        "absolute bottom-2 right-[calc((100%-1rem)/4)]",
        "left-[calc((100%-1rem)/4)] h-px",
        line
      ),
      h.span.class(
        "absolute bottom-0 left-[calc((100%-1rem)/4)] h-2 w-px",
        line
      ),
      h.span.class(
        "absolute bottom-0 right-[calc((100%-1rem)/4)] h-2 w-px",
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

const Side = <M>(
  h: Html.H<M>,
  options: {
    readonly title: string
    readonly caption: string
    readonly tree: View.Content<M>
  }
) =>
  h.div.class(panel, "gap-4").attrs({
    role: "group",
    "aria-label": options.title
  }).children(
    h.p.class("text-[0.9375rem]/[1.4] font-semibold").children(
      options.title
    ),
    // As tall as the taller of the two trees, with the tree in the
    // middle.
    h.div.class("flex flex-1 flex-col justify-center").children(
      h.div.class("mx-auto w-full max-w-[340px]").children(
        options.tree
      )
    ),
    h.p.class("text-[0.8125rem]/[1.5] text-muted-foreground")
      .children(
        options.caption
      )
  )

/**
 * The same four-part app in each architecture. In Foldkit 0.x one
 * program holds the whole of it, and in Effect UI every part is a
 * program of its own.
 */
export const Architecture = <M>(h: Html.H<M>) =>
  h.figure.class(wide, "@container/diagram [--wide:920px]").attr(
    "aria-label",
    "The same app in Foldkit 0.x and in Effect UI"
  ).children(
    h.div.class("grid gap-4 @min-[640px]/diagram:grid-cols-2")
      .children(
        Side(h, {
          title: "Foldkit 0.x",
          caption:
            "One Model, one update and one view for the whole app. A, A1 and A2 are Submodels inside them.",
          // Root's box goes around the Submodels: they are parts of
          // its Model, update and view.
          tree: h.div.class(
            "flex flex-col rounded-md border border-border-strong",
            "bg-background p-3"
          ).children(
            h.div.class("flex flex-col items-center gap-1.5")
              .children(
                h.span.class(mono, name).children("Root"),
                Parts(h)
              ),
            Stem(h),
            h.div.class("mx-auto w-1/2").children(Submodel(h, "A")),
            Fork(h),
            Pair(h, Submodel)
          )
        }),
        Side(h, {
          title: "Effect UI",
          caption:
            "Every Component has a Model, an update and a view of its own. Root renders A, and A renders A1 and A2.",
          tree: h.div.class("flex flex-col").children(
            h.div.class("mx-auto w-1/2 min-w-[9.5rem]").children(
              Program(h, "Root")
            ),
            Stem(h, true),
            h.div.class("mx-auto w-1/2 min-w-[9.5rem]").children(
              Program(h, "A")
            ),
            Fork(h, true),
            Pair(h, Program)
          )
        })
      )
  )
