/**
 * The Router for a native app: `Router.make` on a history kept in memory,
 * with Android's Back button and deep links.
 *
 * **Details**
 *
 * `layer` provides the `Router` and its Commands, as `BrowserRouter` does
 * in the browser. Each history entry is a screen: the root holds the
 * entries up to the current one, as a list of routes with an `id` each,
 * and draws them with the kit's `Stack`. `props` reads them when the root
 * mounts, and `subscription` reports each navigation, which `follow`
 * applies to the list. Covered screens stay mounted, so the Router saves
 * nothing of a page it leaves: Back shows the screen that is still there.
 *
 * Back goes back one entry while there is one, and otherwise runs Android's
 * default, which closes the app. A `BackHandler.onPress` on the top screen
 * gets the press first. While a `Router.blocked` block is held, Back does
 * nothing.
 *
 * Deep links need `prefixes`. A URL that starts with one is routed, with
 * the rest as its path: with `"myapp://"`, `myapp://people/1?tab=a` opens
 * `/people/1?tab=a`, and with `"https://example.com"`,
 * `https://example.com/people/1` opens `/people/1`. The app starts at the
 * URL that launched it, or at `/`, and a URL that opens it while it runs
 * is pushed. A path the routes don't parse, with no catch-all route, is
 * ignored. The app starts at the routes' base root without a deep link. Without `prefixes` it always starts at `/`. An href the
 * routes don't parse, as from `Router.load` or a `Link`, opens with
 * `Linking.openURL`.
 *
 * The screen reader's focus moves to a screen that comes to the top, which
 * reads it, so nothing is announced. A screen that has more to say runs
 * `AccessibilityInfo.announce`.
 *
 * **Example** (An app with two screens)
 *
 * ```ts
 * import { NativeApp, NativeRouter } from "@effect/ui-native"
 * import { Stack } from "@effect/ui-native/kit"
 *
 * const App = Native.component({
 *   name: "App",
 *   props: Schema.Struct({ stack: NativeRouter.Stack(AppRoute) }),
 *   model: NativeRouter.Stack(AppRoute),
 *   message: Message
 * }).make({
 *   init: ($) => $.props.stack,
 *   update: {
 *     Navigated: ($, { navigation }) =>
 *       $.set(NativeRouter.follow(AppRoute, $.model, navigation))
 *   },
 *   subscriptions: ({ model }) => [
 *     NativeRouter.subscription(AppRoute, model, (navigation) => Message.Navigated({ navigation }))
 *   ],
 *   view: (h, stack) => Stack(h, { entries: stack, screen })
 * })
 *
 * NativeApp.register(
 *   NativeApp.mount(App, NativeRouter.props(AppRoute)).pipe(
 *     Layer.provide(NativeRouter.layer({ routes: AppRoute, prefixes: ["myapp://"] }))
 *   )
 * )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Route from "@effect/ui/Route"
import * as Router from "@effect/ui/Router"
import type * as Subscription from "@effect/ui/Subscription"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { handle } from "./kit/internal/back.ts"
import * as Linking from "./kit/Linking.ts"
import type { StackEntry } from "./kit/Stack.ts"
import * as Native from "./Native.ts"

/**
 * The entries up to the current one, the current one last.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Stack<A> = ReadonlyArray<StackEntry<A>>

/**
 * The Schema of a `Stack` of the routes, for a root's props and Model.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Stack = <U extends Router.Routes & Schema.Top>(routes: U) =>
  Schema.Array(Schema.Struct({ id: Schema.Number, route: routes }))

/**
 * A navigation `subscription` reports: the route it went to, the index of
 * the history entry it went to, and the `id` a new entry gets.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Navigation<A> {
  readonly route: A
  readonly index: number
  readonly id: number
}

/**
 * The Schema of a `Navigation` of the routes, for a message.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Navigation = <U extends Router.Routes & Schema.Top>(
  routes: U
) =>
  Schema.Struct({
    route: routes,
    index: Schema.Number,
    id: Schema.Number
  })

/**
 * The options of `layer`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly routes: Route.AnyUnion
  /**
   * The URLs that are deep links: each is the start of the URLs routed with
   * the rest as their path, or a function that returns a URL's path, or
   * `undefined` when it isn't a deep link.
   */
  readonly prefixes?:
    | ReadonlyArray<string>
    | ((url: string) => string | undefined)
    | undefined
  /**
   * Called once per navigation, when it settles, with the title the top
   * screen sets with `Head`.
   */
  readonly onSettled?: Router.Options["onSettled"]
}

