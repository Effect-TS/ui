import { Html } from "@effect/ui/html"
import { Array, Option } from "effect"
import {
  type Carries,
  displayName,
  type Move,
  type Name,
  names,
  type Side,
  type Step
} from "./scenarios.ts"

// The tree is drawn in a 320 by 246 box: SVG for the links and the
// packets that travel along them, HTML for the nodes, placed by
// percentage so both scale together.
export const width = 320
export const height = 246

// Where each node's top edge is centred. A node hangs below this
// point, so a link meets it here whatever the node's height, and a
// dot resting here sits on the node's edge, clear of its label.
const at: Readonly<
  Record<Name, { readonly x: number; readonly y: number }>
> = {
  Root: { x: 160, y: 8 },
  A: { x: 160, y: 93 },
  A1: { x: 80, y: 178 },
  A2: { x: 240, y: 178 }
}

// Each link one way. Root to A1 or A2 skips A: only a Provider talks
// to a Component that far down. Those two leave through Root's sides
// and curve round A.
const links: ReadonlyArray<
  readonly [from: Name, to: Name, d: string, back: string]
> = [
  ["Root", "A", "M160 8 V93", "M160 93 V8"],
  ["A", "A1", "M160 93 V168 H80 V178", "M80 178 V168 H160 V93"],
  ["A", "A2", "M160 93 V168 H240 V178", "M240 178 V168 H160 V93"],
  [
    "Root",
    "A1",
    "M160 8 C50 40 20 120 80 178",
    "M80 178 C20 120 50 40 160 8"
  ],
  [
    "Root",
    "A2",
    "M160 8 C270 40 300 120 240 178",
    "M240 178 C300 120 270 40 160 8"
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
  render: "stroke-accent/55"
}

const Link = <M>(
  h: Html.H<M>,
  d: string,
  className: string,
  key: string
) =>
  h.path.key(key).attrs({
    d,
    class: className,
    fill: "none",
    "stroke-linejoin": "round"
  })

const dotClass = (carries: Carries) =>
  // Foreground, not accent, so the dot shows over a node that is
  // filled with the accent colour.
  carries === "render" ? "fill-foreground/70" : "fill-foreground"

const dotAttrs = (carries: Carries) => ({
  r: carries === "render" ? "4.5" : "6"
})

// One dot per packet, travelling the track's path once and staying
// where it ends. The key restarts it whenever the step changes.
const Packet = <M>(
  h: Html.H<M>,
  track: ReadonlyArray<Move>,
  key: string
) => {
  const carries = track[0]?.carries ?? "message"
  return h.circle.key(key).attrs({
    ...dotAttrs(carries),
    class: Html.classNames("diagram-packet", dotClass(carries)),
    style: `offset-path: path("${trackPath(track)}")`
  })
}

export interface TreeOptions {
  readonly side: Side
  // The step on screen, and the ones before it, whose moves stay
  // drawn as a trail.
  readonly step: Step | undefined
  readonly past: ReadonlyArray<Step>
  // Changes whenever a step starts, so its packets play again.
  readonly key: string
  readonly dim?: ((name: Name) => boolean) | undefined
  // Shows the step as it ends: its moves drawn, nothing travelling.
  readonly still?: boolean | undefined
}

const nodeClass = [
  "absolute flex w-[35%] -translate-x-1/2 flex-col items-center",
  "rounded-md border border-border-strong bg-background px-1 py-1.5",
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

interface Rest {
  readonly name: Name
  readonly carries: Carries
}

const ends = (step: Step): ReadonlyArray<Rest> =>
  tracks(step.moves).flatMap((track) => {
    const last = track.at(-1)
    return last ? [{ name: last.to, carries: last.carries }] : []
  })

// Where the dots are once the step's moves are over. A step that
// moves nothing leaves them where the last move put them, and before
// any move the dot is with the node that sent the Message.
const restsOf = (
  step: Step | undefined,
  past: ReadonlyArray<Step>
): ReadonlyArray<Rest> => {
  if (step === undefined) return []
  const moved = Array.findLast(
    [...past, step],
    (candidate) => candidate.moves.length > 0
  )
  if (Option.isSome(moved)) return ends(moved.value)
  const sender = [...past, step][0]?.nodes[0]
  return sender === undefined
    ? []
    : [{ name: sender, carries: "message" }]
}

// A dot at rest, where the packet that brought it stopped.
const Resting = <M>(h: Html.H<M>, rest: Rest, index: number) =>
  h.circle.key(`rest-${index}`).attrs({
    ...dotAttrs(rest.carries),
    cx: String(at[rest.name].x),
    cy: String(at[rest.name].y),
    class: dotClass(rest.carries)
  })

// The tree of one side: Root, A under it, A1 and A2 under A.
export const Tree = <M>(h: Html.H<M>, options: TreeOptions) => {
  const { side, step, key, still = false } = options
  const rests = restsOf(step, options.past)
  // A step that moves the dots draws them as packets, which stop
  // where the dots then rest. Any other step draws them at rest.
  const travels = !still && (step?.moves.length ?? 0) > 0
  const past = still && step ? [...options.past, step] : options.past
  const moving = still ? undefined : step
  const showDirect = side.steps("A1").concat(side.steps("A2"))
    .some((s) => s.moves.some(isDirect))
  return h.div.class(
    "@container/tree relative mx-auto aspect-[320/246] w-full",
    "max-w-[400px]"
  ).children(
    h.svg.attrs({
      viewBox: `0 0 ${width} ${height}`,
      // Nothing is drawn above Root's top edge, where a link that
      // starts there would otherwise show as a sliver.
      class:
        "absolute inset-0 size-full [clip-path:inset(3.6%_0_0_0)]",
      "aria-hidden": "true"
    }).children(
      Link(
        h,
        "M160 8 V93 M160 93 V168 H80 V178 M160 168 H240 V178",
        "stroke-border-strong",
        "edges"
      ).attr("stroke-width", "1.5"),
      showDirect &&
        Link(
          h,
          "M160 8 C50 40 20 120 80 178 M160 8 C270 40 300 120 240 178",
          "stroke-border-strong",
          "direct"
        ).attrs({ "stroke-width": "1.5", "stroke-dasharray": "4 4" }),
      past.flatMap((s, i) =>
        s.moves.map((move, j) =>
          Link(
            h,
            path(move),
            // As strong as the link being drawn. A link that dimmed the
            // moment its step ended read as a flash.
            strokeOf[move.carries],
            `past-${i}-${j}`
          ).attr("stroke-width", "2.5")
        )
      ),
      moving?.moves.map((move, j) =>
        Link(
          h,
          path(move),
          Html.classNames(strokeOf[move.carries], "diagram-draw"),
          `${key}-now-${j}`
        ).attrs({ "stroke-width": "2.5", pathLength: "1" })
      )
    ),
    names.map((name) => {
      const status = statusOf(step, name)
      const badge = statusText(step, name)
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
      return h.div.class(nodeClass).key(name).attrs(attrs)
        .style(place).children(
          h.span.class(
            "font-mono text-[0.8125rem]/[1.35] font-semibold",
            "font-features-[normal]"
          ).attr("data-part", "name").children(
            displayName(side, name)
          ),
          h.span.class(
            "max-w-full truncate text-[0.625rem]/[1.3]",
            status === "update"
              ? "text-inherit"
              : "text-muted-foreground"
          ).attr("data-part", "role").children(
            badge ?? side.roles[name]
          )
        )
    }),
    h.svg.attrs({
      viewBox: `0 0 ${width} ${height}`,
      class:
        "pointer-events-none absolute inset-0 z-1 size-full overflow-visible",
      "aria-hidden": "true"
    }).children(
      travels
        ? tracks(moving?.moves ?? []).map((track, i) =>
          Packet(h, track, `${key}-packet-${i}`)
        )
        : rests.map((rest, i) => Resting(h, rest, i))
    )
  )
}
