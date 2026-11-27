/**
 * Locates elements by ARIA role and accessible name, computed from tags and
 * attributes, so a test finds elements the way assistive technology does.
 *
 * The same lookups run over a scene's view value, a `TestHost` tree and a
 * real DOM tree. `role`, `label` and `placeholder` return a `Locator`, so
 * they combine with `Locator.inside` on the first two. On the DOM, `click`,
 * `type`, `keydown` and `submit` act as the user would, through real DOM
 * events, and refuse an inert element.
 *
 * Hidden elements (`hidden`, `aria-hidden="true"`, `<input type="hidden">`)
 * and their descendants are excluded from role queries, as are inert
 * elements. `hidden: true` includes both, but does not make inert elements
 * interactive.
 *
 * Inertness comes from `inert` on an element or ancestor, or being outside
 * the topmost modal. The last open modal in document order is treated as
 * topmost. DOM modal detection uses `:modal`, including open shadow roots;
 * some test environments never match it. DOM inertness follows shadow hosts
 * and slots, but queries do not search inside shadow roots.
 *
 * On a structural tree a match is typed `Locator.Node`, since it can be any
 * node of the tree. On `TestHost`, `root.all(HtmlLocator.role(...))` keeps the
 * host's node type. On the DOM a match is an `HTMLElement`.
 *
 * **Example** (Finding a button by its name)
 *
 * ```ts import.meta.vitest
 * import { HtmlLocator } from "@effect/ui/html/testing"
 *
 * const tree = {
 *   tag: "form",
 *   children: [
 *     { tag: "label", attrs: { for: "new" }, children: [{ text: "New todo" }] },
 *     { tag: "input", attrs: { id: "new" } },
 *     { tag: "button", attrs: { type: "submit" }, children: [{ text: "Add" }] }
 *   ]
 * }
 *
 * console.log(HtmlLocator.getByRole(tree, "button", { name: "Add" }) === tree.children[2]) // true
 * console.log(HtmlLocator.nameOf(tree, HtmlLocator.getByRole(tree, "textbox"))) // "New todo"
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Locator from "../../testing/Locator.ts"

// ---------------------------------------------------------------------------
// trees
// ---------------------------------------------------------------------------

/** One way to read a tree: the structural `Locator.Node` shape or the DOM. */
interface Reader<N> {
  readonly isElement: (node: N) => boolean
  readonly tag: (node: N) => string
  readonly attr: (node: N, name: string) => string | undefined
  readonly prop: (node: N, name: string) => unknown
  readonly children: (node: N) => ReadonlyArray<N>
  /** The text of a text node, or `undefined` for anything else. */
  readonly text: (node: N) => string | undefined
}

const isDom = (node: unknown): node is globalThis.Node =>
  typeof node === "object" && node !== null &&
  typeof (node as { nodeType?: unknown }).nodeType === "number"

const domReader: Reader<globalThis.Node> = {
  isElement: (node) => node.nodeType === 1,
  tag: (node) => (node as globalThis.Element).localName,
  attr: (node, name) =>
    node.nodeType === 1
      ? ((node as globalThis.Element).getAttribute(name) ?? undefined)
      : undefined,
  prop: (node, name) => (node as any)[name],
  children: (node) => Array.from(node.childNodes),
  text: (node) =>
    node.nodeType === 3 ? (node as globalThis.Text).data : undefined
}

const structuralReader: Reader<Locator.Node> = {
  isElement: (node) => node.tag !== undefined,
  tag: (node) => node.tag!,
  attr: (node, name) => node.attrs?.[name],
  prop: (node, name) => node.props?.[name],
  children: (node) => node.children ?? [],
  text: (node) => node.tag === undefined ? node.text : undefined
}

const readerOf = (node: unknown): Reader<any> =>
  isDom(node) ? domReader : structuralReader

// ---------------------------------------------------------------------------
// roles
// ---------------------------------------------------------------------------

/** Elements under which `header` and `footer` lose their landmark role. */
const sectioning: ReadonlySet<string> = new Set([
  "article",
  "aside",
  "main",
  "nav",
  "section"
])

