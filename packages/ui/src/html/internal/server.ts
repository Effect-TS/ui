/**
 * Server HTML: the tree, the head tags and the `<html>` / `<body>` attributes
 * as escaped strings.
 */
import type * as Renderer from "../../Renderer.ts"
import * as Head from "../HtmlHead.ts"
import * as elements from "./elements.ts"
import * as headAttributes from "./headAttributes.ts"
import * as markers from "./markers.ts"

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const voidTags: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr"
])

/**
 * Elements whose content the HTML parser reads as text: escaped text
 * (`textarea`, `title`) or raw text. Markers or tags inside them would become
 * part of the text, so the server writes only their text.
 *
 * @internal
 */
export const textOnlyTags: ReadonlySet<string> = new Set([
  "textarea",
  "title",
  "script",
  "style",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "noscript"
])

const escapedTextTags: ReadonlySet<string> = new Set(["textarea", "title"])

/** Elements whose first newline the HTML parser drops. */
const newlineTags: ReadonlySet<string> = new Set(["pre", "textarea", "listing"])

// Most text and values need no escaping, and are returned as they are without a replace.
const textSpecial = /[&<>]/
const attributeSpecial = /[&"<>]/

const escapeText = (text: string): string =>
  textSpecial.test(text)
    ? text.replace(/[&<>]/g, (char) => char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;")
    : text

const escapeAttribute = (value: string): string =>
  attributeSpecial.test(value)
    ? value.replace(
      /[&"<>]/g,
      (char) => char === "&" ? "&amp;" : char === "\"" ? "&quot;" : char === "<" ? "&lt;" : "&gt;"
    )
    : value

type ServerNode = Renderer.ServerNode
type ServerElement = Extract<ServerNode, { readonly _tag: "Element" }>

const textOf = (nodes: ReadonlyArray<ServerNode>): string =>
  nodes.map((node) => node._tag === "Text" ? node.text : textOf(node.children)).join("")

/**
 * An element's attributes, with its controlled properties written as the
 * attributes that give the same initial state. Other properties are set when
 * the client adopts the element.
 */
const elementAttributes = (node: ServerElement, selectValue: string | undefined): Map<string, string> => {
  const out = new Map<string, string>()
  const svg = elements.svgTags.has(node.tag)
  for (const [name, value] of Object.entries(node.attrs)) {
    const normalized = elements.attributeName(name, svg)
    if (normalized !== undefined) out.set(normalized, value)
  }
  for (const [name, value] of Object.entries(node.props)) {
    switch (name) {
      case "value":
        if (node.tag !== "textarea" && node.tag !== "select" && value !== undefined) out.set("value", String(value))
        break
      case "checked":
      case "selected":
      case "open":
        // Only `true`: a modal dialog's `"modal"` has no attribute, so it renders closed until hydration.
        if (value === true) out.set(name, "")
        else out.delete(name)
        break
    }
  }
  if (node.tag === "option" && selectValue !== undefined && !Object.hasOwn(node.props, "selected")) {
    const value = out.get("value") ?? textOf(node.children)
    if (value === selectValue) out.set("selected", "")
  }
  return out
}

/**
 * The text of a text-only element. A textarea with no children shows its
 * value. Raw text that could end the element early is left out; the client
 * builds the children anyway.
 */
const textContent = (node: ServerElement, value: unknown): string => {
  const text = node.children.length === 0 && node.tag === "textarea" && value !== undefined
    ? String(value)
    : textOf(node.children)
  if (escapedTextTags.has(node.tag)) return escapeText(text)
  return new RegExp(`</${node.tag}|<!--`, "i").test(text) ? "" : text
}

/**
 * An element's attributes as HTML, for one with no property and no alias among its attribute names, as
 * most are. `undefined` for any other: `elementAttributes` writes those.
 */
const plainAttributes = (node: ServerElement): string | undefined => {
  for (const _ in node.props) return undefined
  if (node.tag === "option") return undefined
  const svg = elements.svgTags.has(node.tag)
  const attrs = node.attrs
  let out = ""
  for (const name in attrs) {
    const normalized = elements.attributeName(name, svg)
    if (normalized !== name) return undefined
    const value = attrs[name]!
    out += value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`
  }
  return out
}

/** @internal */
export const toHtml = (nodes: ReadonlyArray<ServerNode>, selectValue?: string): string => {
  let out = ""
  for (const node of nodes) {
    switch (node._tag) {
      case "Text":
        out += escapeText(node.text)
        break
      case "Range":
        out += markers.open(node.path) + toHtml(node.children, selectValue) + markers.close(node.path)
        break
      case "Element": {
        out += `<${node.tag}`
        const plain = plainAttributes(node)
        if (plain !== undefined) out += plain
        else {
          for (const [name, value] of elementAttributes(node, selectValue)) {
            out += value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`
          }
        }
        out += ">"
        if (voidTags.has(node.tag)) break
        const value = node.props.value
        let inner = textOnlyTags.has(node.tag)
          ? textContent(node, value)
          : toHtml(
            node.children,
            node.tag === "select" && value !== undefined
              ? String(value)
              : node.tag === "option" || node.tag === "optgroup"
              ? selectValue
              : undefined
          )
        if (newlineTags.has(node.tag) && inner.startsWith("\n")) inner = `\n${inner}`
        out += `${inner}</${node.tag}>`
        break
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

const tag = (name: string, pairs: ReadonlyArray<readonly [string, string]>): string =>
  `<${name}${
    headAttributes.normalize(pairs).map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join("")
  } ${Head.marker}>`

/**
 * The folded head of a root as an `HtmlHead`: a host-neutral root's `Head.Head` holds only the title.
 *
 * @internal
 */
export const htmlHead = (head: unknown): Head.HtmlHead => {
  const value = head as Partial<Head.HtmlHead> | undefined
  return value !== undefined && value.meta !== undefined
    ? value as Head.HtmlHead
    : { ...Head.empty, title: value?.title }
}

/** @internal */
export const headTags = (head: Head.HtmlHead): string => {
  let out = head.title === undefined ? "" : `<title ${Head.marker}>${escapeText(head.title)}</title>`
  for (const entry of head.meta) out += tag("meta", Head.attributes(entry))
  for (const entry of head.links) out += tag("link", Head.attributes(entry))
  // The JSON is canonical, with `<` escaped, so it can't end the script.
  for (const entry of head.jsonLd) out += `${tag("script", [["type", "application/ld+json"]])}${entry.json}</script>`
  return out
}

/** The attributes the head sets on `<html>`, in the order the browser host lists them in the marker. */
/** @internal */
export const htmlOwned = (head: Head.HtmlHead): ReadonlyArray<readonly [string, string]> => [
  ...(head.html.lang === undefined ? [] : [["lang", head.html.lang] as const]),
  ...(head.html.dir === undefined ? [] : [["dir", head.html.dir] as const]),
  ...bodyOwned({ ...head, body: head.html })
]

/** @internal */
export const bodyOwned = (head: Head.HtmlHead): ReadonlyArray<readonly [string, string]> => [
  ...(head.body.class.length === 0 ? [] : [["class", head.body.class.join(" ")] as const]),
  ...Object.entries(head.body.data)
]

/** Escaped attributes, plus the marker listing their names; empty when the head sets none. */
/** @internal */
export const attributes = (pairs: ReadonlyArray<readonly [string, string]>): string => {
  const normalized = headAttributes.normalize(pairs)
  return normalized.length === 0 ? "" : [
    ...normalized.map(([name, value]) => `${name}="${escapeAttribute(value)}"`),
    `${Head.marker}="${escapeAttribute(normalized.map(([name]) => name).join(" "))}"`
  ].join(" ")
}
