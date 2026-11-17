/**
 * The engine behind `Story`: the record of one instance between steps, and
 * the pure dispatch, Command, loader and event logic the steps run on it.
 * Errors name the step they come from, as the calling module passes it, such
 * as `Story.resolve`.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Equal from "effect/Equal"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import * as Loader from "../Loader.ts"
import * as MessageLog from "../MessageLog.ts"
import * as Query from "../testing/Query.ts"
import type { AwaitedLoader, KeyedLoad, Pending, Story, StreamTarget, Target } from "../testing/Story.ts"
import * as View from "../View.ts"
import * as loaders from "./loaders.ts"
import { isNoop } from "./noop.ts"
import {
  checkAuthorPlacements,
  checkAuthorRefs,
  checkChildPaths,
  checkContentPaths,
  segment,
  slotSegment
} from "./paths.ts"
import * as schedule from "./schedule.ts"

/** @internal */
export type Fields<Props, Model, Msg, Events> =
  & Pick<
    Story<Props, Model, Msg, Events>,
    | "component"
    | "props"
    | "model"
    | "loaderState"
    | "pending"
    | "emitted"
    | "sent"
    | "interrupted"
    | "dropped"
    | "loadingMore"
    | "defaultPrevented"
  >
  & {
    readonly childModels?: ReadonlyMap<string, unknown> | undefined
    readonly shared?: ReadonlyMap<Component.Definition.Any, unknown> | undefined
  }

// -- headless children ------------------------------------------------------
// A story shows a headless child expanded: the closure it was declared with, run against the parts of the
// child's `init` Model or of the Model `givenChild` set. No runtime is involved.
/** @internal */
export const childModels = new WeakMap<object, ReadonlyMap<string, unknown>>()
// The children an expansion replaced, by the expanded root: `childEmit` and `childFailure` still find them.
const expandedChildren = new WeakMap<object, ReadonlyArray<View.Child<any, any>>>()

// What a story of a slotted component passed for its slots, by the component `withSlots` made.
const storySlots = new WeakMap<object, Readonly<Record<string, View.Input<never, any>>>>()

// The values `shared` gave, by owner definition: definitions, since `withView` copies components.
/** @internal */
export const sharedGiven = new WeakMap<object, ReadonlyMap<Component.Definition.Any, unknown>>()

// -- shared state -----------------------------------------------------------
// The owners above a point in the story's view, nearest last: their values as the readers there see them.
type Owners = ReadonlyMap<Component.Definition.Any, unknown>
const noOwners: Owners = new Map()

/** The owners the readers below `component` see: `owners`, and `component` nearest when it's an owner. */
const ownersBelow = (
  owners: Owners,
  component: { readonly definition: Component.Definition.Any },
  model: unknown,
  props: unknown
): Owners => {
  const shares = component.definition.shares
  return shares === undefined ? owners : new Map(owners).set(component.definition, shares(model, props))
}

/**
 * The owners above the story's view: the story's component, when it's an owner.
 *
 * @internal
 */
export const rootOwners = (
  component: { readonly definition: Component.Definition.Any },
  model: unknown,
  props: unknown
): Owners => ownersBelow(noOwners, component, model, props)

// A reader's owner has no value in the story: a render that a `shared` step could still fix may miss it.
class MissingShared extends Error {}

/**
 * Renders `story`, letting a missing shared value through: another `shared` step may give it.
 *
 * @internal
 */
export const renderSharing = (story: Story<any, any, any, any>) => {
  try {
    story.view()
  } catch (error) {
    if (!(error instanceof MissingShared)) throw error
  }
}

/**
 * The values `story` was given, with `entries` set over them.
 *
 * @internal
 */
export const withShared = (
  story: Story<any, any, any, any>,
  entries: ReadonlyArray<readonly [Component.Headless.Any, unknown]>,
  step: string
): Owners | undefined => {
  const before = sharedGiven.get(story)
  if (entries.length === 0) return before
  const given = new Map(before)
  for (const [owner, value] of entries) {
    if (owner.definition.shares === undefined) {
      throw new Error(`${step}: ${owner.definition.name} shares nothing: it has no shares`)
    }
    given.set(owner.definition, value)
  }
  return given
}

/** What `owner` shares with no instance of it in the story: from `init` with no props, if it takes none. */
const sharedDefault = (owner: Component.Headless.Any): unknown => {
  const name = owner.definition.name
  const props = {}
  if (!Schema.is(owner.props)(props)) {
    throw new MissingShared(
      `Story: the story reads the shared state of ${name}, whose props aren't all optional, so it has no default. Give it with .shared(${name}, value)`
    )
  }
  return owner.definition.shares!(owner.init(props).model, props)
}

/**
 * `h.shared` and `p.shared` in a story: a given value, else the nearest owner above, else the default.
 *
 * @internal
 */
export const sharedLookup = (given: Owners | undefined, owners: Owners): Component.SharedLookup => (owner) => {
  const definition = owner.definition
  if (given?.has(definition)) return given.get(definition)
  if (owners.has(definition)) return owners.get(definition)
  return sharedDefault(owner)
}

