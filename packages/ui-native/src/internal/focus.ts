import type { NativeNode } from "../NativeHost.ts"
import { mounted } from "./node.ts"

/**
 * The view native last reported focused, until it reports it blurred.
 *
 * @internal
 */
export const focus: { node: NativeNode | undefined } = { node: undefined }

/**
 * Blurs the focused view if it's still mounted, which hides the keyboard.
 *
 * @internal
 */
export const blurFocused = (): void => {
  const node = focus.node
  if (node !== undefined && mounted(node)) node.host.command(node, "blur")
}
