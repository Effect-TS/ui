import type { Html } from "@effect/ui/html"
import type { Node, Tone } from "./trace.ts"

type Kind =
  | "grid"
  | "heading"
  | "text"
  | "field"
  | "label"
  | "aside"
  | "button"
  | "link"
  | "output"

const headings = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
const fields = new Set(["input", "textarea", "select"])

// What to draw a node as, or undefined for one that only holds others.
const kindOf = (node: Node): Kind | undefined => {
  if (node.columns !== null) return "grid"
  if (fields.has(node.tag)) return "field"
  if (node.text.trim() === "") return undefined
  if (headings.has(node.tag)) return "heading"
  switch (node.tag) {
    case "button":
      return "button"
    case "a":
      return "link"
    case "output":
      return "output"
    case "label":
      return "label"
    case "span":
      return "aside"
    default:
      return "text"
  }
}

// These sit side by side, and the rest take a row each.
const inline = new Set<Kind>([
  "label",
  "aside",
  "button",
  "link",
  "output"
])

interface Item {
  readonly kind: Kind
  readonly node: Node
}

// Items in the order the tree lists them, with each run of ones that
// sit side by side gathered into a row.
const rowsOf = (
  nodes: ReadonlyArray<Node>
): ReadonlyArray<ReadonlyArray<Item>> => {
  const rows: Array<Array<Item>> = []
  let open = false
  for (const node of nodes) {
    const kind = kindOf(node)
    if (kind === undefined) continue
    if (inline.has(kind) && open) {
      rows.at(-1)?.push({ kind, node })
    } else {
      rows.push([{ kind, node }])
    }
    open = inline.has(kind)
  }
  return rows
}

const marked = [
  "outline-2 outline-offset-2 outline-accent",
  "motion-safe:transition-[outline-color] motion-safe:duration-200"
].join(" ")

const box = [
  "rounded-md border border-border-strong bg-background",
  "font-features-[normal]"
].join(" ")

const tones: Readonly<Record<Tone, string>> = {
  empty: "bg-background",
  strong: "bg-foreground",
  medium: "bg-muted-foreground",
  accent: "bg-accent"
}

const Draw = <M>(h: Html.H<M>, { kind, node }: Item, key: string) => {
  const mark = node.target !== null && marked
  switch (kind) {
    case "grid":
      return h.div.key(key).class(
        "grid w-full max-w-[15rem] gap-px rounded-sm border",
        "border-border-strong bg-border p-px",
        mark
      ).style({
        gridTemplateColumns: `repeat(${node.columns}, minmax(0, 1fr))`
      }).children(
        node.cells.map((tone, at) =>
          h.span.key(String(at)).class("aspect-square", tones[tone])
        )
      )
    case "heading":
      return h.p.key(key).class(
        "rounded-sm font-semibold text-pretty",
        node.tag === "h1" ? "text-base/[1.4]" : "text-sm/[1.4]",
        mark
      ).children(node.text)
    case "text":
      return h.p.key(key).class(
        "rounded-sm text-[0.8125rem]/[1.5] text-muted-foreground",
        "text-pretty",
        mark
      ).children(node.text)
    case "field": {
      const value = node.value ?? ""
      const shown = node.type === "password"
        ? "•".repeat(value.length)
        : value
      return h.p.key(key).class(
        box,
        "min-h-[2.125rem] px-2.5 py-1.5 font-mono text-[0.8125rem]/[1.5]",
        "wrap-anywhere",
        shown === "" && "text-muted-foreground",
        mark
      ).children(shown === "" ? node.placeholder ?? "" : shown)
    }
    case "button":
      return h.span.key(key).class(
        box,
        "px-3 py-1 text-control font-medium whitespace-nowrap",
        // Off, drawn as a control set back into the page.
        node.isDisabled && "bg-muted text-muted-foreground",
        mark
      ).children(node.text)
    case "link":
      return h.span.key(key).class(
        "rounded-sm text-[0.8125rem]/[1.5] underline",
        "decoration-border-strong underline-offset-3",
        mark
      ).children(node.text)
    case "output":
      return h.span.key(key).class(
        "min-w-[3ch] rounded-sm text-center font-mono text-xl/[1.4]",
        "font-semibold tabular-nums font-features-[normal]",
        mark
      ).children(node.text)
    case "label":
      return h.span.key(key).class(
        "rounded-sm text-[0.8125rem]/[1.5] font-medium",
        mark
      ).children(node.text)
    case "aside":
      return h.span.key(key).class(
        "rounded-sm text-[0.8125rem]/[1.5] text-muted-foreground",
        mark
      ).children(node.text)
  }
}

/**
 * The tree a test host holds, drawn in this page's own styles: its
 * headings, text, fields, buttons and links, in order. The host keeps
 * no styles and no layout, so this is a sketch of the app, with the
 * element a step acted on outlined.
 */
export const Wireframe = <M>(
  h: Html.H<M>,
  nodes: ReadonlyArray<Node>
) =>
  h.div.class("flex flex-col gap-2.5").children(
    rowsOf(nodes).map((row, index) => {
      const [first] = row
      return first !== undefined && row.length === 1 &&
          !inline.has(first.kind)
        ? Draw(h, first, String(index))
        : h.div.key(String(index)).class(
          "flex flex-wrap items-center gap-x-2 gap-y-1.5"
        ).children(
          row.map((item, at) => Draw(h, item, String(at)))
        )
    })
  )
