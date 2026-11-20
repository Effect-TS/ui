/**
 * `Router.prefetch` on the runtime: an instance's declaration, the walk of the pages it names and
 * the check after the navigation settles. Only the Router imports it, and gives it to the runtime through
 * its hooks, so an app without a Router doesn't ship it.
 *
 * @internal
 */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type * as Component from "../Component.ts"
import * as Feature from "../Feature.ts"
import type * as Router from "../Router.ts"
import * as View from "../View.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import type * as services from "./services.ts"

/**
 * An instance, as a declaration, its walk and its check see it.
 *
 * @internal
 */
export interface Instance {
  readonly path: string
  readonly closed: boolean
  readonly failure: unknown
  readonly parent: Instance | undefined
  /** Its services. `ctx` is `undefined` while its own Layer builds, or once it has failed. */
  readonly env: { readonly ctx: Context.Context<any> | undefined }
  readonly component: Component.Any
  readonly children: Iterable<Instance>
  /** Its number among the instances the runtime has made. */
  readonly born: number
  readonly shares: unknown
  /** The entry keys it watched, while the runtime records them. */
  readonly watched: ReadonlySet<string> | undefined
}

/**
 * What the runtime gives a declaration.
 *
 * @internal
 */
export interface Runtime {
  readonly now: () => number
  readonly report: (problem: { readonly _tag: string; readonly message: string }) => void
  readonly cache: () => queryCore.Cache
  /** The key `watched` holds for an entry. */
  readonly entryKey: (query: string, argsKey: string) => string
  readonly root: () => Instance
  /** How many instances have been made and how many Layer builds have begun. */
  readonly since: () => Since
  /** The count of the last Layer build that failed. */
  readonly lastFailedBuild: () => number
  /** Records the watches of the instances made from now until the returned function is called. */
  readonly record: () => () => void
  /** The instances whose watches are recorded. */
  readonly recorded: Iterable<Instance>
}

interface Since {
  readonly born: number
  readonly build: number
}

/**
 * The Router's problem classes, which it passes in: this module can't import them.
 *
 * @internal
 */
export interface Problems {
  readonly PrefetchThrew: typeof Router.PrefetchThrew
  readonly PrefetchQueryNotProvided: typeof Router.PrefetchQueryNotProvided
  readonly PrefetchPageNotMounted: typeof Router.PrefetchPageNotMounted
  readonly PrefetchEntryNotWatched: typeof Router.PrefetchEntryNotWatched
}

/** An intent is dropped when the declaration ran for the same printed route within this time. */
const intentGuardMillis = 30_000

/**
 * Registers an instance's declaration with the Router. `declared` holds the latest `subscriptions`
 * run's map. The returned function unregisters it.
 *
 * @internal
 */
export const declare = (
  register: (declarer: services.Declarer) => () => void,
  problems: Problems,
  runtime: Runtime,
  inst: Instance,
  declared: { readonly declaration: services.Prefetch }
): () => void => {
  // The printed routes the declaration ran for, and when.
  const ran = new Map<string, number>()
  return register({
    routes: () => declared.declaration.routes,
    run: (route, intent) => {
      if (inst.closed || inst.failure !== undefined) return undefined
      const now = runtime.now()
      for (const [key, at] of ran) if (now - at >= intentGuardMillis) ran.delete(key)
      const printed = declared.declaration.routes.print(route)
      if (intent && ran.has(printed)) return undefined
      ran.set(printed, now)
      return runDeclaration(problems, runtime, inst, declared.declaration, route, intent)
    }
  })
}

interface WalkedPage {
  readonly name: string
  /** The entries the walk prefetched, by entry key. */
  readonly entries: Map<string, { readonly query: string; readonly logKey: string }>
}

/**
 * Runs a declaration for a route in the declarer's context: every page is walked and its queries
 * prefetched. A navigation gets the check to run once it settles.
 */
const runDeclaration = (
  problems: Problems,
  runtime: Runtime,
  inst: Instance,
  declaration: services.Prefetch,
  route: { readonly _tag: string },
  intent: boolean
): services.PrefetchCheck | undefined => {
  // A declarer whose own Layer is still building, or failed, sees none of its queries yet.
  const envCtx = inst.env.ctx
  if (envCtx === undefined) return undefined
  const handler = declaration.map[route._tag]
  if (handler === undefined) return undefined
  let pages: ReadonlyArray<services.Page>
  try {
    pages = handler(route)
  } catch (error) {
    runtime.report(prefetchThrew(problems, inst, `Router.prefetch ${route._tag}`, error))
    return undefined
  }
  if (intent) {
    for (const page of pages) walkPage(problems, runtime, inst, envCtx, page)
    return undefined
  }
  const since = runtime.since()
  const walked = pages.map((page) => walkPage(problems, runtime, inst, envCtx, page))
  // Records the watches of the instances created from here until the check ends.
  const end = runtime.record()
  return {
    settled: () => {
      try {
        checkPrefetch(problems, runtime, inst, walked, since)
      } finally {
        end()
      }
    },
    dropped: end
  }
}

const prefetchThrew = (problems: Problems, inst: Instance, page: string, error: unknown) =>
  new problems.PrefetchThrew({
    message: `${inst.path}: ${page} threw while Router.prefetch walked it, so the rest of its walk was skipped`,
    path: inst.path,
    page,
    error
  })

/**
 * Walks one page with no instance: `init` with its props, its Commands discarded, then what its
 * queries would watch first, then its initial view, recursing into component children. A throw stops
 * the page's walk. The declarer is unaffected.
 */
