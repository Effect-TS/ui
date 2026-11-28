/**
 * Vitest configuration for testing an `@effect/ui-native` app in Node.
 *
 * {@link plugin} compiles the React Native Flow sources used by `Css` and
 * `Image`, so tests can import the kit without mocking React Native imports.
 * It supports the kit's non-React dependencies, not React Native's React
 * components.
 *
 * Requires Node 22.15 or later. Install `flow-remove-types` and `sucrase`
 * as dev dependencies before using the plugin.
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * import { NativeVitest } from "@effect/ui-native/node"
 * import { defineConfig } from "vitest/config"
 *
 * export default defineConfig({ plugins: [NativeVitest.plugin()] })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * Options accepted by {@link plugin}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /**
   * Selects React Native's platform files, affecting values such as
   * `Css.color("red")`. Defaults to `"ios"`. Does not change the OS
   * that kit components read from `Native.Device`.
   */
  readonly platform?: "android" | "ios" | undefined
}

/**
 * The Vite plugin {@link plugin} returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Plugin {
  readonly name: string
  readonly config: (config: { readonly root?: string | undefined }) => {
    readonly test: {
      readonly execArgv: Array<string>
      readonly server: {
        readonly deps: {
          readonly external: Array<RegExp>
          readonly inline: Array<RegExp>
        }
      }
    }
  }
}

/**
 * Returns a Vitest plugin that compiles the kit's React Native dependencies
 * for Node tests.
 *
 * **Details**
 *
 * Each test worker installs Node loader hooks before Vitest starts, so
 * the app's setup files can import the kit too. React Native dependencies
 * load through Node; `@effect/ui-native` is inlined for Vitest's CommonJS
 * interop. Compiled files are cached in
 * `node_modules/.cache/@effect/ui-native/vitest` under the project's root.
 * `NativeApp` loads without its Fast Refresh client, which needs Metro.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const plugin = (options?: Options | undefined): Plugin => ({
  name: "@effect/ui-native/vitest",
  config: (config) => ({
    test: {
      execArgv: [
        "--import",
        `${loader}?${new URLSearchParams({
          platform: options?.platform ?? "ios",
          cache: Path.resolve(
            config.root ?? "",
            "node_modules/.cache/@effect/ui-native/vitest"
          )
        })}`
      ],
      server: {
        deps: {
          external: [
            /[\\/]node_modules[\\/](?:react-native|@react-native[\\/][^\\/]+)[\\/]/
          ],
          inline: [/[\\/]@effect[\\/]ui-native[\\/]/]
        }
      }
    }
  })
})

const self = fileURLToPath(import.meta.url)
const loader = pathToFileURL(
  Path.join(Path.dirname(self), "internal/vitest" + Path.extname(self))
).href
