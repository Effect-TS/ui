/**
 * Mounts a `Case` in a real document, as the workbench page of
 * `DevToolsVite.plugin` does.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as hot from "#hot"
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Component from "../../Component.ts"
import * as caseRun from "../../internal/caseRun.ts"
import type * as Renderer from "../../Renderer.ts"
import type * as Case from "../../testing/Case.ts"
import * as BrowserHost from "../BrowserHost.ts"
import type * as Html from "../Html.ts"

/**
 * Mounts `c` into `container` with `BrowserHost`, sends its messages, and
 * returns the root, for the life of the current Scope.
 *
 * **Details**
 *
 * The root starts from the case's `model` when it has one, and the case's
 * `layer` is built in the current Scope and provided around the mount.
 * The messages go in the same order as with `Play.fromCase`, so a case
 * shows the same state in both. The root never adopts the state saved
 * before a Vite full reload, so a reload doesn't send the messages again to
 * a restored Model. In-place hot reload still updates it.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mount = <C extends Case.AnyComponent, R>(
  c:
    & Case.Case<C, R>
    & { readonly component: BrowserHost.HtmlRoot<ElementsOf<C>> },
  container: globalThis.Element
): Effect.Effect<
  Renderer.Root<Component.Model<C>, Component.Message<C>>,
  never,
  Exclude<R, Html.Host> | Scope.Scope
> =>
  caseRun.mount(
    c,
    Effect.suspend(() => {
      const component = c.component as unknown as Component.Any
      return BrowserHost.mountRoot(
        component,
        c.props,
        container,
        { hot: caseRun.session(c, hot.open(component, container, true)) } as {},
        undefined
      )
    })
  ) as any

type ElementsOf<C> = C extends
  Component.Members<any, any, any, any, any, any, infer V, any> ? V : never
