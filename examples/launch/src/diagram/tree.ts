import type { View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import {
  type Carries,
  displayName,
  type Move,
  type Name,
  names,
  type Side,
  type Step
} from "./scenarios.ts"

// The tree is drawn in a 320 by 230 box: SVG for the links and the
// packets that travel along them, HTML for the nodes, placed by
// percentage so both scale together.
export const width = 320
export const height = 230

const at: Readonly<
  Record<Name, { readonly x: number; readonly y: number }>
> = {
  Root: { x: 160, y: 30 },
  A: { x: 160, y: 115 },
  A1: { x: 80, y: 200 },
  A2: { x: 240, y: 200 }
}

// Each link one way. Root to A1 or A2 skips A: only a Provider talks
// to a Component that far down.
const links: ReadonlyArray<
  readonly [from: Name, to: Name, d: string, back: string]
> = [
  ["Root", "A", "M160 30 V115", "M160 115 V30"],
  ["A", "A1", "M160 115 V157 H80 V200", "M80 200 V157 H160 V115"],
  ["A", "A2", "M160 115 V157 H240 V200", "M240 200 V157 H160 V115"],
  [
    "Root",
    "A1",
    "M160 30 C46 34 28 140 80 200",
    "M80 200 C28 140 46 34 160 30"
  ],
  [
    "Root",
    "A2",
    "M160 30 C274 34 292 140 240 200",
    "M240 200 C292 140 274 34 160 30"
  ]
]

export const isDirect = (move: Move) =>
  (move.from === "Root" && (move.to === "A1" || move.to === "A2")) ||
  (move.to === "Root" && (move.from === "A1" || move.from === "A2"))

export const path = (move: Move): string => {
  for (const [from, to, d, back] of links) {
    if (move.from === from && move.to === to) return d
    if (move.from === to && move.to === from) return back
  }
  return ""
}

// Moves that follow on from each other travel as one packet; a move
// that starts somewhere else starts a packet of its own.
export const tracks = (
  moves: ReadonlyArray<Move>
): ReadonlyArray<ReadonlyArray<Move>> =>
  moves.reduce<Array<Array<Move>>>((out, move) => {
    const current = out.at(-1)
    const previous = current?.at(-1)
    if (current && previous && previous.to === move.from) {
      current.push(move)
    } else {
      out.push([move])
    }
    return out
  }, [])

const trackPath = (track: ReadonlyArray<Move>) =>
  track.map((move, index) =>
    index === 0 ? path(move) : path(move).replace(/^M[\d. ]+/, "")
  ).join(" ")

export type NodeStatus = "idle" | "active" | "update" | "view"

export const statusOf = (
  step: Step | undefined,
  name: Name
): NodeStatus =>
  step === undefined
    ? "idle"
    : step.views.includes(name)
    ? "view"
    : step.updates.includes(name)
    ? "update"
    : step.nodes.includes(name)
    ? "active"
    : "idle"

export const statusText = (
  step: Step | undefined,
  name: Name
): string | undefined => {
  switch (statusOf(step, name)) {
    case "view":
      return "view runs"
    case "update":
      return "update runs"
    case "active":
      return step?.label
    case "idle":
      return undefined
  }
}

const strokeOf: Readonly<Record<Carries, string>> = {
  message: "stroke-accent",
  value: "stroke-accent",
  render: "stroke-accent/55"
}

export const svg = <M>(h: View.H<M>, tag: string) => h.el(tag)

const Link = <M>(
  h: View.H<M>,
  d: string,
  className: string,
  key: string
) =>
  svg(h, "path").key(key).attrs({
    d,
    class: className,
    fill: "none",
    "stroke-linejoin": "round"
  })

// One dot per packet, travelling the track's path once and fading out
// at the end. The key restarts it whenever the step changes.
const Packet = <M>(
  h: View.H<M>,
  track: ReadonlyArray<Move>,
  key: string
) => {
  const carries = track[0]?.carries ?? "message"
  return svg(h, "circle").key(key).attrs({
    r: carries === "render" ? "4.5" : "6",
    class: Html.classNames(
      "diagram-packet",
      // Foreground, not accent, so the dot shows over a node that is
      // filled with the accent colour.
      carries === "value"
        ? "fill-background stroke-foreground"
        : carries === "render"
        ? "fill-foreground/70"
        : "fill-foreground"
    ),
    "stroke-width": carries === "value" ? "2.5" : undefined,
    style: `offset-path: path("${trackPath(track)}")`
  })
}

export interface TreeOptions<M> {
  readonly side: Side
  // The step on screen, and the ones before it, whose moves stay
  // drawn as a trail.
  readonly step: Step | undefined
  readonly past: ReadonlyArray<Step>
  // Changes whenever a step starts, so its packets play again.
  readonly key: string
  // Drawn under a node's name in place of its role.
  readonly badge?: ((name: Name) => string | undefined) | undefined
  // Makes each node a button that sends this Message.
  readonly press?: ((name: Name) => M | undefined) | undefined
  readonly label?: ((name: Name) => string) | undefined
  readonly dim?: ((name: Name) => boolean) | undefined
  // Smaller nodes, for two trees side by side on a phone.
  readonly compact?: boolean | undefined
  // Shows the step as it ends: its moves drawn, nothing travelling.
  readonly still?: boolean | undefined
}

const nodeClass = [
  "absolute flex -translate-1/2 flex-col items-center",
  "rounded-md border border-border-strong bg-background px-1",
  "text-center text-foreground",
  "data-[plain]:border-dashed",
  "data-[status=active]:border-accent",
  "data-[status=active]:[box-shadow:0_0_0_1px_var(--color-accent)]",
  "data-[status=update]:border-accent data-[status=update]:bg-accent",
  "data-[status=update]:text-accent-foreground",
  "data-[status=view]:border-accent",
  "data-[status=view]:bg-[color-mix(in_oklab,var(--color-accent)_14%,var(--color-background))]",
  "data-[dim]:opacity-45",
  "motion-safe:transition-[background-color,border-color,color,opacity,box-shadow]",
  "motion-safe:duration-300"
].join(" ")

const buttonClass = [
  "cursor-pointer [box-shadow:0_1px_2px_var(--color-ring)]",
  "not-disabled:border-b-2 hover:border-muted-foreground",
  "active:translate-y-[calc(-50%+1px)]",
  "focus-visible:outline-accent disabled:cursor-default",
  "disabled:opacity-45"
].join(" ")

// The tree of one side: Root, A under it, A1 and A2 under A.
export const Tree = <M>(h: View.H<M>, options: TreeOptions<M>) => {
  const { side, step, key, compact = false, still = false } = options
  const past = still && step ? [...options.past, step] : options.past
  const moving = still ? undefined : step
  const size = compact
    ? "w-[42%] py-0.5 @min-[300px]/tree:w-[35%] @min-[300px]/tree:py-1.5"
    : "w-[35%] py-1.5"
  const showDirect = side.steps("A1").concat(side.steps("A2"))
    .some((s) => s.moves.some(isDirect))
  return h.div.class(
    "@container/tree relative mx-auto aspect-[320/230] w-full",
    "max-w-[400px]"
  ).children(
    svg(h, "svg").attrs({
      viewBox: `0 0 ${width} ${height}`,
      class: "absolute inset-0 size-full overflow-visible",
      "aria-hidden": "true"
    }).children(
      Link(
        h,
        "M160 30 V115 M160 115 V157 H80 V200 M160 157 H240 V200",
        "stroke-border-strong",
        "edges"
      ).attr("stroke-width", "1.5"),
      showDirect &&
        Link(
          h,
          "M160 30 C46 34 28 140 80 200 M160 30 C274 34 292 140 240 200",
          "stroke-border-strong",
          "direct"
        ).attrs({ "stroke-width": "1.5", "stroke-dasharray": "4 4" }),
      ...past.flatMap((s, i) =>
        s.moves.map((move, j) =>
          Link(
            h,
            path(move),
            Html.classNames(strokeOf[move.carries], "opacity-40"),
            `past-${i}-${j}`
          ).attr("stroke-width", "2.5")
        )
      ),
      ...(moving?.moves ?? []).map((move, j) =>
        Link(
          h,
          path(move),
          Html.classNames(strokeOf[move.carries], "diagram-draw"),
          `${key}-now-${j}`
        ).attrs({ "stroke-width": "2.5", pathLength: "1" })
      )
    ),
    ...names.map((name) => {
      const status = statusOf(step, name)
      const shown = options.badge?.(name) ?? statusText(step, name)
      // Compact nodes are too narrow for a role: they show what runs.
      const badge = compact && shown !== undefined
        ? shown.replace(" runs", "")
        : shown
      const message = options.press?.(name)
      const content = [
        h.span.class(
          "font-mono font-semibold font-features-[normal]",
          compact
            ? "text-[0.6875rem]/[1.3] @min-[300px]/tree:text-[0.8125rem]/[1.35]"
            : "text-[0.8125rem]/[1.35]"
        ).attr("data-part", "name").children(displayName(side, name)),
        h.span.class(
          "max-w-full truncate",
          compact
            ? "text-[0.5625rem]/[1.3] @min-[300px]/tree:text-[0.625rem]/[1.3]"
            : "text-[0.625rem]/[1.3]",
          status === "update"
            ? "text-inherit"
            : "text-muted-foreground"
        ).attr("data-part", "role").children(
          badge ?? (compact ? "\u00a0" : side.roles[name])
        )
      ]
      const attrs = {
        "data-node": name,
        "data-status": status === "idle" ? undefined : status,
        "data-plain": side.plain.includes(name) ? "" : undefined,
        "data-dim": options.dim?.(name) ? "" : undefined
      }
      const place = {
        left: `${(at[name].x / width) * 100}%`,
        top: `${(at[name].y / height) * 100}%`
      }
      // Only a node that can send gets a button.
      if (message === undefined) {
        return h.div.class(nodeClass, size).key(name).attrs(attrs)
          .style(place).children(...content)
      }
      return h.button.class(nodeClass, size, buttonClass).key(name)
        .attrs({
          ...attrs,
          type: "button",
          "aria-label": options.label?.(name) ??
            displayName(side, name)
        }).style(place).onClick(message).children(...content)
    }),
    svg(h, "svg").attrs({
      viewBox: `0 0 ${width} ${height}`,
      class:
        "pointer-events-none absolute inset-0 z-1 size-full overflow-visible",
      "aria-hidden": "true"
    }).children(
      ...tracks(moving?.moves ?? []).map((track, i) =>
        Packet(h, track, `${key}-packet-${i}`)
      )
    )
  )
}