const fixedRoles: Readonly<Record<string, string>> = {
  article: "article",
  aside: "complementary",
  blockquote: "blockquote",
  button: "button",
  caption: "caption",
  code: "code",
  datalist: "listbox",
  dd: "definition",
  del: "deletion",
  details: "group",
  dfn: "term",
  dialog: "dialog",
  dt: "term",
  em: "emphasis",
  fieldset: "group",
  figure: "figure",
  form: "form",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  hr: "separator",
  ins: "insertion",
  li: "listitem",
  main: "main",
  menu: "list",
  meter: "meter",
  nav: "navigation",
  ol: "list",
  optgroup: "group",
  option: "option",
  output: "status",
  p: "paragraph",
  progress: "progressbar",
  search: "search",
  strong: "strong",
  sub: "subscript",
  sup: "superscript",
  table: "table",
  tbody: "rowgroup",
  td: "cell",
  textarea: "textbox",
  tfoot: "rowgroup",
  thead: "rowgroup",
  time: "time",
  tr: "row",
  ul: "list"
}

const inputRole = (type: string, hasList: boolean): string | undefined => {
  switch (type) {
    case "button":
    case "image":
    case "reset":
    case "submit":
      return "button"
    case "checkbox":
      return "checkbox"
    case "radio":
      return "radio"
    case "range":
      return "slider"
    case "number":
      return "spinbutton"
    case "search":
      return hasList ? "combobox" : "searchbox"
    case "":
    case "email":
    case "tel":
    case "text":
    case "url":
      return hasList ? "combobox" : "textbox"
    default:
      return undefined
  }
}

/** Roles whose accessible name comes from their content when nothing else names them. */
const nameFromContent: ReadonlySet<string> = new Set([
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "gridcell",
  "heading",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "row",
  "rowheader",
  "switch",
  "tab",
  "tooltip",
  "treeitem"
])

// ---------------------------------------------------------------------------
// the index of a tree
// ---------------------------------------------------------------------------

interface Entry<N> {
  readonly node: N
  readonly role: string | undefined
  readonly hidden: boolean
  readonly inSection: boolean
}

interface Index<N> {
  readonly reader: Reader<N>
  readonly entries: ReadonlyArray<Entry<N>>
  readonly byNode: Map<N, Entry<N>>
  readonly byId: Map<string, N>
  /** The `label` elements of each labeled control, in document order. */
  readonly labels: Map<N, Array<N>>
}

/** Whether a `dialog` is open: its `open` property, or its `open` attribute when no property was set. */
const dialogOpen = <N>(reader: Reader<N>, node: N): boolean => {
  const open = reader.prop(node, "open")
  return open === undefined
    ? reader.attr(node, "open") !== undefined
    : open === true || open === "modal"
}

/**
 * Whether a popover is showing: its `popoverOpen` property, set by `.popover`, or `:popover-open` on a DOM
 * element. A DOM without `:popover-open` reports it closed.
 */
const popoverOpen = <N>(reader: Reader<N>, node: N): boolean => {
  const open = reader.prop(node, "popoverOpen")
  if (open !== undefined || !isDom(node)) return open === true
  try {
    return (node as unknown as globalThis.Element).matches(":popover-open")
  } catch {
    return false
  }
}

/** Whether a dialog or popover is neither open as a dialog nor showing as a popover. */
const notShown = <N>(reader: Reader<N>, node: N): boolean => {
  const dialog = reader.tag(node) === "dialog"
  const popover = reader.attr(node, "popover") !== undefined
  if (!dialog && !popover) return false
  return !((dialog && dialogOpen(reader, node)) ||
    (popover && popoverOpen(reader, node)))
}

/** A defined property takes precedence over the attribute. */
const flag = <N>(reader: Reader<N>, node: N, name: string): boolean => {
  const prop = reader.prop(node, name)
  return prop === true ||
    (prop === undefined && reader.attr(node, name) !== undefined)
}

/** Approximates top-layer order with document order, including open shadow roots. */
const topModal = <N>(reader: Reader<N>, root: N): N | undefined => {
  let modal: N | undefined
  const walk = (node: N) => {
    if (
      reader.isElement(node) && reader.tag(node) === "dialog" &&
      dialogState(node) === "modal"
    ) modal = node
    const shadow = isDom(node)
      ? (node as unknown as globalThis.Element).shadowRoot
      : null
    if (shadow != null) walk(shadow as N)
    for (const child of reader.children(node)) walk(child)
  }
  walk(root)
  return modal
}