const expandRoot = <Msg>(
  view: View.Node<Msg, any>,
  name: string,
  given: ReadonlyMap<string, unknown> | undefined,
  filled: Readonly<Record<string, View.Input<never, any>>> | undefined,
  shared: Owners | undefined,
  root: Owners
): View.Node<Msg, any> => {
  const replaced: Array<View.Child<any, any>> = []
  // As the runtime does: two children at one path fail the view or the closure that holds them, and
  // so do two children with one ref key across the view and the closures it gives its headless children.
  // Nor can two of them place one slot.
  const written = [checkChildPaths("/" + name, view)]
  // Content is shown under `children`, where a query looks, at the path the runtime gives it.
  // `own`: the story's component wrote it, so its refs count with the component's. Content the story
  // passed for its slots was written by a parent, and so were the closures in it.
  const content = (input: View.Input<any, any>, path: string, depth: number, own: boolean, owners: Owners) => {
    const nodes = View.children([input])
    const paths = checkContentPaths(path, nodes)
    if (own) written.push(paths)
    return nodes.map((child) => expand(child, path, depth, own, owners))
  }
  const expand = (
    node: View.Node<any, any>,
    path: string,
    depth: number,
    own: boolean,
    owners: Owners
  ): View.Node<any, any> => {
    switch (node._tag) {
      case "Text":
        return node
      case "Outlet": {
        // The story's component placing a slot: it shows what the story passed.
        const input = filled?.[node.name]
        if (input === undefined) return node
        return {
          ...node,
          children: content(input, "/" + name + "/" + slotSegment(node.name), 1, false, owners)
        } as View.Node<
          any,
          any
        >
      }
      case "Element": {
        let changed = false
        const children = node.children.map((child) => {
          const next = expand(child, path, depth, own, owners)
          if (next !== child) changed = true
          return next
        })
        return changed ? { ...node, children } : node
      }
      case "Child": {
        const component = node.component as unknown as Component.Headless.Any
        if (node.slots !== undefined) {
          // A child's view isn't run, but what the parent passed for its slots is the parent's.
          const childPath = path + "/" + segment(node)
          const shown: Array<View.Node<any, any>> = []
          for (const slot in node.slots) {
            shown.push(...content(node.slots[slot], childPath + "/" + slotSegment(slot), depth + 1, own, owners))
          }
          return { ...node, children: shown } as View.Node<any, any>
        }
        if (node.view === undefined || component.parts === undefined) return node
        replaced.push(node)
        const childPath = path + "/" + segment(node)
        const model = given?.has(node.key) ? given.get(node.key) : component.init(node.props).model
        const parts = component.parts(model, node.props, {
          owner: { path: childPath, depth: depth + 1 },
          shared: sharedLookup(shared, owners)
        })
        const tree = View.toNode(node.view(parts))
        const paths = checkChildPaths(childPath, tree)
        if (own) written.push(paths)
        // An owner expanded here is the nearest one for the readers in its closure.
        return expand(tree, childPath, depth + 1, own, ownersBelow(owners, component, model, node.props))
      }
    }
  }
  const expanded = expand(view, "/" + name, 0, true, root)
  checkAuthorRefs("/" + name, written)
  checkAuthorPlacements("/" + name, written)
  if (replaced.length > 0) expandedChildren.set(expanded, replaced)
  return expanded
}

/**
 * Defers rendering until the view is first read, after the step's keyed
 * prunes settle. This skips intermediate records the runtime wouldn't render.
 * `render` gives the expanded view.
 *
 * @internal
 */
export const record = <Props, Model, Msg, Events>(
  fields: Fields<Props, Model, Msg, Events>,
  render: () => View.Node<Msg, any>
): Story<Props, Model, Msg, Events> => {
  let rendered: View.Node<Msg, any> | undefined
  const view = () => rendered ??= render()
  // A view value is a `Query` tree; a child is a node with no tag or text.
  const root = () => view() as Query.Node
  const context = () => boundOf(fields.component)?.context(fields.model, fields.props, fields.loaderState)
  const story: Story<Props, Model, Msg, Events> = {
    component: fields.component,
    props: fields.props,
    model: fields.model,
    loaderState: fields.loaderState,
    loaded: () => context()?.loaded ?? {},
    pending: fields.pending,
    emitted: fields.emitted,
    sent: fields.sent,
    interrupted: fields.interrupted,
    dropped: fields.dropped,
    loadingMore: fields.loadingMore,
    defaultPrevented: fields.defaultPrevented,
    view,
    subscriptions: () =>
      (fields.component.subscriptions?.(fields.model, fields.props, fields.loaderState) ?? []).map((sub) => sub.key),
    loaders: () => {
      const bound = boundOf(fields.component)
      if (bound === undefined) return []
      const current = context()!
      return bound.entries.map((entry) => ({
        name: entry.name,
        read: Loader.defOf(entry.read).name,
        args: current.argsOf(entry.name).args
      }))
    },
    get root() {
      return root()
    },
    get: (locator) => Query.get(root(), locator),
    query: (locator) => Query.query(root(), locator),
    all: (locator) => Query.all(root(), locator)
  }
  if (fields.childModels !== undefined) childModels.set(story, fields.childModels)
  if (fields.shared !== undefined) sharedGiven.set(story, fields.shared)
  return story
}

/** @internal */
export const update = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  patch: Partial<Fields<Props, Model, Msg, Events>>
): Story<Props, Model, Msg, Events> => {
  const fields: Fields<Props, Model, Msg, Events> = {
    component: story.component,
    props: story.props,
    model: story.model,
    loaderState: story.loaderState,
    pending: story.pending,
    emitted: story.emitted,
    sent: story.sent,
    interrupted: story.interrupted,
    dropped: story.dropped,
    loadingMore: story.loadingMore,
    // Only a `click` or `fire` step sets it, last, once the step has settled.
    defaultPrevented: false,
    childModels: childModels.get(story),
    shared: sharedGiven.get(story),
    ...patch
  }
  // A defect in `view` fails the step that changed the Model, the loader state, the props or what's pending.
  // An unchanged view is kept as expanded: expanding it again would rebuild slot content without the
  // owners whose nodes the first expansion replaced.
  const view =
    fields.model === story.model && fields.loaderState === story.loaderState && fields.props === story.props &&
      fields.pending === story.pending && fields.loadingMore === story.loadingMore &&
      fields.childModels === childModels.get(story) && fields.shared === sharedGiven.get(story)
      ? story.view
      : () => expandedView(fields)
  return record(fields, view)
}

/**
 * The story's view: the component's own, with its headless children and slot content expanded.
 *
 * @internal
 */
