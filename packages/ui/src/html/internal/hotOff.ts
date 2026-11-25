import type * as Context from "effect/Context"
import type * as Component from "../../Component.ts"
import type * as runtime from "../../internal/runtime.ts"

export const open = (
  _component: Component.Any,
  _container: globalThis.Element,
  _ctx: Context.Context<any>
): runtime.HotSession | undefined => undefined
