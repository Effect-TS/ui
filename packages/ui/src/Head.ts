/**
 * The host-neutral part of a component's head: the title, title templates,
 * and the fold that turns a tree of entries into one value.
 *
 * Any component can contribute head entries through a pure `head` option,
 * a function of its Model, props and queries. On every flush that changed a
 * view, the runtime folds the entries of the placed tree, fallback content
 * included, into one value with the root vocabulary's merge, and a mount that
 * owns the document hands it to its host. A component on a host-neutral
 * vocabulary may contribute only `title` and `titleTemplate`. The HTML
 * vocabulary adds `meta`, `link`, JSON-LD and the `<html>` and `<body>`
 * attributes in `HtmlHead`.
 *
 * **The fold**
 *
 * Each node's value is its own entries followed by its children's values, so
 * a descendant overrides its ancestors. Children are taken in the order of
 * their paths, never in document order, so moving a component in its
 * parent's view can't change the head. A component's `reduceHead` then maps
 * that value, and the root's result is final.
 *
 * - **Titles.** A `titleTemplate` applies to a title set by a descendant,
 *   never to its own instance's title, so the title passes through its
 *   ancestors' templates outward, nearest first.
 * - **Conflicts.** Siblings that set one single slot, such as the title, to
 *   the same value pass it up once. When they set different values, neither
 *   wins: the slot is left unset until an ancestor's `reduceHead` sets it. A
 *   conflict no ancestor settles is reported as a `Conflict` naming every
 *   path that set the slot. The runtime sends it to `Query.Problems`.
 *
 * **Example** (A layout template and a page title)
 *
 * ```ts import.meta.vitest
 * import { Head } from "@effect/ui"
 *
 * const head = Head.merge({
 *   entries: [Head.titleTemplate((title) => `${title} · App`)],
 *   children: [{
 *     entries: [Head.titleTemplate((title) => `${title} · People`), Head.title("People")],
 *     children: [{ entries: [Head.title("Ada")], children: [] }]
 *   }]
 * })
 *
 * head.title // => "Ada · People · App"
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Data from "effect/Data"
import * as headFold from "./internal/headFold.ts"

/**
 * A host-neutral head entry: a title or a title template.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Entry = Title | TitleTemplate

/**
 * The title: the document's, a window's or a screen's, as the host gives it
 * a meaning. The Router's navigation announcement reads it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Title {
  readonly _tag: "Title"
  readonly text: string
}

/**
 * Wraps the title set by a descendant.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TitleTemplate {
  readonly _tag: "TitleTemplate"
  readonly apply: (title: string) => string
}

/**
 * Sets the title.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const title = (text: string): Title => ({ _tag: "Title", text })

/**
 * Wraps the title a descendant sets, such as `(title) => \`\${title} · App\``.
 *
 * **Details**
 *
 * It never applies to a title set by its own instance. Templates chain
 * outward: the nearest ancestor's applies first. When an instance has
 * several, the last one counts.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const titleTemplate = (apply: (title: string) => string): TitleTemplate => ({ _tag: "TitleTemplate", apply })

/**
 * The folded head of a host-neutral tree.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Head {
  readonly title: string | undefined
}

/**
 * A tree of head entries: each node's own entries and its children, in
 * document order. The runtime builds one node per instance.
 *
 * **Details**
 *
 * `path` names the node in a `Conflict`, and orders it among its siblings.
 * Siblings with entries or a `reduce` in their subtree need distinct paths:
 * a merge throws when two have none or share one, whatever their order.
 * `reduce` maps the node's value, its own entries merged with its children's
 * values, as a component's `reduceHead` does. `onError` is called when one
 * of the node's own title templates or its `reduce` throws: the merge then
 * skips that template, or keeps the value the `reduce` was given. Without
 * `onError` the error is rethrown.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Tree<E = Entry, H = Head> {
  readonly path?: string | undefined
  readonly entries: ReadonlyArray<E>
  readonly children: ReadonlyArray<Tree<E, H>>
  readonly reduce?: ((below: H) => H) | undefined
  readonly onError?: ((error: unknown) => void) | undefined
}

/**
 * Siblings set the same single slot, such as the title, to different values,
 * and no ancestor's `reduceHead` set it. The slot is left unset. `paths`
 * holds every path that set it, sorted.
 *
 * @stability experimental
 * @category problems
 * @since 0.1.0
 */
export class Conflict extends Data.TaggedClass("HeadConflict")<{
  readonly message: string
  readonly slot: string
  readonly paths: ReadonlyArray<string>
}> {}

/**
 * Options of a merge: where it reports a `Conflict`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MergeOptions {
  readonly onConflict?: ((conflict: Conflict) => void) | undefined
}

/**
 * Makes the `Conflict` for a slot that the components at `paths` set to
 * different values.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const conflict = (slot: string, paths: ReadonlyArray<string>): Conflict =>
  new Conflict({
    message: `Head: ${listOf(paths)} set ${slot} to different values, so it's left unset`,
    slot,
    paths
  })

/**
 * The template rule: the title a node passes up. That's the title its
 * children passed up, through the node's own template, or else the node's own
 * title.
 *
 * **Details**
 *
 * `entries` may hold any vocabulary's entries: only `Title` and
 * `TitleTemplate` are read, and the last of each counts. A template that
 * throws is reported to `onError` and skipped, or rethrown without it.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const resolveTitle = (
  node: {
    readonly entries: ReadonlyArray<{ readonly _tag: string }>
    readonly onError?: ((error: unknown) => void) | undefined
  },
  below: string | undefined
): string | undefined => {
  let own: string | undefined
  let template: TitleTemplate | undefined
  for (const entry of node.entries) {
    if (entry._tag === "Title") own = (entry as Title).text
    else if (entry._tag === "TitleTemplate") template = entry as TitleTemplate
  }
  if (below === undefined) return own
  if (template === undefined) return below
  try {
    return template.apply(below)
  } catch (error) {
    if (node.onError === undefined) throw error
    node.onError(error)
    return below
  }
}

/**
 * Folds a host-neutral tree into its title, applying each node's `reduce`
 * bottom up.
 *
 * **Details**
 *
 * Entries of other vocabularies are ignored. Siblings that pass different
 * titles up leave the title unset, and are reported to `onConflict` unless
 * a `reduce` above them sets it.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const merge: <E extends { readonly _tag: string } = Entry>(
  tree: Tree<E, Head>,
  options?: MergeOptions
) => Head = /* @__PURE__ */ headFold.plain((tree, options) =>
  headFold.fold(tree, {
    combine: (node, children, conflicted) => {
      if (conflicted.has("title")) return { title: undefined }
      let below: string | undefined
      for (const child of children) if (child.title !== undefined) below = child.title
      return { title: resolveTitle(node, below) }
    },
    slots: (head) => new Map(head.title === undefined ? [] : [["title", head.title]])
  }, options?.onConflict === undefined ? undefined : reportTo(options.onConflict))
)

const listOf = (paths: ReadonlyArray<string>): string =>
  paths.length < 2 ? paths.join("") : `${paths.slice(0, -1).join(", ")} and ${paths[paths.length - 1]}`

const reportTo = (onConflict: (conflict: Conflict) => void) => (slot: string, paths: ReadonlyArray<string>) =>
  onConflict(conflict(slot, paths))
