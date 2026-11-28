/**
 * Vitest configuration for testing an `@effect/ui-native` app in Node.
 *
 * Some kit modules load React Native's own code: `Css` its style
 * processors, and `Image` its asset registry. Those are Flow sources
 * that Node can't load. {@link plugin} compiles them as Node loads them,
 * as React Native's Jest preset does, so a test imports the kit as the app
 * does, without mocks.
 *
 * Only React Native's modules without React components load: the ones the
 * kit uses do. The compilers, `flow-remove-types` and `sucrase`, are
 * optional peer dependencies for the app to install. Node 22.15 or later is
 * required.
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
   * Which of React Native's platform files load, which decides, for example,
   * what `Css.color` returns. `"ios"` by default, as in React Native's Jest
   * preset. The kit's own platform checks read `Native.Device`'s `os`.
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
 * A Vitest plugin that loads React Native's modules in Node.
 *
 * **Details**
 *
 * React Native is left to Node, which compiles its files through loader
 * hooks. Each test worker installs them with `--import` before Vitest
 * starts, so they apply to the app's own setup files too.
 * `@effect/ui-native` is inlined so Vitest resolves its imports of React
 * Native. Compiled files are cached in
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