export const expandedView = (fields: Fields<any, any, any, any>): View.Node<any, any> =>
  expandRoot(
    viewOfFields(fields),
    fields.component.definition.name,
    fields.childModels,
    storySlots.get(fields.component),
    fields.shared,
    rootOwners(fields.component, fields.model, fields.props)
  )

/** The story's component's own view, before its headless children are expanded. */
const viewOfFields = (fields: Fields<any, any, any, any>): View.Node<any, any> =>
  fields.component.view(
    fields.model,
    fields.props,
    runningOf(fields.pending),
    fields.loaderState,
    undefined,
    sharedLookup(fields.shared, rootOwners(fields.component, fields.model, fields.props))
  )

const boundOf = loaders.boundOf

/** @internal */
export const isKeyed = (story: Story<any, any, any, any>, name: string): boolean =>
  boundOf(story.component)?.byName.get(name)?.keyed === true

/** The loader called `name`, or a throw naming the step. */
const loaderOf = (story: Story<any, any, any, any>, step: string, name: string): loaders.Entry => {
  const entry = boundOf(story.component)?.byName.get(name)
  if (entry === undefined) {
    throw new Error(`${step}: "${name}" is not a loader of ${story.component.definition.name}`)
  }
  return entry
}

/** A loader's args for the story's Model, props and loader state. */
const argsAt = (story: Story<any, any, any, any>, name: string) =>
  boundOf(story.component)!.context(story.model, story.props, story.loaderState).argsOf(name)

/**
 * Writes a loader's state, then sends the message of its `onChange`, if any, as the runtime does.
 * A keyed loader's `onChange` also gets `changes`.
 */
const writeLoaderState = (
  story: Story<any, any, any, any>,
  entry: loaders.Entry,
  state: unknown,
  changes: ReadonlyArray<loaders.KeyedChange>
): Story<any, any, any, any> => {
  const bound = boundOf(story.component)!
  // As in the runtime, the same snapshot writes nothing.
  if (Equal.equals((story.loaderState ?? bound.empty)[entry.name], state)) return story
  const out = update(story, { loaderState: { ...(story.loaderState ?? bound.empty), [entry.name]: state } })
  const message = bound.context(out.model, out.props, out.loaderState).changed(entry.name, changes)
  return message === undefined ? out : dispatch(out, message.value)
}

/** The result a load step writes, from the loader's last Success at its current args. */
type Build = (
  previous: Option.Option<AsyncResult.Success<any, any>>
) => AsyncResult.Success<any, any> | AsyncResult.Failure<any, any>

/** Writes `result` to a single or list loader's state at its current args. */
const loadStep = (
  story: Story<any, any, any, any>,
  step: string,
  name: string,
  build: Build,
  patched: boolean,
  more?: Loader.More<any>
): Story<any, any, any, any> => {
  const entry = loaderOf(story, step, name)
  const current = argsAt(story, name)
  if (current.argsKey === undefined) {
    throw new Error(`${step}: the loader "${name}" is disabled for the current Model and props`)
  }
  const result = build(storedAt(story, name, current.argsKey))
  const def = Loader.defOf(entry.read)
  const state = boundOf(story.component)!.state(
    entry,
    { args: current.args, argsKey: current.argsKey },
    result,
    patched,
    more ?? (def.list !== undefined && result._tag === "Success" ? moreOfPages(def, result.value) : undefined)
  )
  return writeLoaderState(story, entry, state, [])
}

/** The loader state's last Success at `argsKey`: its value, or a Failure's previous one. */
const storedAt = (
  story: Story<any, any, any, any>,
  name: string,
  argsKey: string
): Option.Option<AsyncResult.Success<any, any>> => {
  const data = Loader.snapshotData(story.loaderState?.[name])
  const stored = data?.argsKey === argsKey ? data.result : undefined
  return stored === undefined
    ? Option.none()
    : stored._tag === "Success"
    ? Option.some(stored)
    : stored.previousSuccess
}

/**
 * The loader state `given` starts from, written with no `onChange` message. Each
 * named loader holds its given results at the args it returns, and a keyed
 * loader that isn't named keeps the keys it held before that it still returns. Args can
 * read other loaders' results, so the writes repeat until none changes: the
 * result doesn't depend on the order of the names or on the loader state held before.
 *
 * @internal
 */
export const givenLoaderState = (
  story: Story<any, any, any, any>,
  loaded: { readonly [name: string]: unknown },
  step: string
): Component.LoaderState | undefined => {
  for (const name of Object.keys(loaded)) loaderOf(story, step, name)
  const bound = boundOf(story.component)
  if (bound === undefined) return story.loaderState
  const before = story.loaderState ?? bound.empty
  const loaderState: { [name: string]: unknown } = { ...before }
  // The state a loader should hold for the current loader state, or undefined while a named loader is
  // disabled or doesn't return the given args.
  const target = (entry: loaders.Entry): unknown => {
    const current = bound.context(story.model, story.props, { ...loaderState }).argsOf(entry.name)
    if (!Object.hasOwn(loaded, entry.name)) {
      // From the loader state held before: a key an earlier round dropped can come back once the args settle.
      const held = Loader.snapshotMapData(before[entry.name])?.entries
      return bound.stateMany(
        entry,
        current.entries!.flatMap((key) => {
          const stored = held?.get(key.argsKey)
          return stored === undefined ? [] : [stored]
        })
      )
    }
    const def = Loader.defOf(entry.read)
    if (entry.keyed) {
      const keys = current.entries!
      const snapshots: Array<unknown> = []
      for (const load of loaded[entry.name] as ReadonlyArray<KeyedLoad<any>>) {
        const key = keys.find((key) => key.argsKey === def.argsKey(load.args))
        if (key === undefined) return undefined
        const result = "value" in load
          ? AsyncResult.success(load.value, { waiting: load.waiting, timestamp: 0 })
          : AsyncResult.failure(Cause.fail(load.error), { waiting: load.waiting })
        snapshots.push(bound.state(entry, key, result as any, false, undefined))
      }
      return bound.stateMany(entry, snapshots)
    }
    if (current.argsKey === undefined) return undefined
    const value = loaded[entry.name]
    return bound.state(
      entry,
      { args: current.args, argsKey: current.argsKey },
      AsyncResult.success(value, { timestamp: 0 }),
      false,
      def.list !== undefined ? moreOfPages(def, value as ReadonlyArray<unknown>) : undefined
    )
  }
  const written = bound.entries.filter((entry) => entry.keyed || Object.hasOwn(loaded, entry.name))
  // Each round settles at least one more level of loaders whose args read another's result, so a
  // write still due after a round per loader never settles.
  for (let round = 0, changed = true; changed; round++) {
    changed = false
    for (const entry of written) {
      const next = target(entry)
      if (next === undefined || Equal.equals(loaderState[entry.name], next)) continue
      if (round > written.length) {
        throw new Error(
          `${step}: the loader "${entry.name}" doesn't settle: its args keep changing with the given results`
        )
      }
      loaderState[entry.name] = next
      changed = true
    }
  }
  const unmet = written.find((entry) => target(entry) === undefined)
  if (unmet !== undefined) {
    throw new Error(
      `${step}: the loader "${unmet.name}" is disabled, or doesn't return the given args, for the Model and props`
    )
  }
  return loaderState
}