const isHidden = <N>(reader: Reader<N>, node: N): boolean =>
  reader.attr(node, "hidden") !== undefined ||
  reader.attr(node, "aria-hidden") === "true" ||
  (reader.tag(node) === "input" &&
    (reader.attr(node, "type") ?? "").toLowerCase() === "hidden") ||
  reader.tag(node) === "template" ||
  // A closed dialog or a popover that isn't showing isn't rendered, so neither it nor anything in it is
  // in the accessibility tree. A dialog shown as a popover is rendered, though its `open` is false.
  notShown(reader, node)

const implicitRole = <N>(
  reader: Reader<N>,
  node: N,
  inSection: boolean
): string | undefined => {
  const tag = reader.tag(node)
  switch (tag) {
    case "a":
    case "area":
      return reader.attr(node, "href") !== undefined ? "link" : undefined
    case "header":
      return inSection ? undefined : "banner"
    case "footer":
      return inSection ? undefined : "contentinfo"
    case "img":
      return reader.attr(node, "alt") === "" ? "presentation" : "img"
    case "input":
      return inputRole(
        (reader.attr(node, "type") ?? "").toLowerCase(),
        reader.attr(node, "list") !== undefined
      )
    case "select": {
      const size = Number(reader.attr(node, "size") ?? "1")
      return reader.attr(node, "multiple") !== undefined || size > 1
        ? "listbox"
        : "combobox"
    }
    case "section":
      return reader.attr(node, "aria-label") !== undefined ||
          reader.attr(node, "aria-labelledby") !== undefined ||
          reader.attr(node, "title") !== undefined
        ? "region"
        : undefined
    case "th":
      return reader.attr(node, "scope") === "row" ? "rowheader" : "columnheader"
    default:
      return fixedRoles[tag]
  }
}

const buildIndex = <N>(root: N): Index<N> => {
  const reader = readerOf(root) as Reader<N>
  const index: Index<N> = {
    reader,
    entries: [],
    byNode: new Map(),
    byId: new Map(),
    labels: new Map()
  }
  // Every label in document order, with its first labelable descendant.
  const labels = new Map<N, N | undefined>()
  const entries = index.entries as Array<Entry<N>>
  const modal = topModal(reader, root)
  const walk = (
    node: N,
    hidden: boolean,
    inert: boolean,
    open: ReadonlyArray<N>,
    inSection: boolean
  ) => {
    if (!reader.isElement(node)) {
      // A document, a fragment or a structural wrapper isn't indexed, but what it holds is.
      if (reader.text(node) === undefined) {
        for (const child of reader.children(node)) {
          walk(child, hidden, inert, open, inSection)
        }
      }
      return
    }
    const tag = reader.tag(node)
    // The topmost modal escapes the inertness around it, not its own.
    const inertHere = flag(reader, node, "inert") ||
      (inert && node !== modal)
    const isHiddenHere = hidden || isHidden(reader, node)
    const explicit = reader.attr(node, "role")?.trim().split(/\s+/)[0]
    const entry: Entry<N> = {
      node,
      role: explicit !== undefined && explicit !== ""
        ? explicit
        : implicitRole(reader, node, inSection),
      hidden: isHiddenHere || inertHere,
      inSection
    }
    entries.push(entry)
    index.byNode.set(node, entry)
    const id = reader.attr(node, "id")
    if (id !== undefined && !index.byId.has(id)) index.byId.set(id, node)
    const isLabel = tag === "label"
    if (isLabel) labels.set(node, undefined)
    else if (open.length > 0 && isLabelable(reader, node)) {
      for (const label of open) {
        if (labels.get(label) === undefined) labels.set(label, node)
      }
    }
    const childOpen = isLabel ? [...open, node] : open
    const childSection = inSection || sectioning.has(tag)
    const host = isDom(node) &&
      (node as unknown as globalThis.Element).shadowRoot != null
    for (const child of reader.children(node)) {
      walk(
        child,
        isHiddenHere,
        host
          ? slottedInert(
            node as globalThis.Node,
            child as globalThis.Node,
            inertHere,
            modal as globalThis.Node | undefined
          )
          : inertHere,
        childOpen,
        childSection
      )
    }
  }
  walk(root, false, modal !== undefined, [], false)
  for (const [label, first] of labels) {
    // A label without `for` labels its first labelable descendant.
    const target = reader.attr(label, "for")
    const control = target === undefined ? first : index.byId.get(target)
    if (control === undefined || !isLabelable(reader, control)) continue
    const list = index.labels.get(control)
    if (list === undefined) index.labels.set(control, [label])
    else list.push(label)
  }
  return index
}

