import * as Path from "node:path"
import type { MetroConfig, ResolveRequest } from "../NativeMetro.ts"

const native = /^(?:@?react-native|@?expo)(?:[-/]|$)/

const defaultAssetExts = [
  "bmp",
  "gif",
  "jpg",
  "jpeg",
  "png",
  "psd",
  "svg",
  "webp",
  "xml",
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "webm",
  "aac",
  "aiff",
  "caf",
  "m4a",
  "mp3",
  "wav",
  "html",
  "pdf",
  "yaml",
  "yml",
  "otf",
  "ttf",
  "zip"
]

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

// Metro resolves the unscaled path to every @2x/@3x variant.
const stripScaleSuffix = (filePath: string): string =>
  filePath.replace(/@[\d.]+x(?=\.[^./\\]+$)/, "")

/**
 * Pre-bundles `entry` for `platform` under the project's
 * `node_modules/.cache`. Returns the file written, and the file `entry`
 * resolved to. Modules resolve as Metro resolves them: the app's
 * `resolveRequest` first, then, on Android, an import of `./title` picks
 * `title.android.ts` over `title.native.ts` over `title.ts`, trying the
 * config's `sourceExts` in order. Static imports matching `assetExts` are left
 * to Metro by absolute path so Metro registers every scale variant and emits
 * the files.
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
  const assetExts = new Set(config.resolver?.assetExts ?? defaultAssetExts)
  const mainFields = config.resolver?.resolverMainFields ??
    ["react-native", "browser", "main"]
  const isExternal = (id: string) =>
    native.test(id) ||
    external.some((entry) =>
      typeof entry === "string"
        ? id === entry || id.startsWith(entry + "/")
        : entry.test(id)
    )
  // Metro tells an asset by its extension alone, case and all.
  const isAsset = (id: string) => assetExts.has(Path.extname(id).slice(1))
  // Without a resolver of the app's, every import is handed straight back.
  const resolveRequest: ResolveRequest = config.resolver?.resolveRequest ??
    ((context, moduleName, platform) =>
      context.resolveRequest(context, moduleName, platform))
  const result = await build({
    configFile: false,
    root: config.projectRoot,
    mode: "production",
    logLevel: "warn",
    plugins: [{
      name: "@effect/ui-native:metro",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (
          importer === undefined || source[0] === "\0" || isExternal(source)
        ) {
          return null
        }
        // Metro registers every scale of an asset left to it by absolute
        // path, and emits the files.
        const leave = (id: string) => {
          if (options.kind === "require-call") {
            throw new Error(
              `[@effect/ui-native] Cannot require asset "${source}" from ${importer} in a pre-bundle; use a static \`import\` instead`
            )
          }
          return { id, external: "absolute" as const }
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
          if (isAsset(moduleName)) {
            // A relative path resolves by its name alone: an asset with only
            // scaled (@2x) or platform (.android) files has no file of that name.
            return leave(
              moduleName[0] === "." || Path.isAbsolute(moduleName)
                ? Path.resolve(Path.dirname(origin), moduleName)
                : (await this.resolve(moduleName, origin, { skipSelf: true }))
                  ?.id ?? moduleName
            )
          }
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
        if (found.type === "assetFiles") {
          return leave(stripScaleSuffix(found.filePaths![0]!))
        }
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
