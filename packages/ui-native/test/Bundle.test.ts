import { NativeMetro } from "@effect/ui-native/node"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
import { afterAll, assert, beforeAll, describe, it, vi } from "vitest"

describe("Native.defineView", () => {
  // Vite reports real paths, as Metro does.
  const root = Fs.realpathSync(
    Fs.mkdtempSync(Path.join(Os.tmpdir(), "ui-native-bundle-"))
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
export const toggle = Native.defineView(new Native.Element("toggle"), {
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
  write(
    "src/unused.ts",
    app(
      `import "@effect/ui-native/kit"
import "./toggle"`,
      ""
    )
  )
  write("src/used.ts", app(`import { toggle } from "./toggle"`, "toggle"))

  const bundle = async (entry: string) => {
    const config = await NativeMetro.withEffectUi<NativeMetro.MetroConfig>(
      { projectRoot: root, resolver: { sourceExts: ["ts", "js"] } },
      { entry, platforms: ["android"] }
    )
    const found = config.resolver!.resolveRequest!(
      {
        dev: false,
        resolveRequest: () => ({
          type: "sourceFile",
          filePath: Path.join(root, entry)
        })
      },
      "./" + entry,
      "android"
    )
    return Fs.readFileSync(found.filePath!, "utf8")
  }

  it(
    "is dropped from an app that imports it without rendering it",
    async () => {
      assert.notInclude(await bundle("src/unused.ts"), "FixtureToggleView")
      assert.include(await bundle("src/used.ts"), "FixtureToggleView")
    },
    30_000
  )
})
