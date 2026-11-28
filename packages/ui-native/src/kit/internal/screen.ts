import * as Context from "effect/Context"

/**
 * The stack screen a component is drawn on. The stack sets `covered` while
 * another screen is over it.
 *
 * @internal
 */
export class ScreenState extends Context.Service<
  ScreenState,
  { covered: boolean }
>()("@effect/ui-native/kit/Stack/ScreenState") {}

/**
 * Whether a stack screen covers the component with this context. A
 * component outside a stack is never covered.
 *
 * @internal
 */
export const covered = (context: Context.Context<never>): boolean =>
  Context.getOrUndefined(context as Context.Context<ScreenState>, ScreenState)
    ?.covered === true
