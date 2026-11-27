import type { Html } from "@effect/ui/html"
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Copy,
  Database,
  Download,
  History,
  type IconNode,
  Layers,
  Link,
  ListOrdered,
  Loader,
  MousePointerClick,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Scissors,
  Server,
  SlidersHorizontal,
  Split,
  Trash2,
  Workflow
} from "lucide"

// The Lucide icons the article draws, by the name it uses for each.
const icons = {
  activity: Activity,
  back: ArrowLeft,
  blocks: Blocks,
  bot: Bot,
  check: Check,
  chevron: ChevronDown,
  clock: Clock,
  copy: Copy,
  cut: Scissors,
  database: Database,
  download: Download,
  external: ArrowUpRight,
  filter: SlidersHorizontal,
  history: History,
  kept: CircleCheck,
  layers: Layers,
  link: Link,
  list: ListOrdered,
  loader: Loader,
  next: ArrowRight,
  pause: Pause,
  play: Play,
  plug: Plug,
  pointer: MousePointerClick,
  reset: RotateCcw,
  server: Server,
  split: Split,
  trash: Trash2,
  workflow: Workflow
} satisfies Record<string, IconNode>

export type IconName = keyof typeof icons

/**
 * A decorative Lucide icon in the text colour. It is a line drawing
 * unless `filled`, and 1rem square unless `class` sets its size.
 */
export const Icon = <M>(
  h: Html.H<M>,
  name: IconName,
  options: {
    readonly class?: string | undefined
    readonly filled?: boolean | undefined
  } = {}
) =>
  h.svg.class("flex-none", options.class ?? "size-4").attrs({
    viewBox: "0 0 24 24",
    fill: options.filled === true ? "currentColor" : "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true"
  }).children(
    icons[name].map(([tag, attrs], index) =>
      h.el(tag).key(String(index)).attrs(
        Object.fromEntries(
          Object.entries(attrs).map(([key, value]) => [
            key,
            String(value)
          ])
        )
      )
    )
  )
