/**
 * The HTML vocabulary's head: meta and link tags, JSON-LD blocks, and the
 * `lang`, `dir`, `class` and `data-*` attributes of `<html>` and
 * `<body>`, on top of the host-neutral `Head.title` and
 * `Head.titleTemplate`.
 *
 * A component whose `elements` is `HtmlHead.vocabulary` returns these
 * entries from its `head` option, next to `Head`'s. The vocabulary is
 * `Html` with `merge` as its fold, so the runtime folds the placed tree into
 * one `HtmlHead`, which the browser host diffs against the document and the
 * server prints. A component on `Html` itself takes `Head`'s entries only,
 * and an app that declares no HTML head doesn't carry this module.
 *
 * **Merge rules**
 *
 * - A node's value is its own entries followed by its children's values, so
 *   a descendant overrides its ancestors. Children are taken in the order of
 *   their paths, never in document order. The node's `reduce` entries
 *   then map the value, in written order.
 * - The title, `lang`, `dir` and `<link rel="canonical">` each have one entry.
 *   A meta tag is identified by its `key`, else its `name` or `property`; a
 *   link by its `key`, else `rel` plus `href`; a JSON-LD block by its `key`,
 *   else its canonical form. `data-*` attributes have one entry per name.
 * - Siblings that set one of these to the same value pass it up once. When
 *   they set different values it's left unset, and reported as a
 *   `Head.Conflict` unless a `reduce` above them sets it.
 * - `class` tokens are unioned in the order they were first contributed.
 * - Titles follow `Head`'s template rule.
 *
 * **Example** (A layout template and a page)
 *
 * ```ts import.meta.vitest
 * import { Head } from "@effect/ui"
 * import { HtmlHead } from "@effect/ui/html"
 *
 * const head = HtmlHead.merge({
 *   entries: [Head.titleTemplate((title) => `${title} · App`), HtmlHead.lang("en")],
 *   children: [{
 *     entries: [Head.title("Ada"), HtmlHead.meta({ name: "description", content: "Ada's page" })],
 *     children: []
 *   }]
 * })
 *
 * head.title // => "Ada · App"
 * head.html.lang // => "en"
 * head.meta.map((meta) => meta.content) // => ["Ada's page"]
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Head from "../Head.ts"
import * as headFold from "../internal/headFold.ts"
import type * as View from "../View.ts"
import * as Html from "./Html.ts"
import * as documentHead from "./internal/documentHead.ts"
import * as headSync from "./internal/head.ts"
import * as headAttributes from "./internal/headAttributes.ts"

/**
 * One entry of the HTML vocabulary's head: `Head`'s entries, or one of the
 * HTML ones.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Entry =
  | Head.Entry
  | Reduce
  | Meta
  | Link
  | Lang
  | Dir
  | JsonLd
  | HtmlClass
  | BodyClass
  | HtmlData
  | BodyData

/**
 * A `<meta>` tag, named by `name` or by `property`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Meta {
  readonly _tag: "Meta"
  readonly name: string | undefined
  readonly property: string | undefined
  readonly content: string
  readonly key: string | undefined
}

/**
 * The attributes a `<link>` tag may have.
 *
 * **Details**
 *
 * Links have no `nonce` and no event attributes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LinkAttributes {
  readonly rel: string
  readonly href: string
  readonly hreflang?: string | undefined
  readonly type?: string | undefined
  readonly media?: string | undefined
  readonly as?: string | undefined
  readonly sizes?: string | undefined
  readonly crossorigin?: string | undefined
  readonly imagesrcset?: string | undefined
  readonly imagesizes?: string | undefined
}

/**
 * A `<link>` tag.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Link {
  readonly _tag: "Link"
  readonly attributes: LinkAttributes
  readonly key: string | undefined
}

/**
 * The `lang` attribute of `<html>`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Lang {
  readonly _tag: "Lang"
  readonly code: string
}

/**
 * The `dir` attribute of `<html>`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Dir {
  readonly _tag: "Dir"
  readonly dir: "ltr" | "rtl"
}

/**
 * A JSON-LD block, rendered as `<script type="application/ld+json">`.
 *
 * **Details**
 *
 * `json` is the canonical form: keys sorted recursively, undefined properties
 * dropped, and `<` escaped as `\u003c`, so it's safe inside a script tag and
 * two equal values always print the same.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface JsonLd {
  readonly _tag: "JsonLd"
  readonly value: object
  readonly json: string
  readonly key: string | undefined
}

/**
 * Class tokens for `<html>`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HtmlClass {
  readonly _tag: "HtmlClass"
  readonly tokens: ReadonlyArray<string>
}

/**
 * Class tokens for `<body>`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface BodyClass {
  readonly _tag: "BodyClass"
  readonly tokens: ReadonlyArray<string>
}

/**
 * A `data-*` attribute of `<html>`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HtmlData {
  readonly _tag: "HtmlData"
  readonly name: `data-${string}`
  readonly value: string
}

/**
 * A `data-*` attribute of `<body>`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface BodyData {
  readonly _tag: "BodyData"
  readonly name: `data-${string}`
  readonly value: string
}

/**
 * A `data-*` attribute name. `data-eui` is the framework's marker, so it's
 * excluded.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type DataName<N extends string> = N extends "data-eui" ? never
  : N extends `data-${string}` ? N
  : never

/**
 * What a JSON-LD block accepts: an object whose properties aren't functions,
 * dates, bigints or symbols. Deeper levels are checked when the entry is
 * built.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type JsonLdValue<A extends object> =
  & A
  & {
    readonly [K in keyof A]: A[K] extends Function | Date | bigint | symbol
      ? never
      : A[K]
  }

/**
 * The marker attribute on every head tag the framework writes.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const marker = headAttributes.marker

/**
 * Adds a `<meta>` tag, named by `name` or by `property`.
 *
 * **Details**
 *
 * Its identity is `key`, else the `name` or `property`. `http-equiv` meta tags
 * and `<meta charset>` belong to the shell and aren't entries.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const meta = (
  options:
    | {
      readonly name: string
      readonly content: string
      readonly key?: string | undefined
    }
    | {
      readonly property: string
      readonly content: string
      readonly key?: string | undefined
    }
): Meta => ({
  _tag: "Meta",
  name: "name" in options ? options.name : undefined,
  property: "property" in options ? options.property : undefined,
  content: options.content,
  key: options.key
})

/**
 * Adds a `<link>` tag.
 *
 * **Details**
 *
 * `rel="canonical"` has one entry. Other links are identified by `key`,
 * else by `rel` plus `href`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const link = (
  options: LinkAttributes & { readonly key?: string | undefined }
): Link => {
  const { key, ...attributes } = options
  return { _tag: "Link", attributes, key }
}

/**
 * Sets the `lang` attribute of `<html>`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const lang = (code: string): Lang => ({ _tag: "Lang", code })

/**
 * Sets the `dir` attribute of `<html>`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const dir = (dir: "ltr" | "rtl"): Dir => ({ _tag: "Dir", dir })

/**
 * Adds a JSON-LD block.
 *
 * **Details**
 *
 * The value is an object, never a top-level array: use `@graph` for several
 * nodes. It's identified by `key`, else by its canonical form, and the host
 * rewrites a block only when its canonical form changes.
 *
 * The type rejects functions, dates, bigints and symbols one level deep. When
 * the entry is built, deeper levels are checked too: an object whose prototype
 * isn't `Object.prototype` or `null` (a `Date`, `Map`, `Option` or class
 * instance), or an array holding `NaN`, `Infinity` or `undefined`, throws an
 * error naming its JSON path. In a `head` option that fails the instance.
 * The check runs in every build, not only in development: `effect` has no
 * development switch, and it shares the walk the canonical serialisation
 * makes anyway.
 *
 * **Example** (Describing a person)
 *
 * ```ts import.meta.vitest
 * import { HtmlHead } from "@effect/ui/html"
 *
 * const entry = HtmlHead.jsonLd({ "@context": "https://schema.org", "@type": "Person", name: "Ada <Lovelace>" })
 *
 * entry.json // => '{"@context":"https://schema.org","@type":"Person","name":"Ada \\u003cLovelace>"}'
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const jsonLd = <const A extends object>(
  value: JsonLdValue<A>,
  options?: { readonly key?: string | undefined }
): JsonLd => {
  if (Array.isArray(value)) {
    throw new Error(
      "HtmlHead.jsonLd takes an object, not an array. Use @graph for several nodes."
    )
  }
  return {
    _tag: "JsonLd",
    value,
    json: canonicalJson(value),
    key: options?.key
  }
}

const splitTokens = (
  tokens: string | ReadonlyArray<string>
): ReadonlyArray<string> =>
  (typeof tokens === "string" ? [tokens] : tokens).flatMap((token) =>
    token.split(/[\t\n\f\r ]+/)
  ).filter((t) => t !== "")

/**
 * Adds class tokens to `<html>`. Strings are split on ASCII whitespace.
 *
 * **Details**
 *
 * A token becomes the framework's once any entry contributes it, and the
 * browser host removes it once no entry does, even if it was in the shell.
 * Tokens no entry ever contributed are never touched.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const htmlClass = (
  tokens: string | ReadonlyArray<string>
): HtmlClass => ({
  _tag: "HtmlClass",
  tokens: splitTokens(tokens)
})

/**
 * Adds class tokens to `<body>`. Strings are split on ASCII whitespace.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const bodyClass = (
  tokens: string | ReadonlyArray<string>
): BodyClass => ({
  _tag: "BodyClass",
  tokens: splitTokens(tokens)
})

const checkDataName = (name: string) => {
  if (name === marker) {
    throw new Error(
      `${marker} is the framework's marker and can't be set from head`
    )
  }
}

/**
 * Sets a `data-*` attribute of `<html>`. `""` means present and empty.
 *
 * **Details**
 *
 * When the last entry for a name goes away, the browser host removes the
 * attribute, or restores the value the shell had.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const htmlData = <const N extends string>(
  name: N & DataName<N>,
  value: string
): HtmlData => {
  checkDataName(name)
  return { _tag: "HtmlData", name: name as `data-${string}`, value }
}

/**
 * Sets a `data-*` attribute of `<body>`. `""` means present and empty.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const bodyData = <const N extends string>(
  name: N & DataName<N>,
  value: string
): BodyData => {
  checkDataName(name)
  return { _tag: "BodyData", name: name as `data-${string}`, value }
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const pathOf = (path: string, key: string | number): string =>
  typeof key === "number"
    ? `${path}[${key}]`
    : /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`

const canonical = (value: unknown, path: string): unknown => {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value
  if (typeof value === "number") return value
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (
        item === undefined ||
        (typeof item === "number" && !Number.isFinite(item))
      ) {
        throw new Error(
          `HtmlHead.jsonLd: ${pathOf(path, index)} is ${
            String(item)
          }, which JSON can't hold`
        )
      }
      return canonical(item, pathOf(path, index))
    })
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      const name = proto?.constructor?.name
      throw new Error(
        `HtmlHead.jsonLd: ${path} is a${
          name === undefined ? "n object" : ` ${name}`
        }, not a plain object`
      )
    }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key]
      if (item === undefined) continue
      out[key] = canonical(item, pathOf(path, key))
    }
    return out
  }
  throw new Error(
    `HtmlHead.jsonLd: ${path} is a ${typeof value}, which JSON can't hold`
  )
}

/**
 * The canonical JSON of a value: keys sorted recursively, undefined
 * properties dropped and `<` escaped as `\u003c`.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const canonicalJson = (value: object): string =>
  JSON.stringify(canonical(value, "$")).replaceAll("<", "\\u003c")

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * The folded head of a tree, ready for a host.
 *
 * **Details**
 *
 * `title` has the templates applied. `meta`, `links` and `jsonLd` hold one
 * entry per identity, in the order each identity was first contributed: a
 * node's own entries as written, then its children's, ordered by path.
 * `html` and `body` hold the attributes set on those elements; `class`
 * lists tokens in the same order.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HtmlHead extends Head.Head {
  readonly title: string | undefined
  readonly meta: ReadonlyArray<Meta>
  readonly links: ReadonlyArray<Link>
  readonly jsonLd: ReadonlyArray<JsonLd>
  readonly html: {
    readonly lang: string | undefined
    readonly dir: "ltr" | "rtl" | undefined
    readonly class: ReadonlyArray<string>
    readonly data: Readonly<Record<string, string>>
  }
  readonly body: {
    readonly class: ReadonlyArray<string>
    readonly data: Readonly<Record<string, string>>
  }
}

/**
 * Maps the folded head of its node, its own entries merged with its
 * children's values, with every HTML field in view.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Reduce {
  readonly _tag: "HtmlHeadReduce"
  readonly apply: (below: HtmlHead) => HtmlHead
}

/**
 * Maps the folded head of the instance and everything its view placed, such
 * as deriving `og:title` from the title that won.
 *
 * **Details**
 *
 * It runs with the node's other reduce entries, `Head.reduce`'s included,
 * in written order, after its own entries and its children's values are
 * merged. `Head.merge` ignores it.
 *
 * **Example** (Deriving og:title)
 *
 * ```ts import.meta.vitest
 * import { Head } from "@effect/ui"
 * import { HtmlHead } from "@effect/ui/html"
 *
 * const ogTitle = HtmlHead.reduce((below) => ({
 *   ...below,
 *   meta: [...below.meta, HtmlHead.meta({ property: "og:title", content: below.title ?? "App" })]
 * }))
 *
 * const head = HtmlHead.merge({
 *   entries: [Head.titleTemplate((title) => `${title} · App`), ogTitle],
 *   children: [{ entries: [Head.title("Ada")], children: [] }]
 * })
 *
 * head.meta.map((meta) => meta.content) // => ["Ada · App"]
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const reduce = (apply: (below: HtmlHead) => HtmlHead): Reduce => ({
  _tag: "HtmlHeadReduce",
  apply
})

/**
 * The head with no entries.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const empty: HtmlHead = headAttributes.empty

/**
 * The identity of a meta, link or JSON-LD entry: two entries with the same
 * identity are the same entry. In one node's entries the later one wins.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
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
      return entry.key !== undefined
        ? `jsonld key:${entry.key}`
        : `jsonld ${entry.json}`
  }
}

/**
 * The attributes of a meta or link tag, in a stable order, without the
 * marker.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const attributes: (
  entry: Meta | Link
) => ReadonlyArray<readonly [string, string]> = headAttributes.attributes

const linkSignature = (entry: Link): string =>
  headAttributes.normalize(attributes(entry)).map((pair) =>
    JSON.stringify(pair)
  ).sort().join()

const dataSlot = (element: "html" | "body", name: string): string =>
  `${element} ${name}`

const slotsOf = (head: HtmlHead): ReadonlyMap<string, string> => {
  const out = new Map<string, string>()
  if (head.title !== undefined) out.set("title", head.title)
  if (head.html.lang !== undefined) out.set("lang", head.html.lang)
  if (head.html.dir !== undefined) out.set("dir", head.html.dir)
  for (const entry of head.meta) {
    out.set(
      identity(entry),
      entry.key === undefined
        ? entry.content
        : JSON.stringify(attributes(entry))
    )
  }
  for (const entry of head.links) out.set(identity(entry), linkSignature(entry))
  for (const entry of head.jsonLd) out.set(identity(entry), entry.json)
  for (const name in head.html.data) {
    out.set(dataSlot("html", name), head.html.data[name]!)
  }
  for (const name in head.body.data) {
    out.set(dataSlot("body", name), head.body.data[name]!)
  }
  return out
}

const combine = (
  node: Head.Tree<Entry>,
  children: ReadonlyArray<HtmlHead>,
  conflicted: ReadonlySet<string>
): HtmlHead => {
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
    for (const [name, value] of Object.entries(child.html.data)) {
      htmlDataMap.set(name, value)
    }
    for (const [name, value] of Object.entries(child.body.data)) {
      bodyDataMap.set(name, value)
    }
  }
  if (conflicted.has("lang")) lang = undefined
  if (conflicted.has("dir")) dirValue = undefined
  for (const slot of conflicted) {
    meta.delete(slot)
    links.delete(slot)
    json.delete(slot)
  }
  for (const name of htmlDataMap.keys()) {
    if (conflicted.has(dataSlot("html", name))) htmlDataMap.delete(name)
  }
  for (const name of bodyDataMap.keys()) {
    if (conflicted.has(dataSlot("body", name))) bodyDataMap.delete(name)
  }
  return {
    title: conflicted.has("title") ? undefined : Head.resolveTitle(node, below),
    meta: [...meta.values()],
    links: [...links.values()],
    jsonLd: [...json.values()],
    html: {
      lang,
      dir: dirValue,
      class: [...htmlClasses],
      data: Object.fromEntries(htmlDataMap)
    },
    body: { class: [...bodyClasses], data: Object.fromEntries(bodyDataMap) }
  }
}

const reducer = (entry: Entry): ((below: HtmlHead) => HtmlHead) | undefined =>
  entry._tag === "Reduce" || entry._tag === "HtmlHeadReduce"
    ? entry.apply
    : undefined

/**
 * Folds a tree's entries into one `HtmlHead`, applying each node's `reduce`
 * entries bottom up. The `Html` vocabulary installs it as its merge.
 *
 * **Details**
 *
 * A node's value is its own entries, then its children's values ordered by
 * path, so a descendant's entry wins over its ancestor's per identity. The
 * title passes through the `titleTemplate` of each ancestor of the node that
 * set it, nearest first, as `Head.resolveTitle` says. A node's
 * `HtmlHead.reduce` and `Head.reduce` entries then map its value, in
 * written order. A template or a reduce that throws is reported to its
 * node's `onError` and skipped.
 *
 * When siblings set the title, `lang`, `dir`, a `data-*` attribute or a
 * meta, link or JSON-LD entry of one identity to different values, it's left
 * unset. A `reduce` above them that sets it settles it, under its own node's
 * path. Otherwise `onConflict` gets a `Head.Conflict` with every path that
 * set it, sorted.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const merge: (
  tree: Head.Tree<Entry>,
  options?: Head.MergeOptions
) => HtmlHead = /* @__PURE__ */ headFold.plain(
  (tree: Head.Tree<Entry>, options?: Head.MergeOptions): HtmlHead => {
    const onConflict = options?.onConflict
    return headFold.fold(
      tree,
      { combine, slots: slotsOf, reducer },
      onConflict === undefined
        ? undefined
        : (slot, paths) => onConflict(Head.conflict(slot, paths))
    )
  }
)