/** Whether a page array has a next page, by the definition's `next`. */
const moreOfPages = (def: ReturnType<typeof Loader.defOf>, pages: ReadonlyArray<unknown>): Loader.More<never> =>
  pages.length > 0 && Option.isSome(def.list!.next(pages[pages.length - 1], pages))
    ? { _tag: "Available" }
    : { _tag: "End" }

const listLoader = (story: Story<any, any, any, any>, step: string, name: string): void => {
  if (boundOf(story.component)?.byName.get(name)?.list !== true) {
    throw new Error(`${step}: "${name}" is not a list loader of ${story.component.definition.name}`)
  }
}

/**
 * Settles a loader's pending load more with `result`, written at its pages. A live patch makes it throw.
 *
 * @internal
 */
export const settleMore = (
  story: Story<any, any, any, any>,
  step: string,
  name: string,
  pagesOf: (pages: ReadonlyArray<unknown>) => ReadonlyArray<unknown>,
  more?: Loader.More<any>
): Story<any, any, any, any> => {
  listLoader(story, step, name)
  const argsKey = argsAt(story, name).argsKey
  if (argsKey !== undefined) checkUnpatched(story, step, name, argsKey)
  if (!story.loadingMore.includes(name)) {
    throw new Error(`${step}: no load more of "${name}" is pending`)
  }
  return loadStep(
    settlePending(story, name),
    step,
    name,
    (previous) => {
      if (Option.isNone(previous)) throw new Error(`${step}: "${name}" holds no pages at its args`)
      return AsyncResult.success(pagesOf(previous.value.value), { timestamp: previous.value.timestamp })
    },
    false,
    more
  )
}

/**
 * A `$.loadMore` or `$.reset` from `update`, as the runtime runs it at the loader's
 * current args: a load more is pending, and writes `Loading`; a reset writes the
 * first page, waiting, and ends a pending load more.
 */
const applyList = (story: Story<any, any, any, any>, list: Component.ListIssue): Story<any, any, any, any> => {
  const entry = boundOf(story.component)?.byName.get(list.name)
  if (entry === undefined || !entry.list) return story
  const argsKey = argsAt(story, list.name).argsKey
  if (argsKey === undefined) return story
  const previous = storedAt(story, list.name, argsKey)
  const def = Loader.defOf(entry.read)
  const data = Loader.snapshotData(story.loaderState?.[list.name])
  if (list.op === "loadMore") {
    if (story.loadingMore.includes(list.name)) return story
    // At the end, or with nothing held at these args, nothing is written and nothing waits.
    if (Option.isNone(previous) || moreOfPages(def, previous.value.value)._tag === "End") return story
    const loading = update(story, { loadingMore: [...story.loadingMore, list.name] })
    if (data?.result?._tag !== "Success") return loading
    return loadStep(
      loading,
      "$.loadMore",
      list.name,
      () => data.result as AsyncResult.Success<any, any>,
      data.patched,
      { _tag: "Loading" }
    )
  }
  const reset = settlePending(story, list.name)
  if (Option.isNone(previous)) return reset
  const first = AsyncResult.success(previous.value.value.slice(0, 1), { timestamp: previous.value.timestamp })
  return loadStep(
    reset,
    "$.reset",
    list.name,
    // A Failure stays one, over the first page only, while the walk runs.
    () =>
      data?.result?._tag === "Failure"
        ? AsyncResult.failure(data.result.cause, { previousSuccess: Option.some(first), waiting: true })
        : AsyncResult.success(first.value, { timestamp: first.timestamp, waiting: true }),
    false
  )
}

/** Ends a list loader's pending load more: a settle, Success or Failure, ends the walk it waits on. */
const settlePending = (story: Story<any, any, any, any>, name: string): Story<any, any, any, any> =>
  story.loadingMore.includes(name)
    ? update(story, { loadingMore: story.loadingMore.filter((other) => other !== name) })
    : story

/** A `loadMany` loader and its unique args, or a throw naming the step. */
const keyedLoader = (
  story: Story<any, any, any, any>,
  step: string,
  name: string
): { readonly entry: loaders.Entry; readonly keys: ReadonlyArray<loaders.Keyed> } => {
  const entry = boundOf(story.component)?.byName.get(name)
  if (entry === undefined || !entry.keyed) {
    throw new Error(`${step}: "${name}" is not a loadMany loader of ${story.component.definition.name}`)
  }
  return { entry, keys: argsAt(story, name).entries! }
}