// ---------------------------------------------------------------------------
// accessible names
// ---------------------------------------------------------------------------

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim()

const phrasing: ReadonlySet<string> = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "kbd",
  "label",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var"
])

/** The text an element contributes as content: its text, with hidden parts and controls left out. */
const contentText = <N>(
  index: Index<N>,
  node: N,
  skip: N | undefined,
  includeHidden: boolean
): string => {
  const { reader } = index
  const text = reader.text(node)
  if (text !== undefined) return text
  if (!reader.isElement(node) || node === skip) return ""
  if (!includeHidden && isHidden(reader, node)) return ""
  const tag = reader.tag(node)
  if (tag === "br") return " "
  if (tag === "img") return reader.attr(node, "alt") ?? ""
  if (tag === "input" || tag === "select" || tag === "textarea") return ""
  const label = reader.attr(node, "aria-label")
  const inner = label !== undefined && label.trim() !== ""
    ? label
    : reader.children(node).map((child) =>
      contentText(index, child, skip, includeHidden)
    ).join("")
  return phrasing.has(tag) ? inner : ` ${inner} `
}

const textOfIds = <N>(index: Index<N>, ids: string): string =>
  normalize(
    ids.trim().split(/\s+/).map((id) => {
      const node = index.byId.get(id)
      return node === undefined ? "" : contentText(index, node, undefined, true)
    }).join(" ")
  )

const firstChildText = <N>(
  index: Index<N>,
  node: N,
  tag: string
): string | undefined => {
  const child = index.reader.children(node).find((c) =>
    index.reader.isElement(c) && index.reader.tag(c) === tag
  )
  return child === undefined
    ? undefined
    : normalize(contentText(index, child, undefined, false))
}

const computeName = <N>(index: Index<N>, entry: Entry<N>): string => {
  const { reader } = index
  const node = entry.node
  const labelledBy = reader.attr(node, "aria-labelledby")
  if (labelledBy !== undefined && labelledBy.trim() !== "") {
    const name = textOfIds(index, labelledBy)
    if (name !== "") return name
  }
  const label = reader.attr(node, "aria-label")
  if (label !== undefined && label.trim() !== "") return normalize(label)
  const tag = reader.tag(node)
  const type = (reader.attr(node, "type") ?? "").toLowerCase()
  if (
    tag === "input" &&
    (type === "button" || type === "submit" || type === "reset")
  ) {
    const value = reader.attr(node, "value") ??
      (reader.prop(node, "value") as string | undefined)
    if (value !== undefined && value !== "") return normalize(value)
    return type === "submit" ? "Submit" : type === "reset" ? "Reset" : ""
  }
  if (tag === "input" && type === "image") {
    return normalize(reader.attr(node, "alt") ?? "")
  }
  const labels = index.labels.get(node)
  if (labels !== undefined) {
    const fromLabels = normalize(
      labels.map((l) => contentText(index, l, node, false)).join(" ")
    )
    if (fromLabels !== "") return fromLabels
  }
  if (tag === "img" || tag === "area") {
    const alt = reader.attr(node, "alt")
    if (alt !== undefined && alt.trim() !== "") return normalize(alt)
  }
  if (tag === "fieldset") {
    const legend = firstChildText(index, node, "legend")
    if (legend !== undefined && legend !== "") return legend
  }
  if (tag === "table") {
    const caption = firstChildText(index, node, "caption")
    if (caption !== undefined && caption !== "") return caption
  }
  if (tag === "figure") {
    const caption = firstChildText(index, node, "figcaption")
    if (caption !== undefined && caption !== "") return caption
  }
  if (entry.role !== undefined && nameFromContent.has(entry.role)) {
    const content = normalize(contentText(index, node, undefined, false))
    if (content !== "") return content
  }
  const title = reader.attr(node, "title")
  if (title !== undefined && title.trim() !== "") return normalize(title)
  if (tag === "input" || tag === "textarea") {
    const placeholder = reader.attr(node, "placeholder")
    if (placeholder !== undefined) return normalize(placeholder)
  }
  return ""
}

