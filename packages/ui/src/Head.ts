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
 * Each node's value is its own entries followed by its children's values, in
 * document order, so a descendant overrides its ancestors. A component's
 * `reduceHead` then maps that value, and the root's result is final.
 *
 * - **Titles.** A `titleTemplate` applies to a title set by a descendant,
 *   never to its own instance's title, so the title passes through its
 *   ancestors' templates outward, nearest first.
 * - **Conflicts.** When two siblings set one single slot, such as the title,
 *   the later one wins and the merge reports a `Conflict` naming both paths.
 *   The runtime sends it to `Query.Problems`.
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
 * `path` names the node in a `Conflict`. `reduce` maps the node's value,
 * its own entries merged with its children's values, as a component's
 * `reduceHead` does. `onError` is called when one of the node's own title
 * templates or its `reduce` throws: the merge then skips that template, or
 * keeps the value the `reduce` was given. Without `onError` the error is
 * rethrown.
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
 * Two siblings set the same single slot, such as the title. The later one
 * wins. `paths` holds the earlier sibling's path, then the later one's.
 *
 * @stability experimental
 * @category problems
 * @since 0.1.0
 */
export class Conflict extends Data.TaggedClass("HeadConflict")<{
  readonly message: string
  readonly slot: string
  readonly paths: readonly [string, string]
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
 * Makes the `Conflict` for a slot two siblings set.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const conflict = (slot: string, earlier: string, later: string): Conflict =>
  new Conflict({
    message: `Head: ${earlier} and ${later} both set ${slot}, and the later one, ${later}, wins`,
    slot,
    paths: [earlier, later]
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
 * Entries of other vocabularies are ignored. Two siblings that both pass a
 * title up are reported to `onConflict`, and the later one wins.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const merge = <E extends { readonly _tag: string } = Entry>(
  tree: Tree<E, Head>,
  options?: MergeOptions
): Head =>
  headFold.fold(tree, {
    combine: (node, children) => {
      let below: string | undefined
      for (const child of children) if (child.title !== undefined) below = child.title
      return { title: resolveTitle(node, below) }
    },
    slots: (head) => new Map(head.title === undefined ? [] : [["title", head.title]])
  }, options?.onConflict === undefined ? undefined : reportTo(options.onConflict))

const reportTo = (onConflict: (conflict: Conflict) => void) => (slot: string, earlier: string, later: string) =>
  onConflict(conflict(slot, earlier, later))
