/**
 * `HtmlHead`'s fold and the helpers it shares with the hosts. They are apart from `HtmlHead` so that
 * `Html`, the browser host and the server reach them without loading that module, which brings the
 * browser's sync of tags and attributes with it.
 */
import * as Head from "../../Head.ts"
import * as headFold from "../../internal/headFold.ts"
import type { Entry, HtmlHead, JsonLd, Link, Meta } from "../HtmlHead.ts"
import * as headAttributes from "./headAttributes.ts"

/** @internal */
export const empty: HtmlHead = {
  title: undefined,
  meta: [],
  links: [],
  jsonLd: [],
  html: { lang: undefined, dir: undefined, class: [], data: {} },
  body: { class: [], data: {} }
}

/** @internal */
export const identity = (entry: Meta | Link | JsonLd): string => {
  switch (entry._tag) {
    case "Meta":
      return entry.key !== undefined
        ? `meta key:${entry.key}`
        : entry.name !== undefined
        ? `meta name:${entry.name}`
        : `meta property:${entry.property}`
    case "Link": {
      const normalized = new Map(headAttributes.normalize(attributes(entry)))
      return normalized.get("rel") === "canonical"
        ? "link canonical"
        : entry.key !== undefined
        ? `link key:${entry.key}`
        : `link ${normalized.get("rel")} ${normalized.get("href")}`
    }
    case "JsonLd":
      return entry.key !== undefined ? `jsonld key:${entry.key}` : `jsonld ${entry.json}`
  }
}

/** @internal */
export const attributes = (entry: Meta | Link): ReadonlyArray<readonly [string, string]> => {
  if (entry._tag === "Meta") {
    return [
      entry.name !== undefined ? ["name", entry.name] as const : ["property", entry.property!] as const,
      ["content", entry.content]
    ]
  }
  const out: Array<readonly [string, string]> = []
  for (const [name, value] of Object.entries(entry.attributes)) {
    if (value !== undefined) out.push([name, value])
  }
  return out
}

/** The single slots a value holds, each with its value's signature. */
const slotsOf = (head: HtmlHead): ReadonlyMap<string, string> => {
  const out = new Map<string, string>()
  if (head.title !== undefined) out.set("title", head.title)
  if (head.html.lang !== undefined) out.set("lang", head.html.lang)
  if (head.html.dir !== undefined) out.set("dir", head.html.dir)
  for (const entry of head.meta) out.set(identity(entry), entry.content)
  for (const entry of head.links) {
    const id = identity(entry)
    if (id === "link canonical") out.set(id, JSON.stringify(attributes(entry)))
  }
  return out
}

const combine = (node: Head.Tree<Entry, HtmlHead>, children: ReadonlyArray<HtmlHead>): HtmlHead => {
  const meta = new Map<string, Meta>()
  const links = new Map<string, Link>()
  const json = new Map<string, JsonLd>()
  let lang: string | undefined
  let dirValue: "ltr" | "rtl" | undefined
  const htmlClasses = new Set<string>()
  const bodyClasses = new Set<string>()
  const htmlDataMap = new Map<string, string>()
  const bodyDataMap = new Map<string, string>()
  for (const entry of node.entries) {
    switch (entry._tag) {
      case "Meta":
        meta.set(identity(entry), entry)
        break
      case "Link":
        links.set(identity(entry), entry)
        break
      case "JsonLd":
        json.set(identity(entry), entry)
        break
      case "Lang":
        lang = entry.code
        break
      case "Dir":
        dirValue = entry.dir
        break
      case "HtmlClass":
        for (const token of entry.tokens) htmlClasses.add(token)
        break
      case "BodyClass":
        for (const token of entry.tokens) bodyClasses.add(token)
        break
      case "HtmlData": {
        const name = headAttributes.name(entry.name)
        if (name !== undefined) htmlDataMap.set(name, entry.value)
        break
      }
      case "BodyData": {
        const name = headAttributes.name(entry.name)
        if (name !== undefined) bodyDataMap.set(name, entry.value)
        break
      }
    }
  }
  let below: string | undefined
  for (const child of children) {
    if (child.title !== undefined) below = child.title
    for (const entry of child.meta) meta.set(identity(entry), entry)
    for (const entry of child.links) links.set(identity(entry), entry)
    for (const entry of child.jsonLd) json.set(identity(entry), entry)
    if (child.html.lang !== undefined) lang = child.html.lang
    if (child.html.dir !== undefined) dirValue = child.html.dir
    for (const token of child.html.class) htmlClasses.add(token)
    for (const token of child.body.class) bodyClasses.add(token)
    for (const [name, value] of Object.entries(child.html.data)) htmlDataMap.set(name, value)
    for (const [name, value] of Object.entries(child.body.data)) bodyDataMap.set(name, value)
  }
  return {
    title: Head.resolveTitle(node, below),
    meta: [...meta.values()],
    links: [...links.values()],
    jsonLd: [...json.values()],
    html: { lang, dir: dirValue, class: [...htmlClasses], data: Object.fromEntries(htmlDataMap) },
    body: { class: [...bodyClasses], data: Object.fromEntries(bodyDataMap) }
  }
}

/** @internal */
export const merge: (tree: Head.Tree<Entry, HtmlHead>, options?: Head.MergeOptions) => HtmlHead =
  /* @__PURE__ */ headFold.plain((tree: Head.Tree<Entry, HtmlHead>, options?: Head.MergeOptions): HtmlHead => {
    const onConflict = options?.onConflict
    return headFold.fold(
      tree,
      { combine, slots: slotsOf },
      onConflict === undefined ? undefined : (slot, earlier, later) => onConflict(Head.conflict(slot, earlier, later))
    )
  })