/**
 * Writes a keyed loader's state as the runtime does: the stored keys the
 * loader still returns, with `loads` over them, and `changes` holds
 * `loads`.
 */
const writeKeyed = (
  story: Story<any, any, any, any>,
  entry: loaders.Entry,
  keys: ReadonlyArray<loaders.Keyed>,
  loads: ReadonlyArray<
    { readonly argsKey: string; readonly result: AsyncResult.AsyncResult<any, any>; readonly patched: boolean }
  >
): Story<any, any, any, any> => {
  const bound = boundOf(story.component)!
  const held = Loader.snapshotMapData(story.loaderState?.[entry.name])?.entries
  const byKey = new Map(loads.map((load) => [load.argsKey, load]))
  const state = bound.stateMany(
    entry,
    keys.flatMap((key) => {
      const load = byKey.get(key.argsKey)
      if (load !== undefined) return [bound.state(entry, key, load.result as any, load.patched, undefined)]
      const stored = held?.get(key.argsKey)
      return stored === undefined ? [] : [stored]
    })
  )
  const changes = keys.flatMap((key) => {
    const load = byKey.get(key.argsKey)
    return load === undefined ? [] : [{ args: key.args, result: load.result }]
  })
  return writeLoaderState(story, entry, state, changes)
}

/**
 * Loads keys of a keyed loader: each args must be one the loader currently returns.
 *
 * @internal
 */
export const loadKeyedStep = (
  story: Story<any, any, any, any>,
  step: string,
  name: string,
  loads: ReadonlyArray<KeyedLoad<any>>
): Story<any, any, any, any> => {
  const { entry, keys } = keyedLoader(story, step, name)
  const def = Loader.defOf(entry.read)
  const held = Loader.snapshotMapData(story.loaderState?.[name])?.entries
  const settled = new Set<string>()
  const written = writeKeyed(
    story,
    entry,
    keys,
    loads.map((load) => {
      const argsKey = def.argsKey(load.args)
      if (!keys.some((key) => key.argsKey === argsKey)) {
        throw new Error(
          `${step}: the loader "${name}" doesn't return the args ${def.logKey(load.args, argsKey)}`
        )
      }
      const patched = "value" in load && load.patched === true
      if (!patched) checkUnpatched(story, step, name, argsKey)
      if (!patched && load.waiting !== true) settled.add(argsKey)
      return {
        argsKey,
        result: "value" in load
          ? AsyncResult.success(load.value, { waiting: load.waiting, timestamp: 0 })
          : AsyncResult.failWithPrevious(load.error, {
            previous: Option.fromUndefinedOr(Loader.snapshotData(held?.get(argsKey))?.result),
            waiting: load.waiting
          }),
        patched
      }
    })
  )
  // After the loader state's write: the wait's own message comes second.
  return settleWaits(written, (awaited) => awaited.name === name && settled.has(def.argsKey(awaited.args)))
}

/** How many rounds of prunes one step may write before it throws. */
const pruneRounds = 100

/**
 * After a step: a keyed loader whose state holds a key it no longer returns
 * gets its state pruned, with no changes, as the runtime's drain writes it. A
 * prune's `onChange` can change the key set again, so rounds run until none
 * is due, at most one write per loader per round. The runtime doesn't bound
 * them; a step throws after `pruneRounds`.
 *
 * @internal
 */
export const pruneKeyed = (story: Story<any, any, any, any>, module: string): Story<any, any, any, any> => {
  const bound = boundOf(story.component)
  if (bound === undefined) return story
  let out = story
  for (let round = 0;; round++) {
    let pruned = false
    for (const entry of bound.entries) {
      if (!entry.keyed) continue
      const held = Loader.snapshotMapData(out.loaderState?.[entry.name])
      if (held === undefined || held.entries.size === 0) continue
      const keys = argsAt(out, entry.name).entries!
      const declared = new Set(keys.map((key) => key.argsKey))
      if (Array.from(held.entries.keys()).every((key) => declared.has(key))) continue
      if (round === pruneRounds) {
        throw new Error(
          `${module}: ${story.component.definition.name}'s loader "${entry.name}" was still pruned after ${pruneRounds} rounds in one step. Each prune's onChange changes its key set again, and the runtime would prune without limit.`
        )
      }
      out = writeKeyed(out, entry, keys, [])
      pruned = true
    }
    if (!pruned) return out
  }
}

/**
 * `h.isRunning` in a story: derived from what's pending.
 *
 * @internal
 */
export const runningOf =
  (pending: ReadonlyArray<Pending<any>>) => (name: string, groupKey: string | undefined): boolean =>
    pending.some((entry) =>
      entry.command.name === name && (groupKey === undefined || entry.command.groupKey === groupKey)
    )

const toEntries = <Msg>(pending: ReadonlyArray<Pending<Msg>>): Array<schedule.Entry<Pending<Msg>>> =>
  pending.map((entry) => ({
    name: entry.command.name,
    key: entry.command.groupKey,
    mode: entry.command.mode,
    status: entry.status,
    value: entry
  }))

/**
 * Applies what `init` or `update` returned: the Model, the Commands through `schedule`, and the events.
 * As in the runtime, a cut run that awaits delivers its message inside this `update`, before the
 * Command that cut it is added.
 *
 * @internal
 */
