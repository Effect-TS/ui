import { NativeMetro } from "@effect/ui-native/node"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
import { afterAll, assert, beforeAll, describe, it, vi } from "vitest"

// Both cases build into one fixture as a release, so they run in turn.
describe("NativeMetro.withEffectUi", { concurrent: false }, () => {
  // Vite reports real paths, as Metro does.
  const root = Fs.realpathSync(
    Fs.mkdtempSync(Path.join(Os.tmpdir(), "ui-native-prebundle-"))
  )
  beforeAll(() => {
    vi.stubEnv("NODE_ENV", "production")
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    Fs.rmSync(root, { recursive: true, force: true })
  })
  const write = (file: string, content: string) => {
    Fs.mkdirSync(Path.dirname(Path.join(root, file)), { recursive: true })
    Fs.writeFileSync(Path.join(root, file), content)
  }
  write("package.json", JSON.stringify({ main: "src/main" }))
  write(
    "src/main.ts",
    `import { Platform } from "react-native"
import { title } from "./title"
import { flavor } from "./flavor"
import { topping } from "./topping"
export default [Platform, title, flavor, topping]
`
  )
  write("src/title.ts", `export const title = "plain title"\n`)
  write("src/title.native.ts", `export const title = "native title"\n`)
  write("src/title.android.ts", `export const title = "android title"\n`)
  write("src/flavor.ts", `export const flavor = "plain flavor"\n`)
  write("src/custom.ts", `export const flavor = "custom flavor"\n`)
  write("src/topping.ts", `export const topping = "plain topping"\n`)
  write("src/sauce.ts", `export const topping = "sauce topping"\n`)

  const readBundle = (
    config: NativeMetro.MetroConfig,
    entry: string,
    platform: string
  ) => {
    const found = config.resolver!.resolveRequest!(
      {
        dev: false,
        resolveRequest: () => ({
          type: "sourceFile",
          filePath: Path.join(root, entry)
        })
      },
      "./" + entry,
      platform
    )
    return Fs.readFileSync(found.filePath!, "utf8")
  }

  it(
    "swaps the resolved entry for a pre-bundle that resolves as Metro does",
    async () => {
      const config = await NativeMetro.withEffectUi({
        projectRoot: root,
        resolver: {
          sourceExts: ["ts", "js"],
          // One alias returns a file, the other renames the import.
          resolveRequest: (context, moduleName, platform) =>
            moduleName === "./flavor"
              ? {
                type: "sourceFile",
                filePath: Path.join(root, "src/custom.ts")
              }
              : context.resolveRequest(
                context,
                moduleName === "./topping" ? "./sauce" : moduleName,
                platform
              )
        }
      })
      const android = readBundle(config, "src/main.ts", "android")
      const ios = readBundle(config, "src/main.ts", "ios")
      assert.include(android, "android title")
      assert.include(ios, "native title")
      assert.notInclude(ios, "plain title")
      assert.include(android, "custom flavor")
      assert.notInclude(android, "plain flavor")
      assert.include(android, "sauce topping")
      assert.notInclude(android, "plain topping")
      assert.match(android, /from "react-native"/)
    },
    30_000
  )

  it(
    "drops an unused Native.defineView definition from the pre-bundle",
    async () => {
      const link = (name: string, target: string) => {
        Fs.mkdirSync(Path.join(root, "node_modules", Path.dirname(name)), {
          recursive: true
        })
        Fs.symlinkSync(target, Path.join(root, "node_modules", name))
      }
      const pkg = Path.resolve(import.meta.dirname, "..")
      link("@effect/ui-native", pkg)
      link("effect", Path.join(pkg, "node_modules/effect"))
      // Outside the package, whose `sideEffects` would drop the whole module.
      write(
        "src/toggle.ts",
        `import * as Native from "@effect/ui-native/Native"
export const toggle = Native.defineView(() => new Native.Element("toggle"), {
  viewName: "FixtureToggleView"
})
`
      )
      const app = (imports: string, child: string) =>
        `import * as Native from "@effect/ui-native/Native"
import * as NativeApp from "@effect/ui-native/NativeApp"
import * as Schema from "effect/Schema"
${imports}
const App = Native.component({ name: "App", model: Schema.Number }).make({
  init: () => 0,
  view: (h) => h.view.style({ flex: 1 }).children(${child})
})
NativeApp.register(NativeApp.mount(App, {}))
`
      write("src/plain.ts", app("", ""))
      write(
        "src/unused.ts",
        app(`import "@effect/ui-native/kit"\nimport "./toggle"`, "")
      )
      write("src/used.ts", app(`import { toggle } from "./toggle"`, "toggle"))
      const bundle = async (entry: string) => {
        const config = await NativeMetro.withEffectUi<NativeMetro.MetroConfig>(
          { projectRoot: root, resolver: { sourceExts: ["ts", "js"] } },
          { entry, platforms: ["android"] }
        )
        return readBundle(config, entry, "android")
      }
      assert.strictEqual(
        await bundle("src/unused.ts"),
        await bundle("src/plain.ts")
      )
      assert.include(await bundle("src/used.ts"), "FixtureToggleView")
    },
    30_000
  )

  it("fails rather than resolve an import for another platform", async () => {
    const error = await NativeMetro.withEffectUi({
      projectRoot: root,
      resolver: {
        sourceExts: ["ts", "js"],
        resolveRequest: (context, moduleName, platform) =>
          context.resolveRequest(
            context,
            moduleName,
            moduleName === "./title" ? null : platform
          )
      }
    }, { platforms: ["android"] }).then(
      () => undefined,
      (error: Error) => error
    )
    assert.include(error?.message, "./title on platform null")
  }, 30_000)
})
