/**
 * Metro configuration for an `@effect/ui-native` app.
 *
 * Metro doesn't tree-shake, so a release bundle would carry every module
 * `effect` and `@effect/ui` could need. {@link withEffectUi} pre-bundles
 * release builds with Vite, which does, and hands Metro the result with
 * React Native left out for Metro to resolve. In development Metro serves
 * the sources, and edits reach the app through Fast Refresh.
 *
 * @example
 * ```ts
 * // metro.config.js
 * const { getDefaultConfig } = require("expo/metro-config")
 * const { NativeMetro } = require("@effect/ui-native/node")
 *
 * module.exports = NativeMetro.withEffectUi(getDefaultConfig(__dirname))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Fs from "node:fs"
import * as Path from "node:path"
import { fileURLToPath } from "node:url"
import { prebundle } from "./internal/prebundle.ts"

/**
 * The parts of a Metro config {@link withEffectUi} reads and changes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MetroConfig {
  readonly projectRoot: string
  readonly resolver?: {
    readonly unstable_conditionNames?: ReadonlyArray<string> | undefined
    readonly sourceExts?: ReadonlyArray<string> | undefined
    readonly assetExts?: ReadonlyArray<string> | undefined
    readonly resolverMainFields?: ReadonlyArray<string> | undefined
    readonly resolveRequest?: ResolveRequest | null | undefined
    readonly [key: string]: unknown
  } | undefined
  readonly serializer?: {
    readonly getModulesRunBeforeMainModule?:
      | ((entryFilePath: string) => ReadonlyArray<string>)
      | undefined
    readonly [key: string]: unknown
  } | undefined
  readonly [key: string]: unknown
}

/**
 * Options accepted by {@link withEffectUi}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The module the bundle starts at. The `main` of the app's `package.json` by default. */
  readonly entry?: string | undefined
  /**
   * Whether a release build is pre-bundled with Vite. `true` by default; with
   * `false`, Metro bundles the sources.
   */
  readonly prebundle?: boolean | undefined
  /** The platforms a release build is pre-bundled for. `["android", "ios"]` by default. */
  readonly platforms?: ReadonlyArray<string> | undefined
  /**
   * Modules the pre-bundle leaves to Metro, besides `react-native`, `expo`
   * and their scoped and prefixed packages. Leave out any other package with
   * native code. Static imports of assets in `resolver.assetExts` are left to
   * Metro automatically.
   */
  readonly external?: ReadonlyArray<string | RegExp> | undefined
}

/**
 * Metro's `resolver.resolveRequest`. The context is Metro's own, which an
 * app's resolver types with Metro's types.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ResolveRequest = (
  // oxlint-disable-next-line no-explicit-any
  context: any,
  moduleName: string,
  platform: string | null
) => {
  readonly type: string
  readonly filePath?: string
  readonly filePaths?: ReadonlyArray<string>
}

const own = (file: string) => {
  const self = fileURLToPath(import.meta.url)
  return Fs.realpathSync(
    Path.join(Path.dirname(self), file + Path.extname(self))
  )
}

const mainOf = (root: string): string => {
  const pkg = JSON.parse(
    Fs.readFileSync(Path.join(root, "package.json"), "utf8")
  )
  if (typeof pkg.main !== "string") {
    throw new Error(
      `[@effect/ui-native] ${root}/package.json has no "main", so pass the entry to withEffectUi`
    )
  }
  return pkg.main
}

/**
 * Configures Metro for an `@effect/ui-native` app, and pre-bundles a
 * release build. Use the result as the export of `metro.config.js`.
 *
 * **Details**
 *
 * A release build is one with `NODE_ENV=production`, as `expo export`,
 * `expo run:android --variant release`, Gradle's and Xcode's release builds
 * and EAS Build all set. For one, Vite bundles the entry with the
 * `production` condition, leaving out React Native, Expo and static asset
 * imports (`resolver.assetExts`), and Metro bundles the result in place of
 * the entry. Other packages with native code go in `external`. Use static
 * `import` for assets rather than `require`: pre-bundling rejects `require`
 * of an asset.
 *
 * The app's own `resolver.resolveRequest` also resolves the imports Vite
 * bundles, so a release gets the modules development does. It is given the
 * resolver config, `dev`, `originModulePath` and `platform`, and its
 * `context.resolveRequest` hands the import, under the name and origin it is
 * given, back to Vite. It may resolve to a source file, asset files, or an
 * empty module; anything else fails the build, and belongs in `external`. Vite
 * resolves a handed-back import only after the app's resolver returns, and
 * only for the build's platform, so a resolver that reads its result, or
 * hands it back for another platform, fails the build too.
 *
 * In development the entry's sources are served as they are, and the
 * refresh runtime is run before them, so that an edit to a module whose
 * exports are all components swaps them in place without losing state.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const withEffectUi = async <Config extends MetroConfig>(
  config: Config | Promise<Config>,
  options?: Options | undefined
): Promise<Config> => {
  const resolved = await config
  const root = resolved.projectRoot
  if (process.env.NODE_ENV === "production") {
    const conditions = resolved.resolver?.unstable_conditionNames ?? []
    const resolver = {
      ...resolved.resolver,
      unstable_conditionNames: conditions.includes("production")
        ? conditions
        : [...conditions, "production"]
    }
    if (options?.prebundle === false) return { ...resolved, resolver }
    const entry = Path.resolve(root, options?.entry ?? mainOf(root))
    // Metro reads its files when it starts, so every platform is built now.
    const bundles = Object.fromEntries(
      await Promise.all(
        (options?.platforms ?? ["android", "ios"]).map(async (platform) => [
          platform,
          await prebundle(resolved, platform, entry, options?.external ?? [])
        ])
      )
    )
    const upstream = resolved.resolver?.resolveRequest
    return {
      ...resolved,
      resolver: {
        ...resolver,
        // Swap the entry for its pre-bundle and restore importers for deferred assets.
        resolveRequest: (context, moduleName, platform) => {
          const bundle = platform === null ? undefined : bundles[platform]
          if (!context.dev && bundle !== undefined) {
            const asset = bundle.assets.get(moduleName)
            if (asset !== undefined) {
              const resolve = asset.runUpstream && upstream != null
                ? upstream
                : context.resolveRequest
              return resolve(
                { ...context, originModulePath: asset.origin },
                asset.moduleName,
                platform
              )
            }
          }
          const found = (upstream ?? context.resolveRequest)(
            context,
            moduleName,
            platform
          )
          return !context.dev && bundle !== undefined &&
              found.filePath === bundle.entry
            ? { type: "sourceFile", filePath: bundle.file }
            : found
        }
      } satisfies MetroConfig["resolver"]
    }
  }
  const before = resolved.serializer?.getModulesRunBeforeMainModule
  const refresh = own("../internal/devOn")
  return {
    ...resolved,
    serializer: {
      ...resolved.serializer,
      getModulesRunBeforeMainModule: (entryFilePath: string) => [
        ...(before?.(entryFilePath) ?? []),
        refresh
      ]
    }
  }
}