export const apply = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  next: Component.Next<Model, Msg, Events, any>
): Story<Props, Model, Msg, Events> => {
  let out = update(story, { model: next.model })
  for (const command of next.commands) {
    const decision = schedule.schedule(toEntries(out.pending), command)
    if (decision.interrupt.length > 0) {
      const gone = new Set(decision.interrupt.map((entry) => entry.value))
      out = update(out, {
        pending: out.pending.filter((entry) => !gone.has(entry)),
        interrupted: [
          ...out.interrupted,
          ...decision.interrupt.flatMap((entry) => entry.value.status === "awaiting" ? [] : [entry.value.command])
        ]
      })
      for (const entry of decision.interrupt) {
        if (entry.value.status === "awaiting") out = dispatch(out, entry.value.message)
      }
    }
    if (command._tag === "Interrupt") continue
    switch (decision.action) {
      case "start":
      case "queue": {
        const entry: Pending<Msg> = { command, status: decision.action === "start" ? "running" : "queued" }
        livePatches.set(entry, registeredPatches(out, command))
        out = update(out, { pending: [...out.pending, entry] })
        break
      }
      case "drop":
        out = update(out, { dropped: [...out.dropped, command] })
        break
      case "none":
        break
    }
  }
  out = update(out, { emitted: [...out.emitted, ...next.events] })
  if (next.sends !== undefined && next.sends.length > 0) out = update(out, { sent: [...out.sent, ...next.sends] })
  for (const list of next.lists ?? []) out = applyList(out, list)
  return out
}

/**
 * A run's fiber exited: with a message it is awaiting, on `awaiting` or behind an earlier message of
 * its queue, and without one it leaves. The next queued run of its group starts either way.
 *
 * @internal
 */
export const exited = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  entry: Pending<Msg>,
  held: { readonly message: Msg; readonly awaiting: ReadonlyArray<AwaitedLoader> } | undefined
): Story<Props, Model, Msg, Events> => {
  const awaiting: Pending<Msg> | undefined = held === undefined
    ? undefined
    : { command: entry.command, status: "awaiting", message: held.message, awaiting: held.awaiting }
  const next = schedule.next(toEntries(story.pending.filter((other) => other !== entry)), toEntries([entry])[0])
  const pending = story.pending.flatMap((other): Array<Pending<Msg>> => {
    if (other === entry) return awaiting === undefined ? [] : [awaiting]
    if (other !== next?.value) return [other]
    const running: Pending<Msg> = { command: other.command, status: "running" }
    livePatches.set(running, livePatches.get(other) ?? [])
    return [running]
  })
  const out = update(story, { pending })
  return awaiting === undefined ? out : release(out, awaiting)
}

/** Delivers the messages of `entry`'s group that can go now, in the order `schedule.deliverable` gives. */
const release = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  entry: Pending<Msg>
): Story<Props, Model, Msg, Events> => {
  let out = story
  for (;;) {
    const next = schedule.deliverable(
      toEntries(out.pending),
      toEntries([entry])[0],
      (other) => other.awaiting === undefined || other.awaiting.length === 0
    )
    if (next === undefined) return out
    out = dispatch(update(out, { pending: out.pending.filter((other) => other !== next.value) }), next.value.message)
  }
}

/**
 * Takes awaited loaders off the awaiting runs, delivering what a wait that ends lets go.
 *
 * @internal
 */
export const settleWaits = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  settled: (awaited: AwaitedLoader) => boolean
): Story<Props, Model, Msg, Events> => {
  let out = story
  for (const entry of story.pending) {
    if (entry.awaiting === undefined || !entry.awaiting.some(settled) || !out.pending.includes(entry)) continue
    const rest: Pending<Msg> = { ...entry, awaiting: entry.awaiting.filter((awaited) => !settled(awaited)) }
    out = update(out, { pending: out.pending.map((other) => other === entry ? rest : other) })
    if (rest.awaiting!.length === 0) out = release(out, rest)
  }
  return out
}

/**
 * A single or list loader's `loaded` or `loadFailed`: unless `patched`, a live patch makes it throw,
 * and unless `waiting` too, it settles the loader's entry for the waits on it, after its write.
 *
 * @internal
 */
export const settleStep = (
  story: Story<any, any, any, any>,
  step: string,
  name: string,
  patched: boolean,
  waiting: boolean,
  build: Build
): Story<any, any, any, any> => {
  const entry = loaderOf(story, step, name)
  const argsKey = argsAt(story, name).argsKey
  if (!patched && argsKey !== undefined) checkUnpatched(story, step, name, argsKey)
  // A settle ends the walk a list's pending load more waits on, unless a walk is still running.
  const loaded = loadStep(waiting ? story : settlePending(story, name), step, name, build, patched)
  return patched || waiting ? loaded : settleWaits(
    loaded,
    (awaited) => awaited.name === name && Loader.defOf(entry.read).argsKey(awaited.args) === argsKey
  )
}

/** The component's own loaders, each with the entries it is at: one per args it returns now. */
function* currentEntries(
  story: Story<any, any, any, any>
): Generator<{ readonly loader: loaders.Entry; readonly entries: ReadonlyArray<loaders.Keyed> }> {
  const bound = boundOf(story.component)
  if (bound === undefined) return
  const context = bound.context(story.model, story.props, story.loaderState)
  for (const loader of bound.entries) {
    const current = context.argsOf(loader.name)
    yield {
      loader,
      entries: current.entries ??
        (current.argsKey === undefined ? [] : [{ args: current.args, argsKey: current.argsKey }])
    }
  }
}

/**
 * What a `Command.afterRefetch` run resolved with `result` waits for: the component's own loaders,
 * at their current args, that its declared targets match, less the entries its `writes` store.
 *
 * @internal
 */
export const awaitedLoaders = (
  story: Story<any, any, any, any>,
  command: Command.Issued<any, any, never, "Effect"> | Command.Issued<any, any, never, "Stream">,
  result: unknown
): ReadonlyArray<AwaitedLoader> => {
  const budget = command.afterRefetch
  if (command._tag !== "Effect" || budget === undefined || Duration.isZero(budget)) return []
  if (boundOf(story.component) === undefined) return []
  const written = (command.writes?.(result) ?? []).map((write) => ({
    name: Loader.defOf(write.read).name,
    argsKey: Loader.defOf(write.read).argsKey(write.args)
  }))
  const out: Array<AwaitedLoader> = []
  for (const { entries, loader } of currentEntries(story)) {
    const read = Loader.defOf(loader.read).name
    for (const { args, argsKey } of entries) {
      if (!Loader.invalidatesEntry(command, loader.read, args)) continue
      if (written.some((write) => write.name === read && write.argsKey === argsKey)) continue
      out.push({ name: loader.name, args })
    }
  }
  return out
}

