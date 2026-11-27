import { NativeMetro } from "@effect/ui-native/node"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
import { afterAll, assert, describe, it } from "vitest"

describe("NativeMetro.prebundle", () => {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "ui-native-prebundle-"))
  afterAll(() => Fs.rmSync(root, { recursive: true, force: true }))
  const write = (file: string, content: string) => {
    Fs.mkdirSync(Path.dirname(Path.join(root, file)), { recursive: true })
    Fs.writeFileSync(Path.join(root, file), content)
  }
  write("package.json", JSON.stringify({ main: "src/main.ts" }))
  write(
    "src/main.ts",
    `import { Platform } from "react-native"\nimport { title } from "./title"\nexport default [Platform, title]\n`
  )
  write("src/title.ts", `export const title = "plain title"\n`)
  write("src/title.native.ts", `export const title = "native title"\n`)
  write("src/title.android.ts", `export const title = "android title"\n`)
  const config = { projectRoot: root, resolver: { sourceExts: ["ts", "js"] } }

  it(
    "resolves app modules for the platform, as Metro does, and leaves React Native to Metro",
    async () => {
      const android = Fs.readFileSync(
        await NativeMetro.prebundle(config, "android"),
        "utf8"
      )
      const ios = Fs.readFileSync(
        await NativeMetro.prebundle(config, "ios"),
        "utf8"
      )
      assert.include(android, "android title")
      assert.notInclude(android, "native title")
      assert.include(ios, "native title")
      assert.notInclude(ios, "plain title")
      assert.match(android, /from "react-native"/)
    },
    30_000
  )
})
