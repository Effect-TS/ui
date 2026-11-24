/**
 * Registers `OpenTui` as the app's element vocabulary through a side-effect
 * import. Every `view` then exposes the OpenTUI tags on `h` without passing
 * `elements: OpenTui` to each `Component.define`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import { registerElements } from "@effect/ui/View"
import * as OpenTui from "./OpenTui.ts"

declare module "@effect/ui/View" {
  interface Register {
    readonly elements: OpenTui.Elements
  }
}

registerElements(OpenTui)
