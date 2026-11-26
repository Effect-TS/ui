import type * as View from "@effect/ui/View"

// A data attribute is present, with an empty value, or absent.
export const flag = (on: boolean | undefined): string | undefined =>
  on === true ? "" : undefined

// A part adds its declarations, in `forward`, after the consumer's inline
// style, so its own win and the consumer's others stay, including a style
// chained after the part.
export const withStyle = (consumer: string | undefined, own: string): string =>
  consumer === undefined || consumer.trim() === ""
    ? own
    : consumer.replace(/;\s*$/, "") + ";" + own

const asciiSpace = /[ \t\n\f\r]+/

export const withTokens = (
  consumer: string | undefined,
  own: string | undefined
): string | undefined => {
  if (own === undefined) return consumer
  if (consumer === undefined) return own
  const tokens = consumer.split(asciiSpace).filter((token) => token !== "")
  if (tokens.length === 0) return own
  return tokens.includes(own) ? consumer : consumer + " " + own
}

export const ownStyle = (own: string) =>
<
  N extends Attributed<N> & {
    readonly elementAttrs: { readonly style?: string | undefined }
  }
>(node: N): N => node.attr("style", withStyle(node.elementAttrs.style, own))

export const attrOf = (builder: unknown, name: string): string | undefined =>
  (builder as {
    readonly elementAttrs?: Readonly<Record<string, string>> | undefined
  }).elementAttrs?.[name]

export const idOf = (builder: unknown): string | null => {
  const id = attrOf(builder, "id")
  return id === undefined || id === "" ? null : id
}

// Visually hidden, but read by screen readers.
export const visuallyHidden =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0"

export const noSelect = "user-select:none;-webkit-user-select:none"

export const attrSelector = (name: string, value: string): string =>
  `[${name}="${value.replace(/["\\]/g, "\\$&")}"]`

export const idSelector = (id: string): string => attrSelector("id", id)

export type Keyed<Tag extends string> = View.PartTarget<Tag> & {
  readonly key: (key: string) => View.PartTarget<Tag>
}

export interface Attributed<B> {
  readonly attr: (name: string, value: string | undefined) => B
  readonly attrs: (
    attributes: Readonly<Record<string, string | undefined>>
  ) => B
}

export type Named = { readonly elementAttrs: Readonly<Record<string, string>> }

const namedOf = (node: Named): boolean =>
  node.elementAttrs["aria-label"] !== undefined ||
  node.elementAttrs["aria-labelledby"] !== undefined

const wordy = /[\p{L}\p{N}]/u

// Text with a letter or digit names an element, an icon such as "×" doesn't.
// A child component or slot is "unknown", as its output can't be seen here.
const namingOf = (
  children: ReadonlyArray<View.Node<unknown, any>>
): "named" | "unnamed" | "unknown" => {
  let naming: "unnamed" | "unknown" = "unnamed"
  for (const child of children) {
    switch (child._tag) {
      case "Text":
        if (wordy.test(child.text)) return "named"
        break
      case "Element": {
        const attrs = child.attrs
        if (attrs["aria-hidden"] === "true" || attrs.hidden !== undefined) break
        if ((attrs["aria-label"] ?? attrs.alt ?? "").trim() !== "") {
          return "named"
        }
        const inner = namingOf(child.children)
        if (inner === "named") return "named"
        if (inner === "unknown") naming = "unknown"
        break
      }
      default:
        naming = "unknown"
    }
  }
  return naming
}

// With unknown children it's a `title`, which names the element only when
// they don't. Apply it in `forward`, so a name given after the part wins.
export const fallbackLabel = (label: string) =>
<
  B extends Attributed<B> & Named & {
    readonly content: ReadonlyArray<View.Node<unknown, any>> | undefined
  }
>(node: B): B => {
  if (namedOf(node) || node.elementAttrs.title !== undefined) return node
  switch (namingOf(node.content ?? [])) {
    case "named":
      return node
    case "unknown":
      return node.attr("title", label)
    case "unnamed":
      return node.attr("aria-label", label)
  }
}

export const fallbackLabelledBy = <B extends Attributed<B> & Named>(
  node: B,
  id: string | undefined
): B =>
  id === undefined || namedOf(node) ? node : node.attr("aria-labelledby", id)

export const defaults = <B extends Attributed<B> & Named>(
  node: B,
  attrs: Readonly<Record<string, string>>
): B =>
  Object.entries(attrs).reduce(
    (out, [name, value]) =>
      node.elementAttrs[name] === undefined ? out.attr(name, value) : out,
    node
  )

// For an input the user types free text into.
export const textInputDefaults = {
  autocomplete: "off",
  autocorrect: "off",
  spellcheck: "false"
}

export const pressedAttrs = <
  B extends Attributed<B> & { readonly disabled: (disabled: boolean) => B }
>(
  button: B,
  pressed: boolean,
  disabled: boolean
): B =>
  button
    .attrs({
      type: "button",
      "aria-pressed": String(pressed),
      "aria-disabled": undefined,
      "data-pressed": flag(pressed),
      "data-disabled": flag(disabled)
    })
    .disabled(disabled)

export const separatorAttrs = <B extends Attributed<B>>(
  builder: B,
  orientation: "horizontal" | "vertical"
): B =>
  builder.attrs({
    role: "separator",
    "aria-orientation": orientation,
    "data-orientation": orientation
  })