const walkPage = (
  problems: Problems,
  runtime: Runtime,
  inst: Instance,
  envCtx: Context.Context<any>,
  page: services.Page
): WalkedPage => {
  const component = page.component as Component.Any
  const walked: WalkedPage = { name: component.definition.name, entries: new Map() }
  const visit = (component: Component.Any, props: unknown, provided: boolean) => {
    // Behind a `provide`, a query the declarer can't see may be given below it: the skip is silent.
    const behind = provided || component.layer !== undefined
    const model = component.init(props).model
    const bound = queryCore.boundOf(component)
    if (bound !== undefined) {
      const context = bound.context(model, props, undefined)
      for (const field of bound.entries) {
        const current = context.argsOf(field.name)
        const entries: ReadonlyArray<componentQueries.Keyed> = current.entries ??
          (current.argsKey === undefined ? [] : [{ args: current.args, argsKey: current.argsKey }])
        if (entries.length === 0) continue
        const def = queryCore.loaded!.defOf(field.query)
        const fetcher = Context.getOption(envCtx, field.query as any)
        if (Option.isNone(fetcher)) {
          if (!behind) {
            runtime.report(
              new problems.PrefetchQueryNotProvided({
                message: `${inst.path}: Router.prefetch skipped the query ${
                  JSON.stringify(def.name)
                } of ${component.definition.name}, because the declaring component can't see it. Provide it at the declarer.`,
                path: inst.path,
                page: walked.name,
                query: def.name
              })
            )
          }
          continue
        }
        for (const entry of entries) {
          runtime.cache().prefetch(def, entry.args, fetcher.value as (args: any) => Effect.Effect<any, any>)
          walked.entries.set(runtime.entryKey(def.name, entry.argsKey), {
            query: def.name,
            logKey: def.logKey(entry.args, entry.argsKey)
          })
        }
      }
    }
    const visitNode = (node: View.Node<any, any>): void => {
      switch (node._tag) {
        case "Text":
        case "Outlet":
          return
        case "Element":
          for (const child of node.children) visitNode(child)
          return
        case "Child":
          // What the parent passed for the child's slots is the parent's, whether the child places it.
          for (const child of View.slotNodes(node)) visitNode(child)
          // A feature has no implementation until its Layer is built.
          if (Feature.isService(node.component)) return
          // A headless child's view is a closure over its parts, which this walk doesn't run.
          if (node.view !== undefined) return
          return visit(node.component, node.props, behind)
      }
    }
    visitNode(component.view(model, props, undefined, undefined, undefined, shared))
  }
  // A page that reads shared state reads the owners above the declarer: the walk doesn't run the
  // closures of the headless components in the page, owners among them.
  const shared: Component.SharedLookup = (owner) => {
    for (let at: Instance | undefined = inst; at !== undefined; at = at.parent) {
      if (at.component.definition === owner.definition) return at.shares
    }
    throw new Error(`${owner.definition.name} isn't above ${inst.path}, so its shared state can't be read`)
  }
  try {
    visit(component, page.props, false)
  } catch (error) {
    runtime.report(prefetchThrew(problems, inst, component.definition.name, error))
  }
  return walked
}

/**
 * Checks prefetch declarations after navigation settles, matching pages by component name.
 * Reports unmounted pages and checks new instances against their recorded watches; older
 * instances are skipped. Skips the entire check if a Layer build begun since navigation failed.
 *
 * Walks the tree only for pages with no new instance, at most once per check.
 */
const checkPrefetch = (
  problems: Problems,
  runtime: Runtime,
  inst: Instance,
  pages: ReadonlyArray<WalkedPage>,
  since: Since
) => {
  if (runtime.lastFailedBuild() > since.build) return
  const fresh = new Map<string, Array<Instance>>()
  for (const at of runtime.recorded) {
    if (at.closed || at.born <= since.born) continue
    const found = fresh.get(at.component.definition.name)
    if (found === undefined) fresh.set(at.component.definition.name, [at])
    else found.push(at)
  }
  let mounted: Set<string> | undefined
  const mountedNames = () => {
    if (mounted !== undefined) return mounted
    const names = new Set<string>()
    const collect = (at: Instance) => {
      if (at.closed) return
      names.add(at.component.definition.name)
      for (const child of at.children) collect(child)
    }
    collect(runtime.root())
    return mounted = names
  }
  for (const page of pages) {
    const found = fresh.get(page.name)
    if (found === undefined) {
      // Older than the navigation, it is skipped. None at all is reported.
      if (mountedNames().has(page.name)) continue
      runtime.report(
        new problems.PrefetchPageNotMounted({
          message: `${inst.path}: Router.prefetch declared the page ${page.name}, and none was mounted`,
          path: inst.path,
          page: page.name
        })
      )
      continue
    }
    // Every instance below a fresh one is fresh too, so its watches were recorded.
    const watched = new Set<string>()
    const gather = (at: Instance) => {
      if (at.watched !== undefined) { for (const key of at.watched) watched.add(key) }
      for (const child of at.children) gather(child)
    }
    for (const at of found) gather(at)
    for (const [key, entry] of page.entries) {
      if (watched.has(key)) continue
      runtime.report(
        new problems.PrefetchEntryNotWatched({
          message:
            `${inst.path}: Router.prefetch fetched ${entry.logKey} for ${page.name}, and the page never watched it`,
          path: inst.path,
          page: page.name,
          query: entry.query,
          logKey: entry.logKey
        })
      )
    }
  }
}
