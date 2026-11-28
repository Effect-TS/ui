import * as Context from "effect/Context"

/**
 * A stack screen, and the screen of the stack around it. The stack sets `covered` while another screen is over it.
 *
 * @internal
 */
export interface Screen {
  covered: boolean
  readonly parent: Screen | undefined
}

/**
 * The service holding the `Screen` a component is drawn on.
 *
 * @internal
 */
export class ScreenState extends Context.Service<ScreenState, Screen>()(
  "@effect/ui-native/kit/Stack/ScreenState"
) {}

/**
 * Whether a stack screen covers the component with this context, or the
 * stack it is on. A component outside a stack is never covered.
 *
 * @internal
 */
export const covered = (context: Context.Context<never>): boolean => {
  let screen = Context.getOrUndefined(
    context as Context.Context<ScreenState>,
    ScreenState
  )
  while (screen !== undefined) {
    if (screen.covered) return true
    screen = screen.parent
  }
  return false
}