/**
 * Patches registered at issue, by loader name and args key. As in the cache, only entries that
 * held a Success then register a patch; cold or failed entries don't delay settling.
 */
const livePatches = new WeakMap<Pending<any>, ReadonlyArray<{ readonly name: string; readonly argsKey: string }>>()

/** The component's own loaders, at their current args, that `command`'s patches register on. */
const registeredPatches = (
  story: Story<any, any, any, any>,
  command: Command.Issued<any, any, never, "Effect"> | Command.Issued<any, any, never, "Stream">
): ReadonlyArray<{ readonly name: string; readonly argsKey: string }> => {
  if (command.optimistic.length === 0) return []
  const out: Array<{ readonly name: string; readonly argsKey: string }> = []
  for (const { entries, loader } of currentEntries(story)) {
    const state = story.loaderState?.[loader.name]
    const held = loader.keyed ? Loader.snapshotMapData(state)?.entries : undefined
    for (const { args, argsKey } of entries) {
      const data = Loader.snapshotData(held !== undefined ? held.get(argsKey) : state)
      if (data?.argsKey !== argsKey || data.result?._tag !== "Success") continue
      if (!Loader.invalidatesEntry({ invalidates: [], optimistic: command.optimistic }, loader.read, args)) continue
      out.push({ name: loader.name, argsKey })
    }
  }
  return out
}

/**
 * Throws when a running or queued Command's optimistic patch is live on the entry of loader `name`
 * at `argsKey`: the runtime settles no fetch there, so only a patched value can be written.
 */
const checkUnpatched = (story: Story<any, any, any, any>, step: string, name: string, argsKey: string): void => {
  const patcher = story.pending.find((entry) =>
    entry.status !== "awaiting" &&
    livePatches.get(entry)?.some((patch) => patch.name === name && patch.argsKey === argsKey) === true
  )
  if (patcher !== undefined) {
    throw new Error(
      `${step}: "${name}" is under the optimistic patch of ${
        describe(patcher.command)
      } [${patcher.status}], and no fetch settles under a live patch. Resolve or fail it first, or write the patched value with \`{ patched: true }\`.`
    )
  }
}

/** @internal */
export const describe = (
  command: Command.Issued<any, any, never, "Effect"> | Command.Issued<any, any, never, "Stream">
): string => `${command.name}(${JSON.stringify(MessageLog.encodeArgs(command.argsSchema, command.args))})`

/** @internal */
export const describePending = (pending: ReadonlyArray<Pending<any>>): string =>
  pending.length === 0 ?
    "nothing" :
    pending.map((entry) =>
      `${describe(entry.command)} [${entry.status}${
        entry.awaiting === undefined || entry.awaiting.length === 0
          ? ""
          : ` on ${entry.awaiting.map((awaited) => awaited.name).join(", ")}`
      }]`
    ).join(", ")

/** @internal */
export const matches = (target: Target, entry: Pending<any>): boolean => {
  if (Command.isDefinition(target)) return entry.command.name === Command.nameOf(target)
  return entry.command.name === target.name && Equal.equals(entry.command.args, target.args)
}

/** @internal */
export const describeTarget = (target: Target): string =>
  Command.isDefinition(target) ? Command.nameOf(target) : describe(target)

/** @internal */
export const findRunning = (story: Story<any, any, any, any>, target: Target, step: string): Pending<any> => {
  const entry = story.pending.find((entry) => entry.status === "running" && matches(target, entry))
  if (entry === undefined) {
    throw new Error(`${step}: no running ${describeTarget(target)}; pending: ${describePending(story.pending)}`)
  }
  return entry
}

const handle = <Msg, Payload>(handler: View.Handler<Msg, Payload>, payload: Payload): Msg | undefined =>
  typeof handler === "function" ? (handler as (payload: Payload) => Msg | undefined)(payload) : handler

/** @internal */
export const dispatch = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  message: Msg | Component.Noop | undefined
): Story<Props, Model, Msg, Events> =>
  // `undefined` is a handler's "no message", and `Component.noop` a Command's or a mount's.
  message === undefined || isNoop(message)
    ? story
    : apply(story, story.component.update(story.model, message, story.props, story.loaderState))

/** `node` and its ancestors in `root`, innermost first, or `undefined` when `node` isn't in `root`. */
const pathTo = (root: View.Node<any, any>, node: Query.Node): Array<View.Node<any, any>> | undefined => {
  if (root === node) return [root]
  // An element's children, or the content a story shows under a child or an outlet.
  const children = (root as { readonly children?: ReadonlyArray<View.Node<any, any>> }).children
  if (children === undefined) return undefined
  for (const child of children) {
    const path = pathTo(child, node)
    if (path !== undefined) {
      path.push(root)
      return path
    }
  }
  return undefined
}

/**
 * Sends `event` to the one element `locator` matches, bubbling to the
 * innermost element that handles it, and tells whether its default was
 * cancelled. Every element in a story is the app's, so a `submit` is always
 * cancelled, and needs no handler.
 *
 * @internal
 */
