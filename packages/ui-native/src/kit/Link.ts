/**
 * A link to an href, which the Router follows when it's pressed.
 *
 * **Details**
 *
 * `Link` is a `Pressable` with the link accessibility role. Pressing it
 * navigates to `href`, as a click on an anchor does on the web, so it needs
 * no message: an href the routes parse is pushed, and any other opens with
 * `Linking.openURL` under `NativeRouter`. A held `Router.blocked` block
 * stops it. A touch that starts on it reports `Router.intent`, so the
 * Router's `prefetch` handlers can start loading the page.
 *
 * Write `href` with the routes' `print`. The element requires the
 * `Router`, which it finds when it mounts. It takes the other options of
 * `Pressable`, and `onPress` still sends its message after the
 * navigation starts.
 *
 * **Example** (A row that opens a person)
 *
 * ```ts
 * import { Link } from "@effect/ui-native/kit"
 *
 * Link(h, { href: AppRoute.print(AppRoute.Person({ params: { id } })) })
 *   .style(row)
 *   .children(h.text(name))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Mount from "@effect/ui/Mount"
import type * as Router from "@effect/ui/Router"
import type * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import type * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import type { PressOptions } from "./internal/press.ts"
import { hold } from "./internal/router.ts"
import { Pressable, type PressableElement } from "./Pressable.ts"

// The Router of each mounted link, which a touch on it reaches through the
// press recognizer.
const routers = new WeakMap<NativeNode, Router.Router>()

const Follow = Mount.makeStream(
  "Link",
  {},
  (node: NativeNode) => hold(routers, node)
)

/**
 * A pressable link that navigates to `href`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Link = <
  Msg,
  B extends PressableElement<Msg> = Native.ViewElement<
    Msg,
    never,
    Native.ViewEvents,
    "view"
  >
>(
  h: {
    readonly view: Native.ViewElement<Msg, never, Native.ViewEvents, "view">
  },
  options: Parameters<typeof Pressable<Msg, B>>[1] & {
    /** Where the link goes: a path the routes parse, or a URL. */
    readonly href: string
  }
): View.WithRequirements<B, Router.Router> => {
  const { href } = options
  const link: PressOptions["link"] = (n, pressed) => {
    const router = routers.get(n)
    if (router === undefined) return
    Effect.runSync(pressed ? router.navigate(href) : router.intent(href))
  }
  const element: PressableElement<Msg> = Pressable(
    h,
    {
      ...options,
      link
    } as typeof options
  )
  return element
    .prop("accessibilityRole", "link")
    .onMount(Follow()) as any
}