/**
 * The path a URL opens, if it starts with one of `prefixes`.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const pathOf = (
  prefixes: NonNullable<Options["prefixes"]>,
  url: string
): string | undefined => {
  if (typeof prefixes === "function") return prefixes(url)
  for (const prefix of prefixes) {
    if (!url.startsWith(prefix)) continue
    const rest = url.slice(prefix.length)
    // A prefix such as `https://example.com` doesn't match `https://example.community`.
    if (rest !== "" && !"/?#".includes(rest[0]!) && !prefix.endsWith("/")) {
      continue
    }
    return rest.startsWith("/") ? rest : "/" + rest
  }
  return undefined
}

// A history in memory, which opens what the routes don't parse with
// `Linking.openURL`.
const memoryHistory = (url: string, device: Native.Device): Router.History => {
  const history = Router.memoryHistory(url)
  return {
    ...history,
    load: (href) => {
      Effect.runFork(
        Linking.openURL(href).pipe(
          Effect.ignore,
          Effect.provideService(Native.Device, device)
        )
      )
    }
  }
}

/**
 * Provides the `Router` and its Commands on a history in memory, with
 * Android's Back button and the deep links `prefixes` match.
 *
 * **Details**
 *
 * With `prefixes`, the Layer asks for the URL that launched the app before
 * it builds the Router, so the root mounts one native round trip later.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options: Options): Layer.Layer<Router.Services> =>
  Layer.unwrap(Effect.gen(function*() {
    const device = yield* Native.Device
    const { prefixes } = options
    const launched = prefixes === undefined
      ? undefined
      : yield* Linking.initialURL.pipe(
        Effect.orElseSucceed(() => undefined),
        Effect.provideService(Native.Device, device)
      )
    // A deep link the routes don't parse, with no catch-all, isn't one.
    const routed = (url: string) => {
      const path = pathOf(prefixes!, url)
      return path !== undefined && Option.isSome(options.routes.resolve(path))
        ? path
        : undefined
    }
    const base = options.routes.base()
    const root = base === "#" ? "#/" : base || "/"
    const start = launched === undefined ? undefined : routed(launched)
    const follow = Layer.effectDiscard(Effect.gen(function*() {
      const router = yield* Router.Router
      // The bottom handler: a BackHandler.onPress gets the press first.
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          handle(device)(() => {
            if (router.blocked()) return true
            if (router.location().index === 0) return false
            Effect.runSync(router.back)
            return true
          }, true)
        ),
        (off) => Effect.sync(off)
      )
      if (prefixes !== undefined) {
        yield* Effect.forkScoped(Stream.runForEach(
          Linking.urls,
          (url) => {
            const path = routed(url)
            return path === undefined ? Effect.void : router.navigate(path)
          }
        ))
      }
    })).pipe(Layer.provide(Layer.succeed(Native.Device, device)))
    return Layer.provideMerge(
      follow,
      Router.make({
        routes: options.routes,
        history: memoryHistory(start ?? root, device),
        restore: false,
        onSettled: options.onSettled
      })
    )
  }))

/**
 * The props of a root whose only prop is the stack: `{ stack }`, with the
 * Router's current entry.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const props = <U extends Router.Routes>(
  routes: U
): Effect.Effect<{ readonly stack: Stack<U["Type"]> }, never, Router.Router> =>
  Effect.map(Router.currentRoute(routes), (route) => ({
    stack: [{ id: 0, route }]
  }))

/**
 * The Subscription that reports each navigation to a root holding a stack.
 * Apply it with `follow`.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const subscription = <U extends Router.Routes, Msg>(
  routes: U,
  held: Stack<U["Type"]>,
  f: (navigation: Navigation<U["Type"]>) => Msg
): Subscription.Subscription<Msg, Router.Router> =>
  Router.subscription(
    routes,
    held[held.length - 1]!.route,
    (route, { index, seq }) => f({ route, index, id: seq })
  )

/**
 * The stack after a navigation.
 *
 * **Details**
 *
 * The stack keeps the entries before the navigation's `index`. The entry
 * at the index keeps its `id`, so its screen stays mounted, while its
 * route is on the same page: after Back, a `patchSearch`, or a link to the
 * current route. Otherwise it gets a new `id`.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const follow = <U extends Router.Routes>(
  routes: U,
  stack: Stack<U["Type"]>,
  navigation: Navigation<U["Type"]>
): Stack<U["Type"]> => {
  const { index, route } = navigation
  const at = stack[index]
  const same = at !== undefined && at.route._tag === route._tag &&
    routes.printPath(at.route) === routes.printPath(route)
  const kept = stack.slice(0, index)
  // A new entry for a `#hash` is delivered with the current seq, so a new
  // id is never one the stack holds.
  const id = same
    ? at.id
    : Math.max(navigation.id, ...stack.map((entry) => entry.id + 1))
  kept.push({ id, route })
  return kept
}