const isChecked = <N>(reader: Reader<N>, node: N): boolean | undefined => {
  const aria = reader.attr(node, "aria-checked")
  if (aria !== undefined) return aria === "true"
  if (reader.tag(node) !== "input") return undefined
  const prop = reader.prop(node, "checked")
  if (typeof prop === "boolean") return prop
  return reader.attr(node, "checked") !== undefined
}

const levelOf = <N>(reader: Reader<N>, node: N): number | undefined => {
  const aria = reader.attr(node, "aria-level")
  if (aria !== undefined) return Number(aria)
  const match = /^h([1-6])$/.exec(reader.tag(node))
  return match === null ? undefined : Number(match[1])
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

/**
 * What a role query matches besides the role.
 *
 * **Details**
 *
 * `name` matches the accessible name exactly (after collapsing whitespace),
 * or tests it with a RegExp. `checked` matches a checkbox or radio button's
 * live state, and `level` a heading's. `hidden: true` includes hidden and
 * inert elements for inspection; simulated user actions still refuse inert
 * targets.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface RoleOptions {
  readonly name?: string | RegExp | undefined
  readonly checked?: boolean | undefined
  readonly level?: number | undefined
  readonly hidden?: boolean | undefined
}

const describeOptions = (
  role: string,
  options: RoleOptions | undefined
): string => {
  const parts = [`role ${JSON.stringify(role)}`]
  if (options?.name !== undefined) {
    parts.push(
      `name ${
        typeof options.name === "string"
          ? JSON.stringify(options.name)
          : String(options.name)
      }`
    )
  }
  if (options?.checked !== undefined) parts.push(`checked ${options.checked}`)
  if (options?.level !== undefined) parts.push(`level ${options.level}`)
  return parts.join(", ")
}

const select = <N>(
  index: Index<N>,
  role: string,
  options: RoleOptions | undefined
): Array<N> => {
  const out: Array<N> = []
  for (const entry of index.entries) {
    if (entry.role !== role) continue
    if (entry.hidden && options?.hidden !== true) continue
    if (
      options?.checked !== undefined &&
      isChecked(index.reader, entry.node) !== options.checked
    ) continue
    if (
      options?.level !== undefined &&
      levelOf(index.reader, entry.node) !== options.level
    ) continue
    if (options?.name !== undefined) {
      const name = computeName(index, entry)
      if (
        typeof options.name === "string"
          ? name !== normalize(options.name)
          : !options.name.test(name)
      ) continue
    }
    out.push(entry.node)
  }
  return out
}

/**
 * Every element under `root`, `root` included, with role `role` and matching
 * `options`, in document order.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const queryAllByRole: {
  (
    root: globalThis.Node,
    role: string,
    options?: RoleOptions
  ): ReadonlyArray<HTMLElement>
  (
    root: Locator.Node,
    role: string,
    options?: RoleOptions
  ): ReadonlyArray<Locator.Node>
} = (root: any, role: string, options?: RoleOptions): ReadonlyArray<any> =>
  select(buildIndex(root), role, options)

/**
 * The one element under `root` with role `role` and matching `options`.
 * Throws when there's none or several, listing the roles and names there are.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const getByRole: {
  (root: globalThis.Node, role: string, options?: RoleOptions): HTMLElement
  (root: Locator.Node, role: string, options?: RoleOptions): Locator.Node
} = (root: any, role: string, options?: RoleOptions): any => {
  const index = buildIndex(root)
  const found = select(index, role, options)
  if (found.length === 1) return found[0]
  if (found.length > 1) {
    throw new Error(
      `HtmlLocator: ${found.length} elements have ${
        describeOptions(role, options)
      }`
    )
  }
  throw new Error(
    `HtmlLocator: nothing has ${describeOptions(role, options)}. Roles here:\n${
      describeIndex(index)
    }`
  )
}

const describeIndex = <N>(index: Index<N>): string => {
  const lines = index.entries
    .filter((entry) => entry.role !== undefined && !entry.hidden)
    .map((entry) =>
      `  ${entry.role} ${JSON.stringify(computeName(index, entry))}`
    )
  return lines.length === 0 ? "  (none)" : lines.join("\n")
}

/**
 * The role of `node`: its `role` attribute, else the implicit role of its tag
 * and attributes, else `undefined`. `root` is the tree it's in, which decides
 * the role of `header` and `footer`.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const roleOf: {
  (root: globalThis.Node, node: globalThis.Node): string | undefined
  (root: Locator.Node, node: Locator.Node): string | undefined
} = (root: any, node: any): string | undefined =>
  buildIndex(root).byNode.get(node)?.role

/**
 * The accessible name of `node`, computed within `root`: from
 * `aria-labelledby`, `aria-label`, its labels, `alt`, a `legend` or `caption`,
 * its content for roles named by their content, then `title` and
 * `placeholder`.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const nameOf: {
  (root: globalThis.Node, node: globalThis.Node): string
  (root: Locator.Node, node: Locator.Node): string
} = (root: any, node: any): string => {
  const index = buildIndex(root)
  const entry = index.byNode.get(node)
  return entry === undefined ? "" : computeName(index, entry)
}

/**
 * A `Locator` for elements with role `role` and matching `options`, to
 * combine with `Locator.inside` and the other locators.
 *
 * @stability experimental
 * @category locators
 * @since 0.1.0
 */
export const role = (role: string, options?: RoleOptions): Locator.Locator => ({
  description: describeOptions(role, options),
  all: (root) => select(buildIndex(root), role, options)
})

// ---------------------------------------------------------------------------
// acting on the DOM
// ---------------------------------------------------------------------------

/**
 * The form fields labelled `text`: by a `<label>` around them or naming
 * their `id` in `for`, by `aria-labelledby`, or by `aria-label`. The label's
 * text is trimmed and must equal `text`, or contain it with
 * `{ exact: false }`.
 *
 * **Example** (A field by its label)
 *
 * ```ts import.meta.vitest
 * import { HtmlLocator } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 *
 * const tree = {
 *   tag: "form",
 *   children: [
 *     { tag: "label", attrs: { for: "zip" }, children: [{ text: "Zip code" }] },
 *     { tag: "input", attrs: { id: "zip" } }
 *   ]
 * }
 *
 * console.log(Locator.get(tree, HtmlLocator.label("Zip code")) === tree.children[1]) // true
 * ```
 *
 * @stability experimental
 * @category locators
 * @since 0.1.0
 */
export const label = (
  text: string,
  options?: { readonly exact?: boolean | undefined }
): Locator.Locator => {
  const matches = (label: string) =>
    options?.exact === false ? label.includes(text) : label.trim() === text
  return {
    description: `label ${JSON.stringify(text)}`,
    all: <N extends Locator.Node>(root: N): ReadonlyArray<N> => {
      const all = Locator.elements(root)
      const byId = new Map(
        all.flatMap((node) =>
          node.attrs?.id === undefined ? [] : [[node.attrs.id, node] as const]
        )
      )
      const found = new Set<Locator.Node>()
      for (const node of all) {
        if (node.tag === "label" && matches(Locator.textOf(node))) {
          const target = node.attrs?.for
          if (target !== undefined) {
            const field = byId.get(target)
            if (field !== undefined) found.add(field)
          } else {
            const field = Locator.elements(node).find((inner) =>
              inner !== node && labelable.has(inner.tag!)
            )
            if (field !== undefined) found.add(field)
          }
        }
        const label = node.attrs?.["aria-label"]
        if (label !== undefined && matches(label)) found.add(node)
        const by = node.attrs?.["aria-labelledby"]
        if (by !== undefined) {
          const named = by.split(/\s+/).flatMap((id) => {
            const other = byId.get(id)
            return other === undefined ? [] : [Locator.textOf(other)]
          }).join(" ")
          if (matches(named)) found.add(node)
        }
      }
      return all.filter((node) => found.has(node))
    }
  }
}

const labelable: ReadonlySet<string> = new Set([
  "input",
  "select",
  "textarea",
  "button",
  "meter",
  "output",
  "progress"
])

const isLabelable = <N>(reader: Reader<N>, node: N): boolean => {
  const tag = reader.tag(node)
  return tag === "input"
    ? reader.attr(node, "type")?.toLowerCase() !== "hidden"
    : labelable.has(tag)
}

/**
 * The elements whose `placeholder` is `text`.
 *
 * @stability experimental
 * @category locators
 * @since 0.1.0
 */
export const placeholder = (text: string): Locator.Locator =>
  Locator.attr("placeholder", text)

/**
 * Whether a dialog is closed, open, or open as a modal. It reads a story's
 * view or a `TestHost` tree, where `.modal(true)` sets `open` to `"modal"`,
 * or a DOM dialog, which is a modal when it matches `:modal`. A DOM without
 * `:modal`, such as some test environments, reports a modal as `"open"`.
 *
 * **Example** (Checking a confirm dialog)
 *
 * ```ts
 * import { HtmlLocator } from "@effect/ui/html/testing"
 *
 * declare const story: { get: (locator: unknown) => unknown }
 * const dialog = story.get(HtmlLocator.role("dialog", { name: "Delete note?" }))
 * console.log(HtmlLocator.dialogState(dialog)) // "modal"
 * ```
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const dialogState = (node: unknown): "closed" | "open" | "modal" => {
  if (isDom(node)) {
    const dialog = node as HTMLDialogElement
    if (!dialog.open) return "closed"
    try {
      return dialog.matches(":modal") ? "modal" : "open"
    } catch {
      return "open"
    }
  }
  const reader = structuralReader
  const element = node as Locator.Node
  if (reader.prop(element, "open") === "modal") return "modal"
  return dialogOpen(reader, element) ? "open" : "closed"
}

/**
 * Reads a form field's current value: its `value` property, else its
 * `value` attribute. It reads a scene's view, a `TestHost` tree or a DOM
 * element, and returns `undefined` for an element with neither.
 *
 * **When to use**
 *
 * Use to check what a field shows. `.value(text)` sets a property, so the
 * attributes of a story's node don't hold it.
 *
 * **Example** (Checking a search field)
 *
 * ```ts
 * import { HtmlLocator } from "@effect/ui/html/testing"
 *
 * declare const story: { get: (locator: unknown) => unknown }
 * const field = story.get(HtmlLocator.role("searchbox", { name: "Search" }))
 * console.log(HtmlLocator.value(field)) // "effect"
 * ```
 *
 * @see {@link checked} for a checkbox or radio button
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const value = (node: unknown): string | undefined => {
  const reader = readerOf(node)
  const prop = reader.prop(node, "value")
  return typeof prop === "string" ? prop : reader.attr(node, "value")
}

/**
 * Reads whether a checkbox or radio button is checked: `aria-checked` when
 * the element sets it, else an input's `checked` property, else its
 * `checked` attribute. It reads a scene's view, a `TestHost` tree or a DOM
 * element, and returns `undefined` for an element that can't be checked.
 *
 * **When to use**
 *
 * Use to check a box's live state. `.checked(on)` sets a property, so the
 * attributes of a story's node don't hold it. It's the state the `checked`
 * option of `role` matches.
 *
 * **Example** (Checking a done box)
 *
 * ```ts
 * import { HtmlLocator } from "@effect/ui/html/testing"
 *
 * declare const story: { get: (locator: unknown) => unknown }
 * const done = story.get(HtmlLocator.role("checkbox", { name: "Done" }))
 * console.log(HtmlLocator.checked(done)) // true
 * ```
 *
 * @see {@link value} for a field's text
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const checked = (node: unknown): boolean | undefined =>
  isChecked(readerOf(node), node)

/**
 * Whether a popover is showing. It reads a scene's view or a `TestHost`
 * tree, where `.popover(mode, open)` sets `popoverOpen`, or a DOM element,
 * through `:popover-open`.
 *
 * **Example** (Checking a menu)
 *
 * ```ts
 * import { HtmlLocator } from "@effect/ui/html/testing"
 *
 * declare const story: { get: (locator: unknown) => unknown }
 * const menu = story.get(HtmlLocator.role("menu", { hidden: true }))
 * console.log(HtmlLocator.popoverState(menu)) // "closed"
 * ```
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const popoverState = (node: unknown): "closed" | "open" =>
  popoverOpen(readerOf(node), node) ? "open" : "closed"

/**
 * Whether the element is inert or outside the topmost modal under `root`.
 * `path` lists the element and its ancestors, innermost first. The modal
 * escapes ancestor inertness, but not its own.
 *
 * @internal
 */
export const isInert = <N>(
  path: ReadonlyArray<N>,
  root: N | undefined = path[path.length - 1]
): boolean => {
  if (root === undefined) return false
  const reader = readerOf(root) as Reader<N>
  const modal = topModal(reader, root)
  for (const at of path) {
    if (flag(reader, at, "inert")) return true
    if (at === modal) return false
  }
  return modal !== undefined
}

/** A node's parent in the flat tree: the slot it is assigned to, a shadow root's host, or its parent. */
const flatParent = (node: globalThis.Node): globalThis.Node | null => {
  const parent = node.parentNode
  const shadow = (parent as globalThis.Element | null)?.shadowRoot
  if (shadow != null) {
    for (const slot of shadow.querySelectorAll("slot")) {
      if (slot.assignedNodes().includes(node as ChildNode)) return slot
    }
  }
  return parent?.nodeType === 11
    ? (parent as ShadowRoot).host ?? parent
    : parent
}

/**
 * Inherits inertness through the child's slot up to `host`, falling back to
 * the host's inertness.
 */
const slottedInert = (
  host: globalThis.Node,
  child: globalThis.Node,
  hostInert: boolean,
  modal: globalThis.Node | undefined
): boolean => {
  for (
    let at = flatParent(child);
    at !== null && at !== host;
    at = flatParent(at)
  ) {
    if (flag(domReader, at, "inert")) return true
    if (at === modal) return false
  }
  return hostInert
}

const refuseInert = (step: string, element: globalThis.Element): void => {
  const path: Array<globalThis.Node> = []
  for (
    let at: globalThis.Node | null = element;
    at !== null;
    at = flatParent(at)
  ) path.push(at)
  if (isInert(path, element.ownerDocument)) {
    throw new Error(`HtmlLocator.${step}: the element is inert`)
  }
}

/**
 * Clicks `element` as the user would: a button submits its form, and a
 * checkbox or radio button changes and fires `input` and `change`.
 * Throws on an inert element.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const click = (element: globalThis.Element): void => {
  refuseInert("click", element)
  ;(element as HTMLElement).click()
}

/**
 * Types into a text field as the user would: replaces its value with `value`
 * and fires `input`, then `change`. Throws on an inert element.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const type = (element: globalThis.Element, value: string): void => {
  refuseInert("type", element)
  const field = element as HTMLInputElement
  const view = field.ownerDocument.defaultView
  field.value = value
  const make = (name: string) =>
    view !== null && typeof view.InputEvent === "function"
      ? new view.InputEvent(name, {
        bubbles: true,
        data: value,
        inputType: "insertText"
      })
      : new (view?.Event ?? Event)(name, { bubbles: true })
  field.dispatchEvent(make("input"))
  field.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }))
}

/**
 * Presses `key` on `element`: fires `keydown`, then `keyup`. Throws on an
 * inert element.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const keydown = (
  element: globalThis.Element,
  key: string,
  modifiers?: {
    readonly shift?: boolean | undefined
    readonly ctrl?: boolean | undefined
    readonly alt?: boolean | undefined
    readonly meta?: boolean | undefined
  }
): void => {
  refuseInert("keydown", element)
  const view = element.ownerDocument.defaultView
  const Keyboard = view?.KeyboardEvent ?? KeyboardEvent
  const init = {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: modifiers?.shift === true,
    ctrlKey: modifiers?.ctrl === true,
    altKey: modifiers?.alt === true,
    metaKey: modifiers?.meta === true
  }
  element.dispatchEvent(new Keyboard("keydown", init))
  element.dispatchEvent(new Keyboard("keyup", init))
}

/**
 * Submits `form`, or the form `element` belongs to, as pressing Enter in it
 * would. Throws on an inert element.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const submit = (element: globalThis.Element): void => {
  refuseInert("submit", element)
  const form = element.localName === "form"
    ? element as HTMLFormElement
    : (element as HTMLInputElement).form ?? element.closest("form")
  if (form === null) {
    throw new Error("HtmlLocator.submit: the element isn't in a form")
  }
  if (typeof form.requestSubmit === "function") form.requestSubmit()
  else {
    const view = form.ownerDocument.defaultView
    form.dispatchEvent(
      new (view?.Event ?? Event)("submit", { bubbles: true, cancelable: true })
    )
  }
}
