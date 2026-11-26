/**
 * Module types for `virtual:@effect/ui/document`, which
 * `@effect/ui/html/HtmlServerVite` provides to the server entry.
 * Add `"@effect/ui/html/HtmlServerViteDocument"` to `compilerOptions.types`,
 * or reference it with
 * `/// <reference types="@effect/ui/html/HtmlServerViteDocument" />`.
 *
 * @stability experimental
 * @since 0.1.0
 */
declare module "virtual:@effect/ui/document" {
  import type { Rendered } from "@effect/ui/html/HtmlServer"
  /**
   * Fills the app's `index.html` with a rendered page, using
   * `HtmlServer.document`. In dev the template is `index.html` after Vite's
   * HTML transforms, and in a build it is the client build's `index.html`.
   */
  export const document: (rendered: Rendered<unknown>) => string
}
