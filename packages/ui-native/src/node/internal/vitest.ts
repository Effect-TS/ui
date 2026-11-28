/**
 * The setup file of `NativeVitest.plugin`. It registers Node loader hooks
 * that resolve React Native's platform files and compile its Flow sources
 * to CommonJS, as Metro and Jest do, and sets the globals its modules read
 * as they load.
 *
 * @internal
 */
import * as Crypto from "node:crypto"
import * as Fs from "node:fs"
import * as Module from "node:module"
import * as Path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// A file of `react-native` or an `@react-native/*` package, not of a
// package nested inside one.
const native =
  /[\\/]node_modules[\\/](?:react-native|@react-native[\\/][^\\/]+)[\\/](?!node_modules[\\/])/

const platform = process.env.EFFECT_UI_NATIVE_PLATFORM ?? "ios"
const cache = process.env.EFFECT_UI_NATIVE_CACHE
// Bump when the compiled output changes.
const version = "1"

const isFile = (path: string) =>
  Fs.statSync(path, { throwIfNoEntry: false })?.isFile() === true

let compiler: ((source: string, file: string) => string) | undefined

const compilerOf = () => {
  if (compiler !== undefined) return compiler
  const require = Module.createRequire(import.meta.url)
  let removeTypes: (source: string, options: object) => { toString(): string }
  let transform: (source: string, options: object) => { code: string }
  try {
    removeTypes = require("flow-remove-types")
    transform = require("sucrase").transform
  } catch (cause) {
    throw new Error(
      "NativeVitest needs flow-remove-types and sucrase to load React Native. Install both as dev dependencies.",
      { cause }
    )
  }
  return compiler = (source, file) =>
    transform(removeTypes(source, { all: true }).toString(), {
      transforms: ["imports"],
      filePath: file,
      preserveDynamicImport: true
    }).code
}

const compile = (file: string): string => {
  const { mtimeMs, size } = Fs.statSync(file)
  const cached = cache === undefined ? undefined : Path.join(
    cache,
    Crypto.createHash("sha1")
      .update(`${version}\0${file}\0${mtimeMs}\0${size}`)
      .digest("hex") + ".js"
  )
  if (cached !== undefined && isFile(cached)) {
    return Fs.readFileSync(cached, "utf8")
  }
  const code = compilerOf()(Fs.readFileSync(file, "utf8"), file)
  if (cached !== undefined) {
    // Written aside and renamed, as other workers may read it meanwhile.
    Fs.mkdirSync(cache!, { recursive: true })
    const temp = `${cached}.${process.pid}.${Math.random()}`
    Fs.writeFileSync(temp, code)
    Fs.renameSync(temp, cached)
  }
  return code
}

const variantOf = (url: string): string => {
  const base = fileURLToPath(url).slice(0, -3)
  for (const suffix of [platform, "native"]) {
    const file = `${base}.${suffix}.js`
    if (isFile(file)) return pathToFileURL(file).href
  }
  return url
}

const install = () => {
  if (typeof Module.registerHooks !== "function") {
    throw new Error("NativeVitest needs Node 22.15 or later.")
  }
  const g = globalThis as any
  g.__DEV__ ??= true
  g.nativeModuleProxy ??= {}
  const constants = { getConstants: () => ({}) }
  g.__turboModuleProxy ??= (name: string) =>
    name === "PlatformConstants" ? constants : null
  Module.registerHooks({
    resolve(specifier, context, next) {
      const parent = context.parentURL
      // Metro's order for a relative import: the platform's file, then
      // `.native`, then the plain one.
      if (
        specifier[0] === "." && parent !== undefined && native.test(parent)
      ) {
        const base = Path.resolve(
          Path.dirname(fileURLToPath(parent)),
          specifier
        )
        for (
          const suffix of [
            `.${platform}.js`,
            ".native.js",
            ".js",
            "",
            "/index.js"
          ]
        ) {
          if (isFile(base + suffix)) {
            return {
              url: pathToFileURL(base + suffix).href,
              shortCircuit: true
            }
          }
        }
      }
      const found = next(specifier, context)
      return native.test(found.url) && found.url.endsWith(".js")
        ? { ...found, url: variantOf(found.url) }
        : found
    },
    load(url, context, next) {
      if (
        !url.startsWith("file:") || !native.test(url) || !url.endsWith(".js")
      ) {
        return next(url, context)
      }
      return {
        format: "commonjs",
        source: compile(fileURLToPath(url)),
        shortCircuit: true
      }
    }
  })
}

// Setup files run before each test file, in workers that may be reused.
const installed = Symbol.for("@effect/ui-native/NativeVitest")
if ((globalThis as any)[installed] !== true) {
  ;(globalThis as any)[installed] = true
  install()
}