/**
 * The type-level half of `vocabulary`: `Html`'s elements, with `Entry` as a
 * component's head entries and `HtmlHead` as the folded head.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export interface Elements extends Html.Elements {
  readonly Head: Entry
  readonly HeadValue: HtmlHead
}

/**
 * How `vocabulary` folds its head: `merge`, with the title read from the
 * folded `HtmlHead`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const head: View.HeadFold<Entry, HtmlHead> = {
  merge,
  title: (head) => head.title
}

/**
 * The `Html` vocabulary with the HTML head: its name and tags, and `head` as
 * its fold.
 *
 * **When to use**
 *
 * Use as the `elements` of a component whose `head` returns `HtmlHead`
 * entries, such as `meta`, `link` or `lang`, and of the root of a mount
 * that should fold them. A component that sets only `Head.title` and
 * `Head.titleTemplate` can stay on `Html`.
 *
 * **Details**
 *
 * The mount folds with the root's vocabulary. Under a root without a fold of
 * its own, the first instance in the tree on this vocabulary picks it.
 *
 * **Example** (A page that sets its description)
 *
 * ```ts import.meta.vitest
 * import { Component, Head } from "@effect/ui"
 * import { HtmlHead } from "@effect/ui/html"
 * import { Schema } from "effect"
 *
 * const Page = Component.define({
 *   name: "Page",
 *   model: Schema.Void,
 *   message: Schema.Never,
 *   elements: HtmlHead.vocabulary
 * }).make({
 *   init: () => undefined,
 *   update: () => undefined,
 *   head: () => [Head.title("Ada"), HtmlHead.meta({ name: "description", content: "Ada's page" })],
 *   view: (h) => h.h1("Ada")
 * })
 * ```
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const vocabulary: View.Vocabulary<Elements> = {
  name: Html.name,
  tags: Html.tags,
  head
}

documentHead.load(headSync.makeSync)
