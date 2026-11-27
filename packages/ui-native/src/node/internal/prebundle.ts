// The Vite build a release runs for each platform, before Metro bundles the
// result with React Native.
import * as Path from "node:path"
import type { MetroConfig } from "../NativeMetro.ts"

const native = /^(?:@?react-native|@?expo)(?:[-/]|$)/

/**
 * Pre-bundles `entry` for `platform` under the project's
 * `node_modules/.cache`, and returns the file written. Modules resolve as
 * Metro resolves them: on Android an import of `./title` picks
 * `title.android.ts` over `title.native.ts` over `title.ts`, trying the
 * config's `sourceExts` in order.
 */
export const prebundle = async (
  config: MetroConfig,
  platform: string,
  entry: string,
  external: ReadonlyArray<string | RegExp>
): Promise<string> => {
  const { build } = await import("vite")
  const outDir = Path.join(
    config.projectRoot,
    "node_modules/.cache/@effect/ui-native"
  )
  const file = `main.${platform}.js`
  const sourceExts = config.resolver?.sourceExts ??
    ["js", "jsx", "json", "ts", "tsx"]
  await build({
    configFile: false,
    root: config.projectRoot,
    mode: "production",
    logLevel: "warn",
    resolve: {
      // `production` drops the development checks of `@effect/ui`.
      conditions: ["react-native", "production", "import", "module", "default"],
      mainFields: [
        ...(config.resolver?.resolverMainFields ??
          ["react-native", "browser", "main"])
      ],
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
      rollupOptions: {
        external: (id) =>
          native.test(id) ||
          external.some((entry) =>
            typeof entry === "string"
              ? id === entry || id.startsWith(entry + "/")
              : entry.test(id)
          )
      }
    }
  })
  return Path.join(outDir, file)
}
