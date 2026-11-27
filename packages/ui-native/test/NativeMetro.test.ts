import { NativeMetro } from "@effect/ui-native/node"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
import { afterAll, assert, describe, it } from "vitest"

describe("NativeMetro.withEffectUi", () => {
  const dirs: Array<string> = []
  afterAll(() => {
    for (const dir of dirs) Fs.rmSync(dir, { recursive: true, force: true })
  })
  // Vite reports real paths, as Metro does.
  const makeDir = () => {
    const dir = Fs.realpathSync(
      Fs.mkdtempSync(Path.join(Os.tmpdir(), "ui-native-prebundle-"))
    )
    dirs.push(dir)
    return dir
  }
  const root = makeDir()
  // Tests run concurrently, so each writes its pre-bundle in its own copy.
  const copy = () => {
    const dir = makeDir()
    Fs.cpSync(root, dir, { recursive: true })
    return dir
  }
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

  it(
    "swaps the resolved entry for a pre-bundle that resolves as Metro does",
    async () => {
      const env = process.env.NODE_ENV
      process.env.NODE_ENV = "production"
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
      }).finally(() => {
        process.env.NODE_ENV = env
      })
      // Metro resolves the entry to a file, as it does an import.
      const bundle = (platform: string) => {
        const found = config.resolver!.resolveRequest!(
          {
            dev: false,
            resolveRequest: () => ({
              type: "sourceFile",
              filePath: Path.join(root, "src/main.ts")
            })
          },
          "./src/main",
          platform
        )
        return Fs.readFileSync(found.filePath!, "utf8")
      }
      const android = bundle("android")
      const ios = bundle("ios")
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

  it("fails rather than resolve an import for another platform", async () => {
    const env = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const error = await NativeMetro.withEffectUi({
      projectRoot: copy(),
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
    ).finally(() => {
      process.env.NODE_ENV = env
    })
    assert.include(error?.message, "./title on platform null")
  }, 30_000)
})
