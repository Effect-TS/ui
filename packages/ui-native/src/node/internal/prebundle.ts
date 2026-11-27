import * as Path from "node:path"
import type { MetroConfig } from "../NativeMetro.ts"

const native = /^(?:@?react-native|@?expo)(?:[-/]|$)/

// Metro delegates synchronously; Vite resolves asynchronously. Return a
// deferred request and reject filePath reads inside the app's resolver.
interface Delegated {
  readonly type: "sourceFile"
  readonly filePath: string
  readonly moduleName: string
  readonly origin: string
}

const delegate = (moduleName: string, origin: string): Delegated => ({
  type: "sourceFile",
  get filePath(): string {
    throw new Error(
      `[@effect/ui-native] resolveRequest read the file context.resolveRequest resolved ${moduleName} to, which a pre-bundle can't tell it, so return the result as it is or add the module to external`
    )
  },
  moduleName,
  origin
})

const empty = "\0@effect/ui-native/empty"

/**
 * Pre-bundles `entry` for `platform` under the project's
 * `node_modules/.cache`. Returns the file written, and the file `entry`
 * resolved to. Modules resolve as Metro resolves them: the app's
 * `resolveRequest` first, then, on Android, an import of `./title` picks
 * `title.android.ts` over `title.native.ts` over `title.ts`, trying the
 * config's `sourceExts` in order.
 */
export const prebundle = async (
  config: MetroConfig,
  platform: string,
  entry: string,
  external: ReadonlyArray<string | RegExp>
): Promise<{ readonly file: string; readonly entry: string }> => {
  const { build } = await import("vite")
  const outDir = Path.join(
    config.projectRoot,
    "node_modules/.cache/@effect/ui-native"
  )
  const file = `main.${platform}.js`
  const sourceExts = config.resolver?.sourceExts ??
    ["js", "jsx", "json", "ts", "tsx"]
  const mainFields = config.resolver?.resolverMainFields ??
    ["react-native", "browser", "main"]
  const isExternal = (id: string) =>
    native.test(id) ||
    external.some((entry) =>
      typeof entry === "string"
        ? id === entry || id.startsWith(entry + "/")
        : entry.test(id)
    )
  const resolveRequest = config.resolver?.resolveRequest
  const result = await build({
    configFile: false,
    root: config.projectRoot,
    mode: "production",
    logLevel: "warn",
    plugins: resolveRequest == null ? [] : [{
      name: "@effect/ui-native:resolve-request",
      enforce: "pre",
      async resolveId(source, importer) {
        if (
          importer === undefined || source[0] === "\0" || isExternal(source)
        ) {
          return null
        }
        const delegated = new Set<Delegated>()
        const found = resolveRequest(
          {
            ...config.resolver,
            mainFields,
            dev: false,
            platform,
            preferNativePlatform: true,
            originModulePath: importer,
            customResolverOptions: {},
            resolveRequest: (
              context: { readonly originModulePath: string },
              moduleName: string,
              requested: string | null
            ) => {
              if (requested !== platform) {
                throw new Error(
                  `[@effect/ui-native] resolveRequest asked for ${moduleName} on platform ${requested}, but the pre-bundle for ${platform} resolves only for ${platform}`
                )
              }
              const request = delegate(moduleName, context.originModulePath)
              delegated.add(request)
              return request
            }
          },
          source,
          platform
        )
        if (delegated.has(found as Delegated)) {
          const { moduleName, origin } = found as Delegated
          if (moduleName === source && origin === importer) return null
          if (isExternal(moduleName)) return { id: moduleName, external: true }
          const resolved = await this.resolve(moduleName, origin, {
            skipSelf: true
          })
          if (resolved === null) {
            throw new Error(
              `[@effect/ui-native] resolveRequest resolved ${source} to ${moduleName}, which wasn't found from ${origin}`
            )
          }
          return resolved
        }
        if (found.type === "sourceFile") return found.filePath
        if (found.type === "empty") return empty
        throw new Error(
          `[@effect/ui-native] resolveRequest resolved ${source} to ${found.type}, which a pre-bundle can't hold, so add it to external`
        )
      },
      load: (id) => id === empty ? "export default {}" : null
    }],
    resolve: {
      // `production` drops the development checks of `@effect/ui`.
      conditions: ["react-native", "production", "import", "module", "default"],
      mainFields: [...mainFields],
      extensions: sourceExts.flatMap((
        ext
      ) => [`.${platform}.${ext}`, `.native.${ext}`, `.${ext}`]),
      tsconfigPaths: true
    },
    define: { "process.env.NODE_ENV": "\"production\"" },
    build: {
      outDir,
      emptyOutDir: false,
      // Metro minifies, and transforms the syntax for Hermes.
      minify: false,
      target: "esnext",
      lib: {
        entry,
        // Metro's Babel turns the imports of React Native into requires, with
        // its interop, as it does for the rest of the app.
        formats: ["es"],
        fileName: () => file
      },
      rollupOptions: { external: isExternal }
    }
  })
  const output = Array.isArray(result) ? result[0] : result
  const resolved = "output" in output
    ? output.output[0].facadeModuleId
    : undefined
  if (resolved == null) {
    throw new Error(
      `[@effect/ui-native] Vite didn't report the file ${entry} resolved to`
    )
  }
  return { file: Path.join(outDir, file), entry: Path.normalize(resolved) }
}