export const fireAt = <Props, Model, Msg, Events>(
  story: Story<Props, Model, Msg, Events>,
  locator: Query.Locator,
  event: string,
  payload: unknown,
  step: string
): { readonly story: Story<Props, Model, Msg, Events>; readonly prevented: boolean } => {
  const found = story.all(locator)
  if (found.length !== 1) {
    throw new Error(
      `${step}: ${found.length === 0 ? "nothing matches" : `${found.length} elements match`} ${locator.description}`
    )
  }
  const view = story.view()
  // The innermost element with any layer for the event, as on a host.
  const handler = pathTo(view, found[0])?.find((node): node is View.Element<Msg, any> =>
    node._tag === "Element" &&
    (Object.hasOwn(node.handlers, event) || (node.owned ?? []).some((layer) => Object.hasOwn(layer.handlers, event)))
  )
  const submit = event === "submit"
  if (handler === undefined) {
    if (submit) return { story, prevented: true }
    throw new Error(`${step}: nothing handles "${event}" at ${locator.description}`)
  }
  // A story runs its own component's layers: the element's handlers, and in an author's story the
  // parts' layers it owns, wherever its view applied them. A headless child's layer needs the child's `update`.
  const own = "/" + story.component.definition.name
  const owned = handler.owned ?? []
  const layers = [...owned.filter((layer) => layer.owner.path === own), handler].filter((layer) =>
    Object.hasOwn(layer.handlers, event)
  )
  if (layers.length === 0) {
    const owners = owned.filter((layer) => Object.hasOwn(layer.handlers, event)).map((layer) => layer.owner.path)
    throw new Error(
      `${step}: only ${owners.join(" and ")} handles "${event}" at ${locator.description}. ` +
        "A story doesn't run a child's update: use givenChild for its Model, or a TestHost test."
    )
  }
  // `"always"` from any layer cancels, a child's included. Then each layer runs once, in the runtime's
  // order: its message decides whether its own `preventDefault: true` cancels, then it's sent.
  let prevented = submit || [...owned, handler].some((layer) => layer.eventOptions[event]?.preventDefault === "always")
  let out = story
  for (const layer of layers) {
    const message = handle(layer.handlers[event]!, payload)
    if (message === undefined) continue
    if (layer.eventOptions[event]?.preventDefault === true) prevented = true
    // Every layer here is the story's own component's, so each message is the story's.
    out = dispatch(out, message as Msg)
  }
  return { story: out, prevented }
}

// Pending Commands are stored with their Source erased; `findRunning` matched `target`, so
// `result` is the Source of this entry's Command.
/** @internal */
export const resolveWith = (entry: Pending<any>, result: unknown): any =>
  (entry.command.resolve as (result: unknown) => unknown)(result)

/** @internal */
export const findStream = (story: Story<any, any, any, any>, target: StreamTarget, step: string): Pending<any> => {
  const entry = findRunning(story, target, step)
  if (entry.command._tag !== "Stream") {
    throw new Error(`${step}: ${describe(entry.command)} is not a stream Command`)
  }
  return entry
}

/**
 * A headless component with `view` as its consumer, as a component a story
 * can run. `view` has no messages of its own, so every handler that runs is
 * a layer of the component's parts: `fireAt` runs the layers whose owner is
 * the story's component, wherever the view applied them.
 *
 * @internal
 */
export const withView = (
  component: Component.Headless.Any,
  view: (parts: any, h: any) => View.Content<any, any>,
  elements: View.Vocabulary<any> | undefined
): Component.Component<any, any, any, any, any, any, any, any, any> => {
  const owner: View.Owner = { path: "/" + component.definition.name, depth: 0 }
  return Object.assign(Object.create(component), {
    view: (
      model: unknown,
      props: unknown,
      running?: View.Running,
      loaderState?: Component.LoaderState,
      _path?: string,
      shared?: Component.SharedLookup
    ) => {
      const h = View.makeHelper(props, elements ?? component.elements(), running, owner.path)
      return View.toNode(view(component.parts(model, props, { owner, running, loaderState, shared }), h))
    }
  })
}

/**
 * A component whose story passed `slots`: the content shows where its view places each slot.
 *
 * @internal
 */
export const withSlots = (
  component: Component.Any,
  slots: (h: any) => Readonly<Record<string, View.Input<never, any>>>,
  elements: View.Vocabulary<any> | undefined
): Component.Any => {
  const made = Object.create(component)
  storySlots.set(
    made,
    slots(View.makeHelper({}, elements ?? component.elements(), undefined, "/" + component.definition.name))
  )
  return made
}

/**
 * The children declared in a view, with the ones an expansion replaced.
 *
 * @internal
 */
export const children = <Msg>(
  view: View.Node<Msg, any>,
  component?: Component.Any | { readonly key: string }
): ReadonlyArray<View.Child<Msg, any>> =>
  [...(expandedChildren.get(view) ?? []), ...shownNodes(view)].filter((node): node is View.Child<Msg, any> =>
    node._tag === "Child" && (component === undefined || node.component === component)
  )

/**
 * `node` and the nodes below it, as a story shows them: the content it expanded under a child or an
 * outlet, or, in a view it didn't expand, what a child's slots were passed.
 */
const shownNodes = function*(node: View.Node<any, any>): Generator<View.Node<any, any>> {
  yield node
  const shown = (node as { readonly children?: ReadonlyArray<View.Node<any, any>> }).children
  if (shown !== undefined) {
    for (const child of shown) yield* shownNodes(child)
  } else if (node._tag === "Child") {
    for (const child of View.slotNodes(node)) yield* shownNodes(child)
  }
}

/** @internal */
export const findChild = <Msg>(
  view: View.Node<Msg, any>,
  key: string | Component.Ref.Any,
  step: string
): View.Child<Msg, any> => {
  const child = children(view).find((child) =>
    typeof key === "string" ? child.key === key : child.ref !== undefined && child.ref.key === key.key
  )
  if (child === undefined) {
    throw new Error(
      `${step}: no child ${typeof key === "string" ? `with key "${key}"` : `with the ref ${key.key}`}; children: ${
        children(view).map((c) => c.ref !== undefined ? `ref ${c.key}` : c.key).join(", ")
      }`
    )
  }
  return child
}
